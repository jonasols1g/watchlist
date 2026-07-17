# Utviklingslogg

Kort logg over hva som er gjort per dag. Nyeste øverst. Én oppføring per dag det er gjort arbeid — noen linjer, ikke en rapport. Detaljene hører hjemme i dokumentene i `docs/`; her står bare hva som skjedde og hva som er neste steg.

## 2026-07-17

- Endret talesøk fra norsk til engelsk (`lang: 'en-US'` i stedet for `nb-NO`) i `docs/README.md`, `docs/design.md` og `docs/dev-tasks.md`. Ingen kode berørt — talesøk er ikke implementert ennå (fase 8).
- Installerte Node: nvm 0.40.6 via Homebrew (init i `~/.zshrc`, `NVM_DIR=~/.nvm`), deretter `nvm install --lts` → Node v24.18.0 / npm 11.16.0, satt som default. Punkt 1 i `todo.md` er dermed ferdig.
- Gjenopprettet rot-`README.md` som kort prosjektbeskrivelse med peker til `docs/`.
- Committet og pushet dokumentasjonen: `README.md`, `docs/` og `dev-log.md`. Punkt 2 i `todo.md` er dermed ferdig.
- Installerte `gh` (2.96.0) og logget inn som `jonasols1g`. Forsøkte å slå på GitHub Pages, men repoet er privat og gratisplanen støtter ikke Pages for private repoer. Beslutning: punkt 3 utsatt til fase 9 — da velges enten offentlig repo eller GitHub Pro. Fase 1–8 er ikke blokkert.

**Neste:** fase 1 i `dev-tasks.md`.

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
