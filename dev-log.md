# Utviklingslogg

Kort logg over hva som er gjort per dag. Nyeste øverst. Én oppføring per dag det er gjort arbeid — noen linjer, ikke en rapport. Detaljene hører hjemme i dokumentene i `docs/`; her står bare hva som skjedde og hva som er neste steg.

## 2026-07-17

- Endret talesøk fra norsk til engelsk (`lang: 'en-US'` i stedet for `nb-NO`) i `docs/README.md`, `docs/design.md` og `docs/dev-tasks.md`. Ingen kode berørt — talesøk er ikke implementert ennå (fase 8).
- Installerte Node: nvm 0.40.6 via Homebrew (init i `~/.zshrc`, `NVM_DIR=~/.nvm`), deretter `nvm install --lts` → Node v24.18.0 / npm 11.16.0, satt som default. Punkt 1 i `todo.md` er dermed ferdig.
- Gjenopprettet rot-`README.md` som kort prosjektbeskrivelse med peker til `docs/`.
- Committet og pushet dokumentasjonen: `README.md`, `docs/` og `dev-log.md`. Punkt 2 i `todo.md` er dermed ferdig.
- Installerte `gh` (2.96.0) og logget inn som `jonasols1g`. Forsøkte å slå på GitHub Pages, men repoet er privat og gratisplanen støtter ikke Pages for private repoer. Beslutning: punkt 3 utsatt til fase 9 — da velges enten offentlig repo eller GitHub Pro. Fase 1–8 er ikke blokkert.

- Ryddet `todo.md`: løste punkter (Node, dokumentasjons-commit) fjernet — historikken bor her i loggen.
- Satte opp subagent-team i `.claude/agents/` etter diskusjon med bruker (utvidet fra to til fire roller): `feature-planner` (vurderer nye features mot docs, read-only), `dev` (implementerer faser, kode + enhetstester), `reviewer` (diff-review mot docs og DoD, read-only) og `verifier` (kjører tester/bygg/E2E, endrer aldri kode). Bevisst droppet egne agenter for arkitektur, dokumentasjon og UX — dekkes av `feature-planner` og hovedsamtalen.

- Fase 1 (prosjektoppsett) implementert med agent-teamet: `dev` scaffoldet Vite 8 + React 19 + TS 6 med Tailwind v4 (`@tailwindcss/vite`), ESLint (type-checked) + Prettier, Vitest/RTL, Playwright (webServer mot produksjonsbygg), React Router, mappestruktur og CI-workflow uten Pages-deploy. 404-fallbacken ligger i selve build-scriptet, så den gjelder også lokalt og i E2E. `reviewer` godkjente med to småting (malrest `public/icons.svg` slettet, `lang="no"` i `index.html`) som ble fikset i hovedsamtalen; `verifier` bekreftet lint, enhetstest, E2E, build (404.html identisk med index.html) og Prettier grønt.

- CI grønn på push (begge jobber, inkl. E2E). Fase 1 er dermed komplett iht. Definition of done.

- La om agent-arbeidsflyten til PR-basert (`.claude/agents/`): `dev` jobber nå på feature-branch (`feat/fase-N-…`) og åpner PR mot `main`; `reviewer` konkluderer alltid med en kommentar på PR-en via `gh pr comment` («endringer kreves» med funn, eller «godkjent» som verifikasjon) — `gh pr review --approve` går ikke siden PR-ene er fra samme GitHub-bruker. Funn fikses av `dev` på samme branch og re-reviewes, i loop til godkjent. Deretter sjekker `verifier` ut branchen (`gh pr checkout`) og kjører tester/bygg/E2E; ved grønt squash-merger hovedsamtalen PR-en (`gh pr merge --squash --delete-branch`) — én fase blir én commit på `main`, som i fase 1.

- Strammet inn agent-arbeidsflyten etter en gjennomgang: ny `CLAUDE.md` i rota dokumenterer orkestreringen (spawn-rekkefølge, review-runder via SendMessage til samme agent, eskalering til hovedsamtalen ved uenighet etter to runder, merge og etterarbeid). `reviewer` sjekker nå `gh pr checks` først (rød CI = blokkerende funn) og skal ta eksplisitt stilling til bestridte funn. `verifier` bruker grønn CI som bevis for lint/tester/E2E/bygg og bruker lokal tid på å drive den berørte flyten manuelt mot preview-bygget (nå obligatorisk, ikke «ved behov»). `dev` fikk verktøysavgrensning i frontmatter og krav om ordrett testresultat i rapporten. Både `dev` og `verifier` avslutter alltid på `main`, siden arbeidskatalogen deles.

- Fase 2 (domenemodell, `MediaProvider`-interface og `MockMediaProvider`) implementert via PR #1 med full agent-loop: `dev` → `reviewer` (godkjent uten funn) → `verifier` (grønn CI + drev provider-API-et manuelt mot produksjonsbygget, 11/11 sjekker) → squash-merge. Typene ordrett fra `data-model.md`; mock-katalog med 5 titler inkl. null-tilfellene (Solaris uten RT-score, Oppenheimer uten streaming). 20 enhetstester.
- Docs-avvik funnet av `dev`: `MediaProviderError`-snutten i `architecture.md` brukte parameter properties, som `erasableSyntaxOnly: true` i tsconfig forbyr. Implementert med eksplisitte felt (identisk offentlig flate); snutten i docs oppdatert til å matche.

**Neste:** fase 3 i `dev-tasks.md` (cache-lag).

## 2026-07-16

Prosjektstart. Ingen kode skrevet ennå — dagen gikk med til planlegging og dokumentasjon.

- `first commit` (ee55345): tomt repo med en én-linjes `README.md`.
- Planleggingsrunde med bruker som avklarte omfang: 100 % klient-side webapp for oppslag på film/serie og en personlig watchlist. Enkeltbruker, ingen innlogging, ingen deling.
- Bekreftet teknisk stack: React + TypeScript + Vite, Tailwind, React Router, `localStorage` for både watchlist og cache, Web Speech API (`nb-NO`) for talesøk med fallback til tekstsøk.
- Valgte datakilder: OMDb for søk og titteldata, Movie of the Night for strømmetilgjengelighet. TMDB forkastet. IMDb-ID (`tt0133093`) er felles nøkkel og `Media.id`, så de to API-ene kan kalles parallelt i `getDetails`.
- Verifiserte forutsetninger med `curl` i stedet for å anta: både OMDb og MOTN svarer over https med `access-control-allow-origin: *`, og MOTN-preflight godtar `X-API-Key`. Dermed holder «ingen backend» — ingen proxy trengs.
- Landet på `MediaProvider`-abstraksjonen med `CachingMediaProvider` og `CompositeMediaProvider`, slik at fase 1–9 kan bygges mot en `MockMediaProvider` og ekte API-er kobles på først i fase 10.
- La til Playwright E2E i teststrategien etter korrigering fra bruker — E2E kjører mot stubbet nettverk og produksjonsbygg, aldri mot ekte API-er (MOTN-kvoten er 100 kall/døgn).
- Sjekket maskin- og repo-status: Node er **ikke** installert (verken `node`, `npm`, `nvm` eller via Homebrew), `gh` mangler også. GitHub-repoet finnes og `main` er pushet.
- Skrev dokumentasjonen i `docs/`: `README.md`, `architecture.md`, `data-model.md`, `design.md`, `dev-tasks.md` og `todo.md`. Rot-`README.md` ble flyttet inn dit. `todo.md` lister de tre tingene som blokkerer fase 1: installer Node, commit dokumentasjonen, slå på GitHub Pages med Source: GitHub Actions.

**Neste:** `todo.md` i rekkefølge, deretter fase 1 i `dev-tasks.md`.
