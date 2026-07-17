# Utviklingsoppgaver

Faseinndelt rekkefølge for implementasjonen. Hver fase bygger på strukturen i [architecture.md](./architecture.md), typene i [data-model.md](./data-model.md) og UX-en i [design.md](./design.md). Fase 1–9 gir en fullt fungerende, testbar app med mock-data — det er selve poenget med `MediaProvider`-abstraksjonen at ingen API-valg trengs før fase 10.

**Bruk av lista:** Hak av (`- [x]`) etter hvert som oppgaver fullføres. Hver fase avsluttes med en «Definition of done» som er sin egen boks — den hakes av først når alle oppgavene i fasen er gjort *og* kriteriet er verifisert. Linjer uten boks er beslutninger eller fakta, ikke arbeid som skal utføres.

## Fremdrift

| Fase | Status |
|---|---|
| 1 — Prosjektoppsett | ✅ Ferdig 2026-07-17 |
| 2 — Domenemodell og MockMediaProvider | ✅ Ferdig 2026-07-17 |
| 3 — Cache-lag | ✅ Ferdig 2026-07-17 |
| 4 — App-skjelett | ✅ Ferdig 2026-07-17 |
| 5 — Søkeside | ✅ Ferdig 2026-07-17 |
| 6 — Detaljside | ☐ Ikke startet |
| 7 — Watchlist-funksjonalitet | ☐ Ikke startet |
| 8 — Talesøk | ☐ Ikke startet |
| 9 — Polish | ☐ Ikke startet |
| 10 — Ekte API-integrasjon | ☐ Ikke startet |

## Fase 1 — Prosjektoppsett
- [x] Pin Node (nyeste LTS) i `.nvmrc` og `"engines"` i `package.json`; npm brukes som pakkebehandler.
- [x] Sett opp Vite + React + TypeScript. `tsconfig`: `strict: true` og `noUncheckedIndexedAccess: true` fra dag én (smertefullt å skru på senere).
- [x] Sett `base: '/watchlist/'` i `vite.config.ts` — appen deployes til GitHub Pages under understi (se deploy-avsnittet i [architecture.md](./architecture.md#deploy-github-pages)).
- [x] Installer og konfigurer Tailwind CSS **v4** via `@tailwindcss/vite`-plugin (ikke v3-oppsettet med `tailwind.config.js`/`postcss.config.js`).
- [x] Sett opp ESLint (`typescript-eslint` recommended-type-checked + `eslint-plugin-react-hooks`) og Prettier med standardinnstillinger. Konvensjon: named exports, ikke default exports.
- [x] Installer Vitest + React Testing Library (inkl. jsdom-miljø, `setupTests.ts`).
- [x] Installer og konfigurer **Playwright** (`playwright.config.ts`, `webServer` som starter Vite-preview mot bygget app). E2E-spec-er ligger i `e2e/` — se [Teststrategi](./architecture.md#teststrategi).
- [x] **Ekskluder `e2e/` fra Vitest** (`test.exclude` i `vite.config.ts`). Begge rammeverk plukker opp `*.spec.ts` som standard; uten dette forsøker Vitest å kjøre Playwright-spec-ene og feiler kryptisk.
- [x] Installer React Router.
- [x] Opprett mappestrukturen fra [architecture.md](./architecture.md).
- [x] Sett opp GitHub Actions-workflow (`.github/workflows/ci.yml`): lint + enhetstester + `npm audit` (brekk på høy/kritisk) på hver push; egen E2E-jobb (`npx playwright install --with-deps` + `npx playwright test`) som laster opp rapporten som artifact ved feil; build-steg som kopierer `dist/index.html` → `dist/404.html` (SPA-fallback for Pages). Selve Pages-publiseringen aktiveres i fase 9.
- [x] **Definition of done:** `npm run dev` starter en tom app, `npm test` og `npm run test:e2e` kjører (selv uten tester ennå), lint kjører uten feil, CI er grønn på push.

## Fase 2 — Domenemodell, MediaProvider-interface og MockMediaProvider
- [x] Opprett `types/media.ts`, `types/watchlist.ts`, `types/cache.ts`.
- [x] Opprett `services/media/MediaProvider.ts` (interface + `MediaProviderError`).
- [x] Opprett `services/media/providers/MockMediaProvider.ts` med noen faste titler (inkl. minst én uten `rottenTomatoesScore` og én uten streaming-tilbud, for å teste null-håndtering tidlig).
- [x] Opprett `src/test/fixtures/media.fixtures.ts` og `src/test/mocks/createMockMediaProvider.ts`.
- [x] **Definition of done:** `MockMediaProvider.search()` og `.getDetails()` fungerer og har enhetstester.

## Fase 3 — Cache-lag
- [x] Opprett `services/cache/CacheStore.ts`, `LocalStorageCacheStore.ts`, `cacheKeys.ts`, `utils/normalizeQuery.ts`, `utils/storageKeys.ts`.
- [x] `LocalStorageCacheStore` feature-detecter `localStorage` og faller tilbake til in-memory-lagring; leste entries valideres med type guards (feil form = cache-miss, fjernes stille). Se «Robusthet og sikkerhet» i [architecture.md](./architecture.md#robusthet-og-sikkerhet).
- [x] Opprett `services/media/CachingMediaProvider.ts`.
- [x] **Definition of done:** Enhetstester dekker: set/get-roundtrip, TTL-utløp, quota-exceeded-eviction (eldste/utløpte først), at cache-navnerom er adskilt fra watchlist-navnerom, at korrupt/feilformet entry behandles som miss, in-memory-fallback når `localStorage` er utilgjengelig, og at `CachingMediaProvider` hopper over indre kall ved cache-hit.

## Fase 4 — App-skjelett
- [x] Opprett `App.tsx` med `BrowserRouter basename={import.meta.env.BASE_URL}` (GitHub Pages-understi), `NavBar`, `Routes` for `/`, `/watchlist`, `/title/:id`, `*`.
- [x] Opprett `context/MediaProviderContext.tsx`, koble `CachingMediaProvider(MockMediaProvider)` inn app-bredt via `services/media/index.ts`.
- [x] **Definition of done:** Navigasjon mellom de fire rutene fungerer med tomme placeholder-sider.

## Fase 5 — Søkeside
- [x] Implementer `SearchBar`, `useMediaSearch`, `SearchResultsGrid`, `SearchResultCard`.
- [x] Søk trigges kun ved submit (Enter/søkeknapp) — ikke mens man skriver. Nytt submit avbryter pågående kall via `AbortSignal` (også ved unmount), slik at utdaterte responser aldri vises.
- [x] Håndter lasting/tom-tilstand/feil-tilstand som beskrevet i [design.md](./design.md), inkl. feilkode-tekstene i [design.md](./design.md#feilmeldinger).
- [x] **E2E** (`e2e/search.spec.ts`): søk → resultater vises → klikk på kort navigerer til detaljside. Dekk også tom-tilstand (søk uten treff).
- [x] **Definition of done:** Søk mot `MockMediaProvider` viser resultater, klikk navigerer til detaljside.

## Fase 6 — Detaljside
- [ ] Implementer `TitleDetailPage`, `useMediaDetails`, `RatingsBadge` (eksplisitt "ikke tilgjengelig" for manglende RT-score), `GenreTags`, `StreamingProvidersList` (tom-tilstand).
- [ ] **Definition of done:** Detaljside viser alle felt fra en `Media`-fixture korrekt, inkludert null-tilfeller.

## Fase 7 — Watchlist-funksjonalitet
- [ ] Implementer `context/WatchlistContext.tsx` (reducer: `ADD`/`REMOVE`/`SET_STATUS`) og `services/storage/watchlistStorage.ts`.
- [ ] `watchlistStorage`: type guard-validering ved lesing, in-memory-fallback når `localStorage` er utilgjengelig, og skrivefeil-policyen fra [architecture.md](./architecture.md#cache-design) — rydd cache for å frigjøre plass, ellers synlig feilmelding; aldri stille tap av brukerdata.
- [ ] Implementer `WatchlistToggleButton` (på både søkeresultat-kort og detaljside), `WatchlistPage` med `WatchlistTabs` (Planlagt/Sett), `WatchlistItemCard`.
- [ ] **E2E** (`e2e/watchlist.spec.ts`): legg til fra søkeresultat → tittelen vises under «Planlagt» → bytt status til «Sett» → `page.reload()` → status er beholdt. Persistens over reload er nettopp det enhetstester ikke fanger, og hovedgrunnen til at E2E er verdt det her.
- [ ] **Definition of done:** Legge til, bytte status og fjerne fra watchlist fungerer og overlever en sideoppdatering (persistert i `localStorage`).

## Fase 8 — Talesøk
- [ ] Implementer `hooks/useSpeechRecognition.ts` med feature-detection (`window.SpeechRecognition ?? window.webkitSpeechRecognition`) og `lang: 'en-US'` (se [design.md](./design.md#søkeflyt-tekst-og-tale)).
- [ ] Implementer `VoiceSearchButton`, koble `transcript` (kun `isFinal`-resultat) inn i samme `handleSearch(query)`-flyt som tekstsøk på `HomePage`.
- [ ] **Definition of done:** Talesøk fungerer i Chrome/Edge; i nettlesere uten støtte vises tydelig fallback og tekstsøk er upåvirket. Enhetstester mocker `window.SpeechRecognition` og dekker både støttet og ikke-støttet nettleser.

**Merk — talesøk dekkes ikke av E2E:** Web Speech API krever ekte mikrofoninput og en gjenkjenningstjeneste hos Google; Playwright kan verken mate inn lyd eller stubbe `SpeechRecognition` meningsfullt utenfra. Talesøk verifiseres derfor med enhetstester (mocket `SpeechRecognition`) pluss manuell testing i Chrome. Det er en reell begrensning i rammeverket, ikke en nedprioritering. Siden talesøk og tekstsøk deler kodepath (`handleSearch(query)`), dekker E2E-testene for tekstsøk alt bortsett fra selve tale-til-tekst-steget.

## Fase 9 — Polish
- [ ] Tilgjengelighet: `aria-label`er (spesielt mikrofonknapp), synlig fokus-styling, tastaturnavigasjon.
- [ ] Responsivt design på tvers av alle sider.
- [ ] Konsekvente tomme/lastings/feil-tilstander overalt (gjenbruk `components/common/`).
- [ ] Legg til Content-Security-Policy som `<meta http-equiv>`-tag i `index.html` (GitHub Pages støtter ikke egendefinerte headere, se [architecture.md](./architecture.md#robusthet-og-sikkerhet)).
- [ ] Aktiver GitHub Pages-publisering fra CI-workflowen (bygg + `actions/deploy-pages`; `base`/`basename`/404-fallback er på plass siden fase 1).
- [ ] **E2E** (`e2e/deep-links.spec.ts`): last `/watchlist/title/<id>` direkte og refresh på hver rute — verifiserer 404.html-fallbacken og `basename`-oppsettet. Dette er den mest verdifulle E2E-testen i prosjektet: SPA-fallback på GitHub Pages er nettopp den typen feil som kun oppstår i produksjonsbygget og aldri i `npm run dev`.
- [ ] **E2E:** kjør hele suiten mot produksjonsbygget (`vite preview` med `base: '/watchlist/'`), ikke bare mot dev-serveren.
- [ ] **Definition of done:** Manuell gjennomgang av alle sider på mobil- og desktop-bredde, ingen ubehandlede tilstander. E2E-suiten er grønn mot produksjonsbygget i CI. I produksjon på Pages: dyplenker (`…/watchlist/title/<id>` lastet direkte) og refresh fungerer på alle ruter.

**Merk:** E2E erstatter ikke den manuelle gjennomgangen — responsivt design og visuell polish på tvers av skjermbredder verifiseres fortsatt manuelt. Det er ingen visuell regresjonstesting (screenshot-diffing) i v1.

## Fase 10 — Ekte API-integrasjon (egen, senere milepæl)

Denne fasen er bevisst uavhengig av fase 1–9. Datakildene er valgt: **OMDb** for søk og titteldata (inkl. IMDb- og RT-score), **Movie of the Night** (MOTN) for strømmetilgjengelighet. Se [Datakilder](./architecture.md#datakilder) for arbeidsdelingen og hvorfor IMDb-ID-en binder dem sammen.

Forutsetninger som var åpne, og nå er avklart (fakta, ingen oppgaver):
- **CORS:** verifisert 2026-07-16 — begge API-er svarer med `access-control-allow-origin: *` over https. Ingen proxy trengs, "ingen backend"-kravet holder.
- **Region:** `country=no` — påkrevd parameter hos MOTN, settes i provider-konfigurasjonen.
- **Attribusjon:** MOTNs vilkår krever synlig kreditering — `Footer` (se [design.md](./design.md#attribusjon)).

### Oppgaver

- [ ] Skaff nøkler: OMDb (<https://www.omdbapi.com/apikey.aspx>) og MOTN Developers Platform (gratisplan, ingen betalingsinfo). Legg dem i `.env.local` (git-ignorert) og som GitHub Actions-secrets; `.env.example` dokumenterer `VITE_OMDB_API_KEY` og `VITE_MOTN_API_KEY`. Vite krever `VITE_`-prefiks for at variabelen skal nå klientbundelen — og det betyr samtidig at nøklene er lesbare for sluttbruker (akseptert, se [risikoer](./architecture.md#kjente-forutsetninger-og-risikoer)).
- [ ] Implementer `OmdbMediaProvider` (`search` via `?s=`, `getDetails` via `?i=tt…`). Mapping må håndtere fallgruvene i [OMDb-mapping](./architecture.md#omdb-mapping--kjente-fallgruver): `Response: "False"` ved HTTP 200, `"N/A"`-strenger → `null`, RT-score fra `Ratings`-arrayet, alle tallfelter som strenger.
- [ ] Implementer `MotnMediaProvider.getStreaming(imdbId)` mot `GET /shows/{id}?country=no` med `X-API-Key`-header. Mapper MOTNs `streamingOptions` → `StreamingAvailability`. **Ikke-funnet må returnere `null`, ikke kaste.**
- [ ] Implementer `CompositeMediaProvider`: `search` går kun til OMDb; `getDetails` kaller begge i parallell med `Promise.all`, der MOTN-feil degraderes til `streaming: null`.
- [ ] Valider URL-er fra begge API-er i mappingen (kun `https:`, se [Robusthet og sikkerhet](./architecture.md#robusthet-og-sikkerhet)).
- [ ] Map feilresponser til `MediaProviderError`: 401/403 → `unknown` (feilkonfigurert nøkkel, logges tydelig), 429 → `rate-limit`, nettverksfeil → `network`, uventet responsform → `invalid-response`.
- [ ] Utvid CSP-meta-taggen med domenene i [Robusthet og sikkerhet](./architecture.md#robusthet-og-sikkerhet) — merk at OMDbs plakater ligger på `m.media-amazon.com`, ikke på omdbapi.com.
- [ ] Legg til `Footer` med attribusjon (se [design.md](./design.md#attribusjon)).
- [ ] Bytt `services/media/index.ts` fra `MockMediaProvider` til `CompositeMediaProvider`.
- [ ] Bump data-versjonen til `watchlist:v2:data:` — eksisterende watchlist fra mock-fasen slettes bevisst, ingen migrasjonslogikk (se [architecture.md](./architecture.md#kjente-forutsetninger-og-risikoer)).

### Testing

Ingen tester — verken enhets- eller E2E — treffer ekte API-er. Kvoten er 100/døgn hos MOTN, og en CI-kjøring per push ville tømt den; dessuten kan feiltilstander som 429 ikke fremprovoseres mot ekte API. Enhetstestene mocker `fetch`, E2E-testene stubber nettverket med `page.route` (se [Teststrategi](./architecture.md#teststrategi)).

Enhetstester av provider-mappingen:
- [ ] OMDbs `Response: "False"`-bom (HTTP 200) → `MediaProviderError('not-found')`.
- [ ] `"N/A"`-felter mappes til `null`, ikke `NaN` eller strengen `"N/A"`.
- [ ] Tittel uten RT-score → `rottenTomatoesScore: null`.
- [ ] MOTN-404 → `streaming: null`, med resten av detaljsiden intakt.
- [ ] 429 fra begge API-er → `MediaProviderError('rate-limit')`.

E2E med stubbede API-responser:
- [ ] Oppdater `e2e/fixtures/apiStubs.ts` fra mock-responser til OMDb-/MOTN-format — spec-ene fra fase 5/7/9 skal ellers stå urørt. At de gjør det, er i seg selv beviset på at `MediaProvider`-abstraksjonen holder.
- [ ] Detaljside der MOTN-stubben svarer 404 → siden rendres komplett på OMDb-data, med tom-tilstand for strømmetjenester.
- [ ] Detaljside der OMDb-stubben mangler RT-score → «Ikke tilgjengelig» vises.
- [ ] OMDb-stubben svarer 429 → feilmeldingen for `rate-limit` vises med «prøv igjen»-handling.

- [ ] **Definition of done:** `CompositeMediaProvider` erstatter `MockMediaProvider` i `services/media/index.ts` uten at noe i UI-, hook- eller context-laget må endres. Søk, detaljvisning (inkl. en tittel uten strømmetilbud og en uten RT-score) og watchlist fungerer mot ekte data i produksjon på Pages.
