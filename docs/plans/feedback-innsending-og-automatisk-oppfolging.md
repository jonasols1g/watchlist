# Feedback-innsending + automatisk oppfølging via skyagent

## Kontekst

Appen mangler i dag en kanal for å samle inn hva brukerne faktisk synes om løsningen. Målet er en enkel, bevisst *lite synlig* side (`/feedback`, ingen navigasjonslenke — første iterasjon, ikke ment for bred eksponering ennå) der brukere kan skrive fritekst + gi en score 1–5, lagret i Firestore. I tillegg ønsker Jonas at innkomne tilbakemeldinger som peker på konkrete forbedringer, skal fanges opp og settes i produksjon uten at han selv må trigge det manuelt hver gang — løst med en daglig skyagent (Claude Code "routine") som vurderer ny feedback opp mot docs/, oppretter GitHub-issue ved treff, og implementerer helt til en åpen PR. Selve mergingen til `main` skjer aldri autonomt — det siste steget er bevisst likt dagens flyt, der et menneske reviewer/verifiserer/merger.

Bekreftede valg fra bruker:
- **Automatiseringsgrad:** til og med åpen PR (issue → implementasjon → PR med `Closes #<issue>`), aldri auto-merge.
- **Kjørefrekvens:** daglig kl. 09:00 Europe/Oslo (`0 7 * * *` UTC, sommertid).
- **Datatilgang:** `feedback`-collectionen får åpen lesetilgang i Firestore-rules (konsistent med appens allerede åpne tillitsmodell — anonym auth, ingen ekte kontoer, ingen sensitiv info i tilbakemeldinger).

## Del A — Feedback-innsending (klient + database)

Implementeres som ordinært GitHub-issue gjennom den dokumenterte agent-arbeidsflyten (`dev` → `reviewer` → `verifier` → merge), ikke direkte i hovedsamtalen.

**Datamodell (ny top-level collection `feedback/{autoId}`, IKKE brukerbundet):**
```ts
{
  text: string;       // trimmet fritekst, maks 2000 tegn
  score: number;      // heltall 1–5
  createdAt: string;  // ISO-streng, samme mønster som addedAt i watchlistItems
}
```
Auto-generert dokument-ID (`addDoc`, ikke `setDoc` med meningsfull nøkkel) — det finnes ingen naturlig nøkkel slik `mediaId` er for watchlist.

**`firestore.rules`** — ny `match`-blokk, lesing åpen, skriving krever (anonym) auth + enkel serverside-validering, ingen update/delete (feedback er append-only):
```
match /feedback/{feedbackId} {
  allow read: if true;
  allow create: if request.auth != null
    && request.resource.data.text is string
    && request.resource.data.text.size() > 0
    && request.resource.data.text.size() <= 2000
    && request.resource.data.score is int
    && request.resource.data.score >= 1
    && request.resource.data.score <= 5;
  allow update, delete: if false;
}
```

**Kode, følger eksisterende mønstre (jf. `FirestoreWatchlistStorage.ts` / `WatchlistRemoteStorage.ts`):**
- `src/types/feedback.ts` — `FeedbackSubmission`-type.
- `src/services/storage/FeedbackStorage.ts` — tynt interface (`submit(data): Promise<void>`).
- `src/services/storage/FirestoreFeedbackStorage.ts` — implementasjon med `addDoc` mot `firebase/firestore/lite`, samme importmønster som `firebaseClient.ts`.
- `src/routes/FeedbackPage.tsx` (+ `.test.tsx`) — ny rute, named export `FeedbackPage`, samme layout-mønster som `WatchlistPage.tsx` (`<section>`, `font-heading`-tittel, `text-text-*`/`bg-surface`-tokens).
  - Kontrollert skjema à la `SearchBar.tsx` (lokal `useState`, `preventDefault`, trim/valider før submit) — ingen skjemabibliotek, konsistent med resten av appen.
  - `<textarea>` for fritekst (appens første — ingen eksisterende å gjenbruke).
  - Ny 1–5-stjerne-rating-komponent (radiogroup-semantikk, `aria-checked` per knapp) — appen har kun en boolsk stjerne-toggle i dag (`WatchlistStarToggle.tsx`), ingen skala. Samme SVG-path som `NavBar`/`WatchlistStarToggle`/`RatingsBadge` kan gjenbrukes; ekstraksjon til en delt `StarIcon` er en grei opprydding siden det blir 4. dupliserte forekomst, men ikke et krav.
  - Submit-knapp: eksisterende stil (`bg-brand-gradient rounded-2xl px-4 py-3.5 ...`).
  - Feil ved lagring: samme bannermønster som `WatchlistSaveErrorBanner.tsx`. Suksess: enkel bekreftelsestekst + nullstilt skjema.
- `src/App.tsx` — ny `<Route path="/feedback" element={<FeedbackPage />} />` over `*`-fallback. **Ingen lenke** i `NavBar` eller `Footer` — siden skal kun nås via direkte URL.
- `src/services/storage/index.ts` — wire opp `FirestoreFeedbackStorage` samme sted som `watchlistStorage` i dag.
- Testdobbel: egen mock i `src/test/mocks/`, samme mønster som `createMockWatchlistStorage.ts`.

**Docs som må oppdateres i samme PR (jf. "dokumentasjonen er fasit"):**
- `docs/design.md` — legg `/feedback` til i sider-tabellen, markert som skjult/uten navigasjonslenke.
- `docs/data-model.md` — dokumenter `feedback`-collectionen i Firestore-skjema-seksjonen, samme detaljnivå som `watchlistItems`.

## Del B — Automatisk oppfølging (skyagent / "routine")

Opprettes **etter** at Del A er godkjent og merget (skyagenten trenger `/feedback`-koden og `feedback`-collectionen å lese fra), via `/schedule`-flyten.

**Oppsett:**
- Cron: `0 7 * * *` (09:00 Europe/Oslo / 07:00 UTC).
- Repo: `https://github.com/jonasols1g/streamie`, krever at Claude GitHub App er koblet til repoet (sjekkes ved opprettelse).
- Ingen Firebase-nøkler eller service account trengs: siden `allow read: if true` på `feedback`, kan agenten lese collectionen direkte via Firestore sitt offentlige REST-endepunkt (`GET https://firestore.googleapis.com/v1/projects/<project-id>/databases/(default)/documents/feedback`, ren `curl`, ingen credentials).
- Slack-varsling fra routinen er valgfritt og krever at webhook-URL-en legges inn i routine-promten ved opprettelse (den ligger i dag kun i den gitignorede lokale `.claude/settings.local.json` og er ikke tilgjengelig for skyagenten automatisk) — avklares når routinen faktisk opprettes.

**Routinens arbeidsgang (skrives inn som routine-prompt, selvstendig — agenten starter uten kontekst fra denne samtalen):**
1. Klon/les repoet. Hent alle dokumenter i `feedback`-collectionen via REST-kallet over.
2. For hvert feedback-dokument: sjekk om det allerede er behandlet ved å søke (`gh issue list --state all --search`) etter dokumentets Firestore-ID i issue-body (ny issue skal alltid inneholde en linje `Feedback-ID: <docId>` nettopp for denne dedupliseringen). Hopp over allerede behandlede.
3. For hvert ubehandlet dokument: vurder — samme kriterier som `feature-planner` (les `docs/architecture.md`, `docs/data-model.md`, `docs/design.md`; vurder mot rammer som ingen backend, MOTN-kvote, GitHub Pages-hosting) — om teksten peker på en konkret, avgrenset forbedring som er verdt å bygge.
   - Vag, ren ros, eller noe som strider mot arkitekturen → hopp over (ikke opprett issue).
   - Konkret og byggbar → fortsett til steg 4.
4. Opprett GitHub-issue (`gh issue create`) med oppgaveliste + Definition of done formatert likt som `feature-planner` leverer i dag, inkl. `Feedback-ID: <docId>`-linjen. Legg til på prosjektboardet (`gh project item-add`), sett status Backlog → Ready (samme felt-/opsjons-IDer som i `CLAUDE.md`).
5. Flytt kortet til In progress. Implementer på branch `feat/<issue-nr>-kortnavn`, i tråd med samme konvensjoner som `dev`-agenten følger (se `.claude/agents/dev.md`).
6. Åpne PR mot `main` med `Closes #<issue-nr>` i beskrivelsen. Flytt kortet til In review.
7. **Stopp der.** Ikke merge. Videre review/verifisering/merge skjer som normalt (av Jonas / hovedsamtalen), akkurat som for manuelt opprettede issues.
8. Uansett utfall (issue opprettet, eller hoppet over) — legg til en kort oppsummeringslinje i `dev-log.md` under en egen overskrift for dagens automatiske gjennomgang, slik at Jonas har innsyn i hva routinen vurderte og hvorfor, selv når den ikke handler.

**Merk:** dette er ett sammenhengende agent-kall (ikke et lokalt orkestrert multi-agent-team med worktree-isolasjon slik `CLAUDE.md` beskriver for hovedsamtalen) — skyagenten kjører i sitt eget isolerte cloud-miljø med egen git-klone, så isolasjon er iboende. Rollene til `feature-planner` og `dev` slås sammen til ett kontinuerlig routine-kall siden cloud-routinen ikke nødvendigvis har tilgang til å spawne det lokale subagent-teamet.

## Verifisering

**Del A (manuelt, mot faktisk produksjonsbygg — del av `verifier`s jobb i PR-flyten):**
- Naviger direkte til `/feedback` (ikke via lenke) — bekreft siden IKKE er nås via `NavBar`/`Footer`.
- Fyll ut tekst + velg score 1–5, send inn — bekreft suksessmelding og at feltene nullstilles.
- Prøv å sende uten tekst / uten valgt score — bekreft at submit er blokkert eller gir tydelig feilmelding.
- Sjekk i Firebase Console (`watchlist-jonasols1g`-prosjektet) at dokumentet dukker opp i `feedback`-collectionen med riktige felt (`text`, `score`, `createdAt`).
- Kjør `npm run test` og `npm run build` — grønn CI dekker lint/enhetstester/E2E/bygg jf. eksisterende praksis.

**Del B (etter opprettelse av routinen):**
- Kjør routinen manuelt én gang (`/schedule` → "run now") mot en testtilbakemelding sendt inn i `/feedback`, og bekreft at et issue faktisk opprettes på boardet med korrekt `Feedback-ID`-referanse og at en PR åpnes.
- Bekreft at en ny kjøring av routinen for samme tilbakemelding IKKE oppretter et duplikat-issue (dedupliseringen fungerer).
