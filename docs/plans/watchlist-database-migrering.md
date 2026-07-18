# Watchlist fra localStorage til database (Firebase/Firestore, usynlig anonym identitet)

> **Status:** planlagt 2026-07-18, ikke påbegynt. Dette er en plan, ikke en beskrivelse av gjeldende arkitektur — se `docs/architecture.md` for det som faktisk er implementert. Når arbeidet startes, spores det som GitHub-issues jf. `CLAUDE.md`, med denne filen som utgangspunkt for issue-oppdelingen.

## Kontekst

Watchlist er i dag en 100 % klient-side app uten backend: watchlisten lagres som én JSON-array i `localStorage` (`src/services/storage/watchlistStorage.ts`, konsumert via `WatchlistContext`), bundet til én nettleserprofil på én enhet. Det finnes ingen bruker- eller enhetsidentifikasjon i kodebasen i dag.

Brukeren vil bytte til en ekte database, uten å innføre innloggingsfriksjon. Etter avklaring er retningen: bruk **Firebase Anonymous Auth** helt usynlig i bakgrunnen — appen oppretter automatisk en autentisert (men anonym) sesjon ved første besøk, uten noe skjema eller synlig steg. Dette gir en ekte `auth.uid` som Firestore Security Rules kan håndheve mot («kun din egen watchlist»), i motsetning til en ren klient-generert enhets-ID, som ikke kan sikres server-side siden en delt API-nøkkel ikke beviser eierskap.

**Viktig avgrensning brukeren har bekreftet eksplisitt:** denne runden dekker *kun* selve databasebyttet under den anonyme identiteten. Ekte multi-device-synk (å koble to enheter til samme identitet via e-post/Google) er bevisst utenfor scope nå og tas som en egen, senere featureidé. **Det betyr at appen etter denne runden fortsatt er reelt enhets-bundet** — hver nettleserprofil får sin egen anonyme identitet — men er nå bygget på en arkitektur som gjør fremtidig linking billig å legge til uten ny datamodell.

**Firebase fremfor Supabase:** begge løser identifikasjons- og databehovet likt (anonym auth + senere identity-linking). Supabases gratisnivå **pauser prosjektet automatisk etter 7 dagers inaktivitet** (krever manuell gjenoppliving via dashbord) — et reelt problem for en watchlist-app som ikke nødvendigvis åpnes ukentlig. Firebase/Firestores gratisnivå (Spark) har ingen tidsbasert pausing, kun rundhåndede daglige kvoter. Dette avgjorde valget.

`MediaProvider`-laget (OMDb/MOTN-integrasjonen) røres ikke i det hele tatt.

## Identitet: `AuthContext`

Ny fil `src/services/auth/firebaseClient.ts` — modul-singleton, initialiserer Firebase App + Auth + Firestore fra `import.meta.env.VITE_FIREBASE_*`, samme sammensetningsrot-mønster som `services/media/index.ts`.

Ny `src/context/AuthContext.tsx`:
```ts
export interface AuthContextValue {
  userId: string | null;   // null inntil sesjonen er klar
  status: 'loading' | 'ready' | 'error';
}
```
Ved mount: `onAuthStateChanged` — er det ingen bruker, kalles `signInAnonymously(auth)` automatisk, helt usynlig. Ingen UI vises noensinne i denne runden — ingen innloggingsknapp, ingen "koble til enhet". `App.tsx` wrappes med `AuthProvider` **utenfor** `WatchlistProvider`, siden watchlist-lasting nå avhenger av `userId`.

(Bevisst utelatt fra grensesnittet i denne runden: `linkWithGoogle`/`linkWithEmailOtp` — det er neste rundes jobb og bygges ikke nå.)

## Datamodell (Firestore)

Subcollection per bruker, dokument-ID = `mediaId` (IMDb-ID) — beholder invarianten om at IMDb-ID er nøkkelen:

```
users/{uid}/watchlistItems/{mediaId}
  media: MediaSummary   // samme snapshot-form som i dag
  status: 'planned' | 'watched'
  addedAt: string        // ISO
  watchedAt?: string
```

**Firestore Security Rules** (`firestore.rules`, ny fil i repoet):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/watchlistItems/{mediaId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

`WatchlistItem`-typen i `src/types/watchlist.ts` endres ikke — den doblér nå som formen som mappes til/fra et Firestore-dokument.

## Arkitektur

Parallelt til `MediaProvider`-mønsteret: nytt async storage-grensesnitt i stedet for å bygge om den synkrone `LocalStorageWatchlistStorage`.

- **`src/services/storage/WatchlistStorage.ts`** (nytt grensesnitt):
  ```ts
  export interface WatchlistStorage {
    load(userId: string): Promise<WatchlistItem[]>;
    upsert(userId: string, item: WatchlistItem): Promise<void>;
    remove(userId: string, mediaId: string): Promise<void>;
    updateStatus(userId: string, mediaId: string, status: WatchlistStatus, watchedAt?: string): Promise<void>;
  }
  ```
- **`src/services/storage/FirestoreWatchlistStorage.ts implements WatchlistStorage`** — bruker `doc()`/`setDoc()`/`deleteDoc()`/`updateDoc()`/`getDocs(collection())` mot `users/{uid}/watchlistItems`.
- **`src/services/storage/watchlistStorage.ts`** (dagens localStorage-kode) beholdes **uendret**, men får ny rolle: offline-skriveputt og migreringskilde (se under), ikke lenger primær kilde.

**`WatchlistContext` bygges om, offentlig API uendret** — `items`, `addToWatchlist`, `removeFromWatchlist`, `setStatus`, `isInWatchlist`, `getStatus` beholder nøyaktig samme signaturer, slik at `WatchlistToggleButton`, `WatchlistItemCard`, `WatchlistTabs` osv. ikke trenger endres. Nye felt: `isLoading` (initial lasting fra Firestore) og `saveError` (utvidet til å dekke nettverksfeil, ikke bare full localStorage).

**Optimistic update + write-through:** `watchlistReducer` (ren funksjon) gjenbrukes uendret. Handlinger oppdaterer lokal state umiddelbart, skriver synkront write-through til `localStorage` (uendret eksisterende kode — gir øyeblikkelig reload-motstandsdyktighet og offline-evne), og sender asynkront tilsvarende operasjon til `FirestoreWatchlistStorage`. Feiler nettverkskallet: rull tilbake reducer-state, sett `saveError = true`. v1-avgrensning: optimistisk UI + retry ved reconnect (`window.addEventListener('online', ...)`), ingen full offline-synk-kø/konfliktløsning.

## Migrering av eksisterende localStorage-data

Ekte brukerdata skal bevares, ikke nullstilles (i motsetning til presedensen fra fase 10, der data uansett var testdata). Kjøres én gang per nettleserprofil rett etter at anonym sesjon er etablert og Firestore-watchlisten er lastet:

1. Les lokale items med eksisterende `loadWatchlistFromStorage()` (uendret).
2. Tom, eller migreringsflagget (`${DATA_KEY_PREFIX}migratedToCloud`) allerede satt: ingen ting å gjøre.
3. Ellers: skriv (`setDoc`, merge) alle lokale items til `users/{uid}/watchlistItems/{mediaId}` — lokal versjon vinner ved konflikt (enkel, forutsigbar regel, ingen konkurrerende skriver finnes ved *første* migrering).
4. Suksess → sett migreringsflagget. Feiler opplastingen (offline/nettverksfeil): flagget settes **ikke**, retry ved neste app-load. Lokale data slettes aldri før bekreftet vellykket migrering.

## Konsekvenser for CI/CD og hosting

- GitHub Pages forblir ren statisk hosting — Firebase JS SDK er en nettleser-trygg klient, ingen server kreves.
- Nye env-variabler (samme mønster som `VITE_OMDB_API_KEY`): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` — alle er designet for å være offentlige (sikkerheten ligger i Firestore Security Rules, ikke i hemmelighold), men legges likevel inn som GitHub Actions-secrets for konsistens med eksisterende mønster.
- **CSP** (`connect-src` i `index.html`-meta-taggen) må utvides med `https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com`.
- **Teknisk risiko å verifisere tidlig (issue A/B, samme prinsipp som CORS-verifiseringen i fase 10):** Firestore JS SDK bruker som standard WebChannel/long-polling-transport, som kan være vanskeligere å avskjære pålitelig med Playwrights `page.route()` enn Supabases enkle REST-kall. Anbefaling: sett `experimentalForceLongPolling: true` på Firestore-klienten, som gjør trafikken til vanlige HTTP-kall Playwright kan stubbe forutsigbart — verifiser dette konkret før resten av E2E-stubbingen bygges videre på det.
  - **Oppdatering fra issue C (empirisk verifisert mot et ekte Firebase-prosjekt):** antagelsen over viste seg feil. Selv med `experimentalForceLongPolling: true` bruker den fulle `firebase/firestore`-klienten fortsatt et stateful WebChannel-sesjonsprotokoll (håndtrykk, `RID`/`SID`/`AID`/`gsessionid`, strømtokens) for *alle* operasjoner, inkludert engangs `getDocs`/`setDoc` — upraktisk å stubbe pålitelig med `page.route()`. Løsningen ble i stedet å bytte til `firebase/firestore/lite` (`WatchlistStorage` bruker aldri realtime-lyttere), som bruker Firestores REST-API direkte og gir ordinære, ett-request-per-operasjon-kall — verifisert empirisk til å være rett frem å stubbe (se `e2e/fixtures/firestoreStub.ts` og PR-beskrivelsen for issue C).
- **Enhetstester:** ny testdobbel `src/test/mocks/createMockWatchlistStorage.ts` (parallelt til `createMockMediaProvider`), mocker `WatchlistStorage`-grensesnittet — ingen ekte Firebase-kall fra Vitest.
- **E2E:** `e2e/fixtures/apiStubs.ts` utvides (eller ny `firebaseStubs.ts`) med `page.route()` for auth- og Firestore-endepunktene. Ingen ekte Firebase-kall fra CI.

## Dokumentasjonskonsekvenser

- **`docs/architecture.md`:** åpningspremisset ("ingen backend") skrives om til "ingen server *vi selv drifter*". Ny seksjon om identitet (anonym auth) og datalagring (Firestore-skjema, security rules). "Flere faner"-risikoavsnittet utvides til også å nevne at flere *enheter* i denne runden får hver sin adskilte anonyme identitet (ekte multi-device er en fremtidig, ikke-implementert oppgave). "Kjente forutsetninger og risikoer" får nye punkter: Firebase-kvoter, at anonym-identitet er enhetsbundet inntil linking bygges, og migreringslogikkens bevisste valg om å bevare data (til forskjell fra fase 10s nullstilling). CSP-domenetabellen får Firebase-rader.
- **`docs/data-model.md`:** Firestore-skjemaet legges ved siden av TS-typene.
- **`README.md`/`.env.example`:** nye påkrevde miljøvariabler, kort steg for Firebase-prosjektoppsett.

## Issue-oppdeling (kjøres gjennom eksisterende agent-arbeidsflyt, én om gangen)

Rekkefølgen er bindende — auth må finnes før storage kan bruke `userId`; storage må finnes før migrering kan kjøre.

1. **Issue A — Firebase-prosjekt, Firestore-oppsett og klientkonfigurasjon.** Delvis brukeroppgave (opprette Firebase-prosjekt, aktivere Firestore + Anonymous-provider i Auth — gjøres av hovedsamtalen/bruker, ikke `dev`). `dev`-del: `firebase` npm-avhengighet, `src/services/auth/firebaseClient.ts`, `firestore.rules`, `.env.example`. Inkluderer verifisering av `experimentalForceLongPolling`-antagelsen for E2E-stubbing. DoD: app bygger/linter/tester grønt med ny avhengighet til stede men ubrukt av runtime-UI.
2. **Issue B — `AuthContext` med usynlig anonym innlogging.** `src/context/AuthContext.tsx`, `App.tsx` wrappes. Enhetstester med mocket Firebase Auth. DoD: anonym sesjon etableres og overlever reload, ingen regresjon i eksisterende flyter (watchlist leser fortsatt kun localStorage i denne issuen).
3. **Issue C — `WatchlistStorage`-abstraksjonen mot Firestore (kjernebyttet).** `WatchlistStorage`-grensesnitt, `FirestoreWatchlistStorage`, `WatchlistContext` bygges om til async/optimistic. E2E-fixtures utvides. Vurder å splitte i C1 (storage + enhetstester) og C2 (`WatchlistContext`-ombygging) hvis for stor for én PR. DoD: watchlist-endringer persisteres til Firestore, verifisert manuelt via Firebase-konsollen.
4. **Issue D — Migrering av eksisterende localStorage-watchlist.** Engangs migreringslogikk + flagg. Enhetstester for tomt/ikke-tomt utgangspunkt. DoD: en forhåndsseedet lokal fixture med ekte IMDb-ID-er dukker opp i Firestore etter første app-load post-utrulling.
5. **Issue E — Dokumentasjonskonsolidering.** Kort gjennomgangsrunde av `docs/architecture.md`/`docs/data-model.md` mot faktisk implementert løsning, hvis inline docs-oppdateringer per issue har latt noe drifte.

**Bevisst utenfor scope nå** (fremtidig featureidé, ikke egne issues): valgfri konto-linking-UI for ekte multi-device-synk (e-post-OTP eller Google via `linkWithCredential`), Realtime-synk mellom åpne enheter, offline-first synk-kø.

## Verifisering

- `npm run lint && npm test && npm run build` grønt etter hver issue.
- Manuell drift av watchlist-flyten (legge til, fjerne, statusbytte) mot ekte Firestore-prosjekt etter issue C, verifisert i Firebase-konsollen.
- Manuell verifisering av migrering (issue D): seed lokal `localStorage` med kjente IMDb-ID-er før første Firestore-tilkobling, bekreft de dukker opp i Firestore og at migreringsflagget hindrer duplisering ved neste reload.
- CI (lint, enhetstester, E2E mot stubbet Firebase-trafikk, `npm audit`, build) grønn før merge, som i dag.
