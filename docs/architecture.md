# Arkitektur

## Overordnet lagdeling

Appen er en ren klient-applikasjon (SPA): all UI-logikk kjører i nettleseren, og det finnes ingen server *vi selv drifter*. Frem til DB-migreringen (se [Identitet og datalagring](#identitet-og-datalagring-firebase)) betydde det "ingen backend i det hele tatt" — all persistert state lå i `localStorage`. Fra og med DB-migreringen bruker appen **Firebase/Firestore** som en administrert (managed) backend-tjeneste: watchlisten persisteres i Firestore under en anonym Firebase-auth-identitet, men det finnes fortsatt ingen egen serverkode, ingen API-nøkler å skjule server-side, og ingen infrastruktur vi selv vedlikeholder — Firebase-prosjektet er konfigurasjon og sikkerhetsregler (`firestore.rules`), ikke driftsansvar. `localStorage` brukes fortsatt, både som cache for OMDb/MOTN-data (uendret) og som en synkron offline-skriveputt for watchlisten (skrives til ved siden av Firestore, se [Identitet og datalagring](#identitet-og-datalagring-firebase)).

```
UI (routes, komponenter)
   ↓ bruker
hooks / context (useMediaSearch, useMediaDetails, useWatchlist, useSpeechRecognition)
   ↓ bruker
services/media (MediaProvider-interface)
   → CachingMediaProvider (dekoratør)
       → LocalStorageCacheStore (services/cache)
       → konkret MediaProvider
           MockMediaProvider (fase 1–9)
           CompositeMediaProvider (fase 10) → OmdbMediaProvider + MotnMediaProvider
```

**Kjerneregel:** UI, hooks og domenetyper kjenner **kun** `MediaProvider`-interfacet — aldri OMDb-/MOTN-spesifikke felter eller responsformater. Dette gjør det mulig å bygge og teste hele appen med en `MockMediaProvider` før ekte API-er kobles på, og å bytte/utvide datakilde senere uten å røre UI-laget.

## Datakilder

To API-er, med klart delt ansvar. Begge er verifisert (2026-07-16) til å svare over https med `access-control-allow-origin: *` — direkte kall fra nettleseren fungerer uten proxy, så "ingen backend"-kravet holder.

| Kilde | Ansvar | Base-URL | Auth | Gratiskvote |
|---|---|---|---|---|
| **OMDb** | Søk, og alle titteldata: beskrivelse, sjanger, plakat, IMDb-score, RT-score | `https://www.omdbapi.com/` | `?apikey=` i query | 1 000 req/døgn |
| **Movie of the Night** (MOTN) | Kun strømmetilgjengelighet | `https://api.movieofthenight.com/v4` | `X-API-Key`-header | 100 req/døgn |

**IMDb-ID-en er limet.** OMDbs søk (`?s=`) returnerer `imdbID` per treff, og MOTNs `/shows/{id}` godtar en IMDb-ID direkte på formen `tt<nummer>`. Derfor:

- `Media.id` **er** IMDb-ID-en (`tt0133093`) — ikke en provider-prefikset streng. Ruten blir `/title/tt0133093`.
- Detaljsiden har allerede ID-en fra URL-en, så `OmdbMediaProvider.getDetails()` og `MotnMediaProvider.getStreaming()` kalles **parallelt** (`Promise.all`) — det finnes ingen sekvensiell avhengighet mellom dem.
- ID-en er stabil på tvers av datakilder. Bytter man ut OMDb eller MOTN senere, er watchlisten fortsatt gyldig.

**Kvotene treffes ulikt:** søk koster kun ett OMDb-kall (MOTN røres ikke), og MOTNs strengere grense på 100/døgn brukes bare ved detaljvisning. Plakater hentes fra OMDb, så MOTNs bildebåndbredde (1 GB/mnd på gratisplanen) brukes aldri.

### CompositeMediaProvider

```ts
// services/media/providers/CompositeMediaProvider.ts
export class CompositeMediaProvider implements MediaProvider {
  readonly id = 'composite';

  constructor(
    private readonly catalog: OmdbMediaProvider,
    private readonly streaming: MotnMediaProvider,
  ) {}

  search(query: string, options?: SearchOptions): Promise<MediaSummary[]> {
    return this.catalog.search(query, options); // kun OMDb
  }

  async getDetails(id: string, options?: DetailsOptions): Promise<Media> {
    const [media, streaming] = await Promise.all([
      this.catalog.getDetails(id, options),
      this.streaming.getStreaming(id, options).catch(() => null), // MOTN-bom ≠ feilet oppslag
    ]);
    return { ...media, streaming };
  }
}
```

**MOTN-bom er en normaltilstand, ikke en feil.** En tittel som ikke strømmes i Norge finnes ikke i MOTN. Det gir `streaming: null` og en detaljside som rendres komplett på OMDb-data alene — et MOTN-avvik skal aldri kunne velte hele oppslaget. Kun `catalog.getDetails()` kan avvise med `MediaProviderError`.

### OMDb-mapping — kjente fallgruver

OMDbs responsformat krever mer forsvar i mappingen enn responsformater flest:

- **HTTP 200 ved bom.** «Fant ikke tittelen» kommer som `200 OK` med `{"Response": "False", "Error": "Movie not found!"}`. Feilmappingen må derfor sjekke `Response`-feltet, ikke bare HTTP-status — ellers passerer en bom som gyldig respons og kræsjer først i UI.
- **Alt er strenger.** `imdbRating: "8.7"`, `totalSeasons: "3"`, `Year: "1999–2003"` (med tankestrek for serier). Må parses, og parse-feil må gi `null` — ikke `NaN`.
- **`"N/A"` i stedet for `null`.** Gjelder `Poster`, `totalSeasons`, `imdbRating` m.fl. Strengen `"N/A"` mappes til `null` for hvert felt.
- **RT-score ligger i et array**, ikke i et eget felt: `Ratings: [{ "Source": "Rotten Tomatoes", "Value": "87%" }]`. Finn på `Source`, strip `%`, parse til tall. Mangler ofte helt.
- **Søk gir maks 10 treff per side** (mot MOTNs 20). Med "kun side 1 i v1" betyr det 10 resultater.

## Identitet og datalagring (Firebase)

DB-migreringen (issue A–D, se `docs/plans/watchlist-database-migrering.md`) flytter watchlisten fra kun `localStorage` til **Firebase/Firestore**, med **usynlig anonym autentisering** som identitet — ingen innloggingsskjema, ingen synlig steg. `MediaProvider`-laget (OMDb/MOTN) er upåvirket av dette; det gjelder utelukkende watchlist-persistering.

### Identitet: `AuthContext`

```ts
// context/AuthContext.tsx
export type AuthStatus = 'loading' | 'ready' | 'error';
export interface AuthContextValue {
  userId: string | null; // null inntil den anonyme sesjonen er klar
  status: AuthStatus;
}
```

`AuthProvider` wrapper `App.tsx` **utenfor** `WatchlistProvider`, siden watchlist-hydrering avhenger av `userId`. Ved mount lyttes det på `onAuthStateChanged` (fra `firebase/auth`, full SDK — kun `firebase/firestore` er byttet til lite-varianten, se under); finnes ingen bruker fra før, kalles `signInAnonymously` automatisk. Dette gir en ekte `auth.uid` som Firestore Security Rules kan håndheve mot, i motsetning til en klient-generert enhets-ID som ikke beviser eierskap server-side.

**Enhetsbundet, ikke kontobundet identitet:** Firebase persisterer den anonyme sesjonen i nettleserens lokale lagring, så den overlever reload og gjenåpning av samme nettleserprofil — men er **ikke** knyttet til noen e-post, Google-konto eller annen gjenkjennbar identitet. En ny nettleserprofil, en annen enhet, inkognitomodus, eller at brukeren rydder nettleserdata, gir en **helt ny, tom** anonym identitet uten noen kobling til den forrige. Ekte multi-device-synk (koble flere enheter til samme identitet via e-post-OTP eller Google, `linkWithCredential`) er bevisst utenfor scope i denne runden — en fremtidig, ikke-implementert oppgave. Se også nyansen til "flere faner" under [State management](#state-management).

### Datalagring: Firestore

**Skjema** — én subcollection per bruker, dokument-ID = `mediaId` (IMDb-ID), som bevarer invarianten om at IMDb-ID-en er den delte nøkkelen på tvers av hele appen (se [Datakilder](#datakilder)):

```
users/{uid}/watchlistItems/{mediaId}
  media: MediaSummary       // samme lette snapshot-form som i WatchlistItem
  status: 'planned' | 'watched'
  addedAt: string            // ISO
  watchedAt?: string          // kun til stede når status er 'watched'
```

Se [data-model.md](./data-model.md#firestore-skjema) for feltdetaljer og runtime-validering ved lesing.

**Security rules** (`firestore.rules`, repo-rot):

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

Ingen kan lese eller skrive andre brukeres `watchlistItems` — sikkerheten ligger i disse reglene, håndhevet server-side av Firestore, ikke i hemmelighold av Firebase-klientkonfigurasjonen (som er designet for å være offentlig, se [Kjente forutsetninger og risikoer](#kjente-forutsetninger-og-risikoer)).

### `firebase/firestore/lite`, ikke full `firebase/firestore`

**Viktig revidert vurdering:** den opprinnelige planen (issue A) antok, uten et ekte Firebase-prosjekt å teste mot, at `experimentalForceLongPolling: true` på den fulle `firebase/firestore`-klienten ville gjøre trafikken til «ordinære, diskrete HTTP-kall» som Playwrights `page.route()` kunne stubbe forutsigbart for E2E. Empirisk verifisering mot et ekte Firebase-prosjekt (issue C) motbeviste dette: selv med den innstillingen bruker den fulle SDK-en fortsatt et *stateful* WebChannel-sesjonsprotokoll (håndtrykk, `RID`/`SID`/`AID`/`gsessionid`, strømtokens) for *alle* operasjoner, inkludert engangs `getDocs`/`setDoc` — upraktisk å stubbe pålitelig med `page.route()`, som svarer på enkeltstående request/response-par, ikke en flertrinns håndtrykk-sekvens.

`WatchlistStorage` (se under) bruker aldri realtime-lyttere (`onSnapshot`) — kun engangs `getDoc(s)`/`setDoc`/`updateDoc`/`deleteDoc`. Løsningen ble derfor å bytte `firebaseClient.ts`/`FirestoreWatchlistStorage.ts` til **`firebase/firestore/lite`**, som er bygget nøyaktig for dette bruksmønsteret: den mangler realtime-lyttere/offline-persistens, men bruker Firestores REST-API direkte — ett diskret `fetch`-kall per operasjon (`POST .../documents:runQuery` for lesing, `POST .../documents:commit` for skriving). Dette gir ordinære, stubbare HTTP-kall for E2E (se `e2e/fixtures/firestoreStub.ts`) og en mindre bunt (bekreftet fall fra 830 kB til 464 kB i issue C). `firebase/auth` er upåvirket av dette byttet og bruker fortsatt den fulle SDK-en.

### `WatchlistStorage`-abstraksjonen

Parallelt til `MediaProvider`-mønsteret: `WatchlistContext` er uavhengig av hvilken database som faktisk ligger bak grensesnittet.

```ts
// services/storage/WatchlistRemoteStorage.ts
export interface WatchlistStorage {
  load(userId: string): Promise<WatchlistItem[]>;
  upsert(userId: string, item: WatchlistItem): Promise<void>;
  remove(userId: string, mediaId: string): Promise<void>;
  updateStatus(userId: string, mediaId: string, status: WatchlistStatus, watchedAt?: string): Promise<void>;
}
```

`FirestoreWatchlistStorage` (`services/storage/FirestoreWatchlistStorage.ts`) er den eneste implementasjonen i produksjon, sammensatt i `services/storage/index.ts` (samme sammensetningsrot-mønster som `services/media/index.ts`). Filen heter bevisst `WatchlistRemoteStorage.ts`, ikke `WatchlistStorage.ts` som planen opprinnelig spesifiserte — det kolliderer bokstavelig med det allerede eksisterende, urørte `watchlistStorage.ts` (den synkrone `localStorage`-koden) på et versjonsufølsomt-men-ikke-store/små-bokstaver-filsystem (macOS' APFS-standardoppsett). Det eksporterte grensesnittnavnet er likevel nøyaktig `WatchlistStorage` som spesifisert — kun filbanen er endret.

`WatchlistContext` bruker `WatchlistStorage` som write-through-lag oppå den eksisterende, urørte `localStorage`-skriveputten (se [State management](#state-management) for hele flyten): optimistic update → synkron `localStorage`-skriving → asynkron Firestore-skriving. Feiler Firestore-skrivingen, rulles kun den aktuelle handlingens egen effekt tilbake, ikke hele tilstanden.

### Migrering av eksisterende `localStorage`-data

`src/services/storage/migrateLocalWatchlistToCloud.ts` kjører **én gang** per nettleserprofil, rett etter at den anonyme sesjonen er etablert og den *initiale* Firestore-hentingen er fullført:

1. Er migreringsflagget (`watchlist:v2:data:migratedToCloud`, i samme data-navnerom som selve watchlisten) allerede satt: ingenting å gjøre.
2. Er den lokale watchlisten tom: ingenting å *migrere*, men flagget settes likevel — ellers ville sjekket blitt forsøkt på nytt ved hvert påfølgende app-load, for evig, for enhver bruker som aldri hadde noen lokal watchlist.
3. Ellers skrives (`upsert`, som overskriver hele dokumentet) alle lokale elementer til Firestore. **Bevisst valg: lokal versjon vinner ved konflikt** — til forskjell fra nullstillingen som ble gjort ved API-byttet i fase 10 (se [Kjente forutsetninger og risikoer](#kjente-forutsetninger-og-risikoer)), er hensikten her å *bevare* eksisterende brukerdata inn i den nye databasen, ikke å starte blankt.
4. Lykkes alle skrivingene, settes migreringsflagget. Feiler ett eller flere forsøk (f.eks. offline), settes flagget **ikke** — et senere app-load prøver på nytt. `localStorage` er urørt av funksjonen uansett utfall; lokale data slettes aldri av migreringen selv.

Migrerte elementer vises i UI-et selv om selve opplastingen feiler (kjente, gyldige lokale data skal ikke fremstå som forsvunnet mens migreringen venter på et senere retry-forsøk) — `saveError` settes i stedet.

**Kjent, akseptert kant (ikke fikset):** migrering og vanlig watchlist-synk deler samme grunnleggende begrensning som "flere faner" alltid har hatt (se [State management](#state-management)) — det finnes ingen låsing mot at to faner/vinduer på samme nettleserprofil kjører migrering eller skriver samtidig. I det (sjeldne) tilfellet vinner siste skriving, akkurat som for enhver annen samtidig watchlist-endring i v1.

## Prosjektstruktur

```
watchlist/
├── index.html
├── vite.config.ts              # inkl. vitest-konfigurasjon (jsdom, exclude: ['e2e/**']), base: '/watchlist/', Tailwind v4-plugin
├── playwright.config.ts        # E2E; webServer starter vite preview mot produksjonsbygget
├── .nvmrc                       # pinnet Node LTS (npm som pakkebehandler, jf. "engines" i package.json)
├── .github/workflows/ci.yml    # lint + enhetstester + E2E + npm audit + deploy til GitHub Pages
├── firestore.rules              # Security rules for DB-migreringen, se «Identitet og datalagring»
├── e2e/
│   ├── search.spec.ts           # fase 5
│   ├── watchlist.spec.ts        # fase 7
│   ├── deep-links.spec.ts       # fase 9
│   ├── api-integration.spec.ts  # fase 10, ekte API-integrasjon (stubbet)
│   ├── smoke.spec.ts            # triviell røyktest for /watchlist/-understien
│   ├── watchlist-migration.spec.ts   # DB-migrering issue D
│   └── fixtures/
│       ├── apiStubs.ts          # page.route-stubber for OMDb/MOTN
│       ├── firebaseAuthStub.ts  # stubber anonym Firebase Auth-flyten
│       └── firestoreStub.ts     # stateful in-memory page.route-stub for Firestore REST-kallene
├── tsconfig.json
├── package.json
├── .env.example                 # VITE_OMDB_API_KEY, VITE_MOTN_API_KEY (se fase 10), VITE_FIREBASE_* (DB-migrering)
├── docs/
└── src/
    ├── main.tsx
    ├── App.tsx                  # BrowserRouter, NavBar, Routes, top-level providers
    ├── routes/
    │   ├── HomePage.tsx          # søk (tekst + tale)
    │   ├── WatchlistPage.tsx     # planlagt / sett
    │   ├── TitleDetailPage.tsx   # detaljvisning
    │   └── NotFoundPage.tsx
    ├── components/
    │   ├── layout/
    │   │   ├── NavBar.tsx
    │   │   └── PageContainer.tsx
    │   ├── search/
    │   │   ├── SearchBar.tsx
    │   │   ├── VoiceSearchButton.tsx
    │   │   ├── SearchResultsGrid.tsx
    │   │   └── SearchResultCard.tsx
    │   ├── media/
    │   │   ├── PosterImage.tsx          # håndterer manglende bilde -> placeholder
    │   │   ├── RatingsBadge.tsx         # håndterer manglende score -> "ikke tilgjengelig"
    │   │   ├── GenreTags.tsx
    │   │   └── StreamingProvidersList.tsx
    │   ├── watchlist/
    │   │   ├── WatchlistToggleButton.tsx
    │   │   ├── WatchlistStatusBadge.tsx
    │   │   ├── WatchlistTabs.tsx
    │   │   └── WatchlistItemCard.tsx
    │   └── common/
    │       ├── LoadingSpinner.tsx
    │       ├── ErrorMessage.tsx
    │       └── EmptyState.tsx
    ├── hooks/
    │   ├── useMediaSearch.ts
    │   ├── useMediaDetails.ts
    │   ├── useSpeechRecognition.ts
    │   └── useLocalStorage.ts
    ├── context/
    │   ├── MediaProviderContext.tsx   # DI av konfigurert MediaProvider
    │   ├── AuthContext.tsx            # DB-migrering: usynlig anonym Firebase-sesjon
    │   └── WatchlistContext.tsx       # useReducer + persistering (localStorage + Firestore write-through)
    ├── services/
    │   ├── media/
    │   │   ├── MediaProvider.ts
    │   │   ├── CachingMediaProvider.ts
    │   │   └── providers/
    │   │       └── MockMediaProvider.ts   # fase 10: OmdbMediaProvider.ts, MotnMediaProvider.ts, CompositeMediaProvider.ts
    │   ├── cache/
    │   │   ├── CacheStore.ts
    │   │   ├── LocalStorageCacheStore.ts
    │   │   └── cacheKeys.ts
    │   ├── auth/
    │   │   └── firebaseClient.ts      # sammensetningsrot: Firebase App + Auth + Firestore (lite)
    │   └── storage/
    │       ├── watchlistStorage.ts            # uendret: synkron localStorage-skriveputt + migreringsflagg
    │       ├── WatchlistRemoteStorage.ts       # eksporterer `WatchlistStorage`-grensesnittet
    │       ├── FirestoreWatchlistStorage.ts    # `WatchlistStorage` mot Firestore (firebase/firestore/lite)
    │       ├── migrateLocalWatchlistToCloud.ts # engangsmigrering, se «Identitet og datalagring»
    │       └── index.ts                        # sammensetningsrot: `watchlistStorage`-instansen
    ├── types/
    │   ├── media.ts
    │   ├── watchlist.ts
    │   └── cache.ts
    ├── utils/
    │   ├── normalizeQuery.ts
    │   └── storageKeys.ts
    └── test/
        ├── setupTests.ts
        ├── testUtils.tsx               # renderWithProviders()
        ├── fixtures/media.fixtures.ts
        └── mocks/
            ├── createMockMediaProvider.ts
            └── createMockWatchlistStorage.ts   # testdobbel for `WatchlistStorage`
```

Komponent-/hook-tester kolokaliseres (f.eks. `SearchBar.test.tsx` ved siden av `SearchBar.tsx`). Delt testinfrastruktur ligger i `src/test/`. E2E-tester ligger utenfor `src/`, i `e2e/`.

## Teststrategi

To nivåer, med ulikt ansvar:

| Nivå | Verktøy | Filnavn | Dekker |
|---|---|---|---|
| Enhet/komponent | Vitest + React Testing Library | `*.test.ts(x)` i `src/`, kolokalisert | Provider-mapping, cache-logikk, reducers, enkeltkomponenter og deres tilstander |
| E2E | Playwright | `*.spec.ts` i `e2e/` | Brukerflyter gjennom hele appen i ekte nettleser: søk → detalj → watchlist, persistens over reload, dyplenker |

**`e2e/` må ekskluderes fra Vitest** (`test.exclude: ['e2e/**']` i `vite.config.ts`). Begge rammeverk plukker opp `*.spec.ts` som standard, og uten ekskluderingen forsøker Vitest å kjøre Playwright-spec-ene og feiler på `import { test } from '@playwright/test'`. Konvensjonen `*.test.ts` for enhetstester og `*.spec.ts` for E2E holder de to fra hverandre også visuelt.

**E2E kjører mot stubbet nettverk.** `page.route()` avskjærer alle kall til OMDb og MOTN og svarer med fixtures fra `e2e/fixtures/apiStubs.ts`:

```ts
await page.route('**/omdbapi.com/**', route =>
  route.fulfill({ json: omdbSearchFixture }),
);
await page.route('**/api.movieofthenight.com/**', route =>
  route.fulfill({ status: 404 }), // tittel som ikke strømmes i Norge
);
```

Tre grunner til at dette ikke er et kompromiss, men det riktige valget:
1. **Kvote.** MOTN gir 100 kall/døgn. En E2E-suite mot ekte API på hver push ville tømt den, og CI ville blitt rødt av kvotefeil uten at noe var galt med koden.
2. **Determinisme.** Ekte katalogdata endres — strømmetilbud kommer og går. Tester som påstår noe om hvor «The Matrix» strømmes, brekker av seg selv.
3. **Feiltilstander.** 429, MOTN-404 og OMDbs `Response: "False"` kan ikke fremprovoseres mot ekte API. Stubbing er den eneste måten å teste dem i nettleser.

Prisen er at E2E ikke fanger opp at API-kontrakten endrer seg. Det er en akseptert avveining: kontraktsbrudd fanges av at appen feiler ved manuell bruk, og fixtures oppdateres da. Ingen røyktest mot ekte API i v1.

**E2E kjører mot produksjonsbygget** (`vite preview`), ikke dev-serveren. Det er bevisst — `base: '/watchlist/'`, `basename` og 404.html-fallbacken finnes kun i bygget app, og feil i akkurat de tre tingene er usynlige i `npm run dev`.

**Ikke dekket av E2E:** talesøk (Web Speech API krever ekte mikrofoninput og kan ikke drives fra Playwright — dekkes av enhetstester med mocket `SpeechRecognition` + manuell test i Chrome) og visuell regresjon (ingen screenshot-diffing i v1).

## MediaProvider-abstraksjonen

```ts
// services/media/MediaProvider.ts
export interface SearchOptions { signal?: AbortSignal }
export interface DetailsOptions { signal?: AbortSignal }

export type MediaProviderErrorCode =
  'network' | 'not-found' | 'rate-limit' | 'invalid-response' | 'unknown';

// Eksplisitte felt (ikke parameter properties) — tsconfig har `erasableSyntaxOnly: true`,
// som forbyr TS-syntaks med runtime-semantikk.
export class MediaProviderError extends Error {
  readonly code: MediaProviderErrorCode;

  constructor(message: string, code: MediaProviderErrorCode, cause?: unknown) {
    super(message, { cause });
    this.name = 'MediaProviderError';
    this.code = code;
  }
}

export interface MediaProvider {
  readonly id: string; // 'mock' | 'composite' | ...
  search(query: string, options?: SearchOptions): Promise<MediaSummary[]>;
  getDetails(id: string, options?: DetailsOptions): Promise<Media>;
}
```

Søk og detaljer returnerer bevisst **ulike** typer (`MediaSummary` vs. `Media`): de fleste film-APIer gir kun lett metadata i søkeresultater, mens rating og strømmetjenester krever et eget detaljkall. Typene er definert i [data-model.md](./data-model.md).

**Paginering:** `search()` returnerer bevisst kun første resultatside i v1 — interfacet har ingen side-parameter. Reelle API-er paginerer; trengs flere sider senere, utvides `SearchOptions` med `page` uten å endre metodesignaturen.

### CachingMediaProvider (dekoratør)

```ts
// services/media/CachingMediaProvider.ts
export interface CachingProviderTtlConfig {
  searchTtlMs: number;
  detailsTtlMs: number;
}

export class CachingMediaProvider implements MediaProvider {
  readonly id: string;

  constructor(
    private readonly inner: MediaProvider,
    private readonly cache: CacheStore,
    private readonly ttl: CachingProviderTtlConfig,
  ) {
    this.id = inner.id;
  }

  async search(query: string, options?: SearchOptions): Promise<MediaSummary[]> {
    const key = buildSearchCacheKey(this.id, query);
    const cached = this.cache.get<MediaSummary[]>(key);
    if (cached) return cached;

    const result = await this.inner.search(query, options);
    this.cache.set(key, result, this.ttl.searchTtlMs);
    return result;
  }

  async getDetails(id: string, options?: DetailsOptions): Promise<Media> {
    const key = buildDetailsCacheKey(this.id, id);
    const cached = this.cache.get<Media>(key);
    if (cached) return cached;

    const result = await this.inner.getDetails(id, options);
    this.cache.set(key, result, this.ttl.detailsTtlMs);
    return result;
  }
}
```

`CachingMediaProvider` implementerer samme interface som det den wrapper, så resten av appen ser aldri forskjell på cachet og ikke-cachet provider. Sammensetning skjer ett sted:

```ts
// services/media/index.ts (sammensetningsrot)
const realProvider: MediaProvider = new MockMediaProvider(); // fase 10: new CompositeMediaProvider(omdb, motn)
export const mediaProvider: MediaProvider = new CachingMediaProvider(
  realProvider,
  new LocalStorageCacheStore(),
  { searchTtlMs: 48 * 60 * 60 * 1000, detailsTtlMs: 24 * 60 * 60 * 1000 },
);
```

`MockMediaProvider` brukes både som midlertidig app-drivende provider (frem til `CompositeMediaProvider` ble tatt i bruk, se [Datakilder](#datakilder)) og som testdobbel-mal.

**RT-score:** `ratings.rottenTomatoesScore` er alltid `number | null` gjennom hele stacken. OMDb leverer RT-score via sitt `Ratings`-array, men kun for et delsett av titlene — feltet mangler i praksis ofte. `RatingsBadge`-komponenten må ha en eksplisitt "score ikke tilgjengelig"-tilstand.

## Cache-design

```ts
// services/cache/CacheStore.ts
export interface CacheStore {
  get<T>(key: string): T | null;      // null = mangler eller utløpt
  set<T>(key: string, value: T, ttlMs: number): void;
  remove(key: string): void;
  clear(): void;                       // kun cache-navnerom, ikke watchlist-data
}
```

**Nøkkelstrategi** (`cacheKeys.ts`):
- Query normaliseres før nøkkelbygging: `normalizeQuery(q) = q.trim().toLowerCase().replace(/\s+/g, ' ')`.
- `buildSearchCacheKey(providerId, normalizedQuery)` → `watchlist:v1:cache:search:${providerId}:${normalizedQuery}`
- `buildDetailsCacheKey(providerId, id)` → `watchlist:v1:cache:details:${providerId}:${id}`
- `v1`-versjonsprefiks samles i `utils/storageKeys.ts`. **Policyen er ulik for de to navnerommene:** cache-navnerommet (`watchlist:v1:cache:`) kan bumpes fritt ved datamodell-endring — innholdet er bare cache og kan alltid hentes på nytt. Data-navnerommet (`watchlist:v1:data:`) inneholder brukerdata; å bumpe den versjonen betyr å slette watchlisten og gjøres kun som en bevisst éngangsbeslutning (gjort ved byttet til ekte API — se «Watchlisten nullstilles ved API-byttet» nedenfor) — aldri som rutinemessig invalidering.

**TTL:**
- Søkeresultatlister: 48 timer.
- Detaljer (inkl. strømmetilgjengelighet): 24 timer — strømmetilbud endrer seg oftest, så hele detaljobjektet settes på kortere TTL fremfor å splitte i separate cacher for rating vs. streaming (unødvendig kompleksitet i v1).
- TTL sendes inn som konfigurasjon til `CachingMediaProvider`, ikke hardkodet i cache-laget.

**Kvotehåndtering (`localStorage` ~5–10 MB):**
1. `LocalStorageCacheStore.set()` fanger `QuotaExceededError`.
2. Ved kvote-feil: fjern først alle allerede utløpte cache-oppføringer (prefiks `watchlist:v1:cache:`). Hvis fortsatt ikke plass, fjern eldste (`cachedAt` stigende) til skriving lykkes eller en øvre iterasjonsgrense nås.
3. Hvis skriving fortsatt feiler: gi opp stille (`console.warn`) — cache er "best effort" og skal **aldri** kunne blokkere eller kræsje appen, siden verdien uansett returneres fra kallet som trigget cache-set.
4. `JSON.parse`/`stringify` wrappes i try/catch ved lesing — korrupt cache-entry behandles som cache-miss og fjernes stille.
5. Watchlist-data lagres med eget prefiks (`watchlist:v1:data:items`), adskilt fra cache-navnerommet, slik at `cache.clear()` aldri kan slette watchlisten ved et uhell.
6. Skriving av **watchlist** har motsatt policy av cache: den skal **ikke** feile stille — det er brukerens data. Ved `QuotaExceededError` i `saveWatchlistToStorage`: fjern cache-oppføringer (utløpte først, deretter eldste) for å frigjøre plass og prøv igjen; feiler skrivingen fortsatt, vises en synlig feilmelding om at endringen ikke ble lagret.

## State management

**React Context + `useReducer`, ingen Redux/Zustand/react-query.**

Appen har kun to reelle delte tilstander på tvers av komponenter: watchlist-innhold og hvilken `MediaProvider`-instans som er aktiv (ren DI). Søk/lasting/feil-tilstand er lokal til den enkelte side og trenger ikke globalt store. For en enkeltbruker-app uten synkronisering eller komplekse selectors gir Redux/Zustand kun ekstra avhengighet uten reell gevinst, og react-query/SWR ville vært et redundant andre cache-lag oppå den cache-mekanismen appen allerede har i domenelaget.

```ts
// context/WatchlistContext.tsx
type WatchlistAction =
  | { type: 'ADD'; item: WatchlistItem }
  | { type: 'REMOVE'; mediaId: string }
  | { type: 'SET_STATUS'; mediaId: string; status: WatchlistStatus };

function watchlistReducer(state: WatchlistItem[], action: WatchlistAction): WatchlistItem[] { /* ... */ }

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [items, dispatch] = useReducer(watchlistReducer, undefined, loadWatchlistFromStorage);
  useEffect(() => saveWatchlistToStorage(items), [items]);
  // memoized actions: addToWatchlist, removeFromWatchlist, setStatus, isInWatchlist
}

export function useWatchlist() { /* useContext + guard mot bruk utenfor provider */ }
```

```ts
// context/MediaProviderContext.tsx
const MediaProviderContext = createContext<MediaProvider | null>(null);
export function MediaProviderProvider({ provider, children }: { provider: MediaProvider; children: React.ReactNode }) { /* ... */ }
export function useMediaProvider(): MediaProvider { /* ... */ }
```

`MediaProviderContext` (fremfor et modul-singleton) gjør det trivielt å injisere en `createMockMediaProvider()`-testdobbel i komponenttester uten skjøre modul-mocks.

**Flere faner:** To samtidige faner som endrer watchlisten overskriver hverandre (siste skriving vinner). Dette er en akseptert begrensning for en enkeltbruker-app; det lyttes ikke på `storage`-eventet i v1. Med DB-migreringen gjelder den samme begrensningen nå også mot Firestore: `WatchlistStorage` bruker ingen realtime-lyttere (`onSnapshot`), kun engangs henting (ved mount og ved `online`-gjenoppkobling, se [Identitet og datalagring](#identitet-og-datalagring-firebase)), så to faner *på samme nettleserprofil* (samme anonyme identitet) som endrer watchlisten samtidig kan fortsatt overskrive hverandre — uendret risiko, bare flyttet fra kun `localStorage` til også å gjelde Firestore.

**Flere enheter — hver sin adskilte identitet:** Til forskjell fra "flere faner" (som deler én identitet og i prinsippet *kunne* vist samme data) får flere *enheter* i denne runden hver sin egen, adskilte anonyme Firebase-identitet (se [Identitet og datalagring](#identitet-og-datalagring-firebase)) — de deler ingen data i det hele tatt, ikke engang med en overskrivingsrisiko. En bruker som åpner appen på mobil og på laptop ser to fullstendig uavhengige, tomme watchlister. Ekte multi-device-synk (konto-linking) er en fremtidig, ikke-implementert oppgave.

**Feilmeldinger:** `MediaProviderError.code` mappes til faste, brukervennlige tekster i `ErrorMessage`-komponenten (se [design.md](./design.md#feilmeldinger)) — tekniske detaljer logges til konsollen, aldri til bruker.

## Routing

| Rute | Side | Ansvar |
|---|---|---|
| `/` | `HomePage` | Tekstsøk + talesøk, resultatliste, klikk → `/title/:id` |
| `/mylist` | `WatchlistPage` | Faner "Planlagt"/"Sett", statusbytte, fjerning |
| `/title/:id` | `TitleDetailPage` | Henter detaljer via `useMediaDetails(id)`, viser rating/sjangre/streaming, watchlist-toggle |
| `*` | `NotFoundPage` | Enkel 404-side |

`Media.id` er IMDb-ID-en (f.eks. `tt0133093`), så URL blir `/title/tt0133093`. I fase 1–9 er den `mock-movie-1` e.l. fra `MockMediaProvider`.

## Robusthet og sikkerhet

- **`localStorage` utilgjengelig** (deaktivert, enkelte private-moduser): både `LocalStorageCacheStore` og `watchlistStorage` feature-detecter ved oppstart og faller tilbake til en in-memory-variant. Appen fungerer da fullt ut, men uten persistens mellom økter — den skal aldri kræsje på manglende storage.
- **Runtime-validering av persistert data:** alt som leses fra `localStorage` (`CacheEntry`, `WatchlistItem[]`) valideres med lettvekts type guards (håndskrevne `is…`-funksjoner, ingen Zod-avhengighet) før bruk. Data som parser, men har feil form, behandles som fravær (cache-miss / tom watchlist) — `get<T>`-casten alene er ingen garanti mot manipulert eller korrupt innhold.
- **URL-er fra eksterne API-er** (`posterUrl`, `logoUrl`, `StreamingOffer.url`) valideres i provider-mappingen: kun `https:`-URL-er slippes gjennom, alt annet mappes til `null`/utelates (beskytter mot bl.a. `javascript:`-URL-er i `href`). Eksterne lenker rendres med `target="_blank"` og `rel="noopener noreferrer"`.
- **CSP:** GitHub Pages støtter ikke egendefinerte HTTP-headere, så Content-Security-Policy settes som `<meta http-equiv>`-tag i `index.html` (injisert av `cspMetaTagPlugin` i `vite.config.ts`, kun ved build). Det er svakere enn en ekte header (bl.a. ingen `frame-ancestors`), men dekker det viktigste: `script-src`, `img-src` og `connect-src`. Med datakildene valgt er domenene kjent:

  | Direktiv | Domene | Formål |
  |---|---|---|
  | `connect-src` | `https://www.omdbapi.com` | OMDb-søk og titteldetaljer |
  | `connect-src` | `https://api.movieofthenight.com` | MOTN-strømmetilgjengelighet |
  | `connect-src` | `https://firestore.googleapis.com` | Watchlist-lesing/-skriving via `firebase/firestore/lite` (REST) |
  | `connect-src` | `https://identitytoolkit.googleapis.com` | Anonym Firebase Auth-innlogging (`signInAnonymously`) |
  | `connect-src` | `https://securetoken.googleapis.com` | Fornyelse av Firebase Auth-tokens |
  | `img-src` | `https://m.media-amazon.com` | OMDbs plakat-URL-er (Amazons bilde-CDN, ikke omdbapi.com) |
  | `img-src` | `https://media.movieofthenight.com` | Strømmetjenestenes logoer |
  | `style-src` / `font-src` | `https://fonts.googleapis.com` / `https://fonts.gstatic.com` | Google Fonts (Space Grotesk/Manrope, se [design.md](./design.md)) |

  De tre Firebase-domenene ble lagt til i DB-migreringen (issue A) og gir ingen ekte trafikk før `firebaseClient.ts` faktisk tas i bruk (fra og med issue B).
- **Avhengigheter:** `npm audit` kjøres i CI; sårbarheter på høy/kritisk alvorlighetsgrad brekker bygget.

## Deploy (GitHub Pages)

Appen deployes til GitHub Pages via GitHub Actions. Fordi Pages serverer fra en understi (`https://<bruker>.github.io/streamie/`) kreves tre ting, og alle settes opp allerede i fase 1 slik at produksjonsstier aldri divergerer fra dev:

1. `base: '/streamie/'` i `vite.config.ts`.
2. `<BrowserRouter basename={import.meta.env.BASE_URL}>` slik at rutene fungerer under understien.
3. **SPA-fallback:** GitHub Pages har ingen rewrite-støtte, så build-steget kopierer `dist/index.html` til `dist/404.html`. Direkte-lasting av f.eks. `/streamie/title/tt0133093` (bokmerke, refresh) gir da riktig app — med HTTP-status 404, som er akseptabelt for et personlig verktøy uten SEO-behov.

Workflowen (`.github/workflows/ci.yml`) kjører lint + test + `npm audit` på hver push, bygger, og publiserer `dist/` til Pages med `actions/deploy-pages`.

## Kjente forutsetninger og risikoer

- **RT-score kan mangle:** OMDb har Rotten Tomatoes-score kun for et delsett av titlene. Dette er en bevisst modellert invariant (`number | null`), ikke en feil.
- **API-nøkler i en ren klient-app er alltid eksponert for sluttbruker** — det finnes ingen backend til å skjule dem. Begge nøkler (`VITE_OMDB_API_KEY`, `VITE_MOTN_API_KEY`) bakes inn i bundelen ved build og er lesbare for hvem som helst som åpner appen. Konsekvensen er kvotetyveri, ikke datalekkasje: begge API-ene er lesekilder uten brukerdata. Akseptert risiko for et personlig verktøy, men må vurderes på nytt hvis appen deles — særlig MOTNs 100 req/døgn er triviell å tømme for en utenforstående. Nøklene legges inn som GitHub Actions-secrets, ikke i repoet.
- **CORS:** Verifisert 2026-07-16 — både `www.omdbapi.com` og `api.movieofthenight.com` svarer med `access-control-allow-origin: *` over https, og MOTNs preflight godtar `X-API-Key`-headeren. Direkte kall fra nettleseren fungerer uten proxy. Dette var den eneste risikoen som kunne velte "ingen backend"-kravet, og den er avkreftet for begge valgte kilder.
- **Region er påkrevd, ikke valgfritt:** MOTN krever `country` som parameter på hvert kall. Regionen (`"no"`) settes i `MotnMediaProvider`-konfigurasjonen og lekker ikke inn i domenelaget — `StreamingAvailability.region` finnes der fra dag én.
- **Kvoter:** OMDb 1 000 req/døgn, MOTN 100 req/døgn. Cache-laget er dermed ikke bare en ytelsesoptimalisering, men det som holder appen innenfor MOTNs grense ved normal bruk. Ved overskridelse svarer API-ene med 429 → `MediaProviderError('rate-limit')` → den eksisterende feilmeldingen i [design.md](./design.md#feilmeldinger). Det bygges ingen egen kvoteteller i v1.
- **MOTNs vilkår krever attribusjon:** «Streaming Availability API by Movie of the Night» med lenke til <https://www.movieofthenight.com/about/api> må vises i appen (footer, se [design.md](./design.md#attribusjon)). Vilkårene tillater eksplisitt caching av data, men ikke videredistribusjon av dataene til andre plattformer — sistnevnte er uansett utenfor appens formål.
- **Talesøk sender lyd til tredjepart:** Chromes `SpeechRecognition` sender lydopptaket til Googles servere for gjenkjenning. Akseptert risiko for et personlig verktøy — talesøk er dessuten valgfritt, tekstsøk er alltid tilgjengelig.
- **Watchlisten nullstilles ved API-byttet i fase 10:** `mediaId` er `mock-…` i fase 2–9 og matcher ingen IMDb-ID når `CompositeMediaProvider` tas i bruk. Dette er en bevisst akseptert konsekvens (innholdet fra fase 2–9 er uansett testdata); data-versjonen bumpes da til `watchlist:v2:data:` som en éngangs, bevisst sletting. Det bygges ingen migrasjonslogikk. **Dette er en engangshendelse:** etter fase 10 er `mediaId` en IMDb-ID, som er stabil på tvers av datakilder — bytter man senere ut OMDb eller MOTN, overlever watchlisten.
- **Serie-granularitet:** «sett»-status gjelder hele tittelen — for serier finnes ingen sporing per sesong/episode. Bevisst v1-avgrensning, ikke en forglemmelse.
- **Firebase-kvoter:** Spark-planen (gratisnivået) har rundhåndede, men reelle daglige kvoter for Firestore-lesing/-skriving og Auth-operasjoner. Det bygges ingen egen kvoteteller eller -varsling i denne runden — samme holdning som til OMDb/MOTN-kvotene over. Relevant kun ved uventet høyt trafikkvolum, ikke ved normal enkeltbruker-bruk.
- **Anonym identitet er enhetsbundet, ikke kontobundet:** se [Identitet og datalagring](#identitet-og-datalagring-firebase). En ny nettleserprofil, enhet eller ryddet nettleserdata gir en helt ny, tom identitet — det finnes ingen gjenopprettingsmekanisme før konto-linking (fremtidig, ikke-implementert oppgave) bygges. Dette er en bevisst avgrensning for denne runden av DB-migreringen, ikke en forglemmelse.
- **Migreringen bevarer data, i motsetning til fase 10s nullstilling:** engangsmigreringen av eksisterende `localStorage`-watchlist til Firestore (se [Identitet og datalagring](#identitet-og-datalagring-firebase)) er et bevisst valg om å *beholde* brukerens data inn i den nye databasen (lokal versjon vinner ved konflikt), til forskjell fra den bevisste nullstillingen som ble gjort ved API-byttet i fase 10 (se punktet over). Kjent, akseptert kant: to faner/vinduer som begge forsøker migrering eller vanlig watchlist-synk samtidig kan overskrive hverandre (samme «flere faner»-begrensning som resten av watchlist-skrivingen, se [State management](#state-management)) — dette er ikke fikset, og ikke planlagt fikset i v1.
