# TODO — før fase 1 kan starte

Småting som må på plass før implementasjonen begynner. Når disse er gjort, fortsetter arbeidet i [dev-tasks.md](./dev-tasks.md) fra fase 1.

Status per 2026-07-17.

## 1. Installer Node — ✅ gjort 2026-07-17

Nvm ble installert via `brew install nvm` (0.40.6, ikke curl-scriptet), init-linjene ligger i `~/.zshrc`.

- [x] Installer nvm (`brew install nvm`).
- [x] Gjeldende LTS bekreftet: Node 24 (`v24.18.0`).
- [x] `nvm install --lts && nvm alias default lts/*`
- [x] Verifisert: `node --version` → v24.18.0, `npm --version` → 11.16.0.

**Merk (brew-caveat):** Homebrew-varianten av nvm er offisielt usupportert av nvm-prosjektet. `$NVM_DIR` er satt til `~/.nvm` (ikke Cellar-stien), så Node-installasjoner overlever `brew upgrade nvm`.

**Merk:** Selve pinningen (`.nvmrc` + `"engines"` i `package.json`) er allerede en oppgave i fase 1 i [dev-tasks.md](./dev-tasks.md) — den skal ikke gjøres her. Her handler det bare om å få Node på maskinen, og om å vite *hvilken* versjon som skal pinnes.

## 2. Commit dokumentasjonen

`docs/` er fortsatt untracked, og slettingen av rot-`README.md` er ucommittet. Få planen inn i git før første kodelinje, så du har et fast referansepunkt å diffe mot underveis.

- [x] Gjenopprett rot-`README.md` — gjort 2026-07-17, nå som kort prosjektbeskrivelse pluss peker til `docs/`.
- [x] `git add README.md docs/ && git commit` — gjort 2026-07-17, `dev-log.md` ble også tatt med.
- [x] `git push`

## 3. Aktiver GitHub Pages — ⏸ utsatt 2026-07-17 (blokkert av privat repo)

Repoet finnes allerede (`git@github.com:jonasols1g/watchlist.git`, verifisert 2026-07-17 — SSH-auth virker, `main` er pushet). Navnet er `watchlist`, som stemmer med `base: '/watchlist/'`. Produksjons-URL blir <https://jonasols1g.github.io/watchlist/>.

**Funn 2026-07-17:** Forsøk på å aktivere Pages via `gh api` feilet med «Your current plan does not support GitHub Pages for this repository» — repoet er **privat**, og Pages på gratisplanen krever offentlig repo. Beslutning: utsatt til fase 9, da Pages først trengs reelt. Da må ett av disse velges:

- Gjør repoet offentlig (`gh repo edit --visibility public`) — gratis; koden er trygg å publisere (API-nøkler ligger som Actions-secrets, ikke i repoet), men husk risikonotatet i [architecture.md](./architecture.md#kjente-forutsetninger-og-risikoer) om eksponerte nøkler i bundelen når appen deles.
- Oppgrader til GitHub Pro og behold repoet privat (Pages-siden blir uansett offentlig for den som har URL-en).

- [ ] (Fase 9) Velg løsning over, og slå deretter på Pages med **Source: GitHub Actions** (ikke «Deploy from a branch» — workflowen bruker `actions/deploy-pages`): `gh api -X POST repos/jonasols1g/watchlist/pages -f build_type=workflow`

Fase 1–8 er ikke blokkert av dette; deploy-workflowen kan til og med skrives i fase 1, den vil bare feile på deploy-steget til bryteren er på.

---

## Ikke et hinder, men verdt å vite

- **`gh` (GitHub CLI) er ikke installert.** Ikke nødvendig — git over SSH virker allerede. Men `brew install gh` gjør det enklere å sette Actions-secrets fra terminalen når fase 10 kommer og API-nøklene skal inn.
- **API-nøkler trengs først i fase 10.** OMDb og MOTN kan vente — fase 1–9 kjører på `MockMediaProvider`. Ingen grunn til å skaffe dem nå.
