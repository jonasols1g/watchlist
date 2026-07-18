# Dokumentasjon — watchlist

`watchlist` er en nettapplikasjon for å slå opp filmer og serier, se informasjon om dem (bilde, beskrivelse, sjanger, IMDb-score, Rotten Tomatoes-score, strømmetjenester) og holde en personlig oversikt over hva man planlegger å se og hva man har sett.

Appen er **100 % klient-side** — det finnes ingen server vi selv drifter. Cache av søk/oppslag lagres i nettleserens `localStorage`. Watchlisten persisteres i **Firebase/Firestore** under en usynlig, anonym Firebase-auth-identitet (i tillegg til en lokal `localStorage`-kopi), se [Identitet og datalagring](./architecture.md#identitet-og-datalagring-firebase). Titteldata hentes fra to API-er som begge kalles direkte fra nettleseren: **OMDb** for søk og titteldata, og **Movie of the Night** for strømmetilgjengelighet (se [Datakilder](./architecture.md#datakilder)).

## Dokumenter

- **[architecture.md](./architecture.md)** — Teknisk arkitektur: lagdeling, prosjektstruktur, `MediaProvider`-abstraksjonen, caching-design, state management og kjente forutsetninger/risikoer.
- **[data-model.md](./data-model.md)** — TypeScript-datamodell for media, ratings, streaming-tilgjengelighet, watchlist-oppføringer og cache.
- **[design.md](./design.md)** — Sider/ruter, søkeflyt (tekst og tale), visning av oppslagsresultater, watchlist-UX og styling-tilnærming.
- **[dev-log.md](../dev-log.md)** — Daglig logg over hva som er gjort (ligger i prosjektroten).

Oppgavesporing skjer i GitHub-prosjektet [«Watchlist»](https://github.com/users/jonasols1g/projects/2) — ikke lenger i `docs/`. Det arkiverte **[archive/dev-tasks.md](./archive/dev-tasks.md)** viser fase-for-fase-planen appen opprinnelig ble bygget etter (alle 11 faser er ferdige).

## Nøkkelbeslutninger (kort)

| Tema | Valg |
|---|---|
| Rammeverk | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| Routing | React Router |
| Lagring | Firebase/Firestore (watchlist, under anonym auth-identitet) + `localStorage` (cache og lokal watchlist-kopi) |
| Identitet | Usynlig anonym Firebase Auth — ingen innloggings-UI, enhetsbundet (ikke kontobundet) i denne runden |
| Talesøk | Web Speech API (`lang: 'en-US'`), med fallback til tekstsøk |
| Søke-trigger | Eksplisitt submit (Enter/knapp) — ikke søk-mens-du-skriver |
| Datakilde | OMDb (søk, beskrivelse, sjanger, plakat, IMDb-/RT-score) + Movie of the Night (strømmetjenester), abstrahert bak et `MediaProvider`-interface |
| Felles ID | IMDb-ID (`tt0133093`) er `Media.id` og binder de to kildene sammen |
| Testing | Vitest + React Testing Library (enhet/komponent) og Playwright (E2E mot stubbet nettverk, se [Teststrategi](./architecture.md#teststrategi)) |
| Verktøykjede | Node LTS pinnet, npm, Tailwind v4, `strict` TS + `noUncheckedIndexedAccess`, named exports |
| CI/Deploy | GitHub Actions (lint/enhetstester/E2E/`npm audit`) → GitHub Pages (understi + 404-fallback, CSP som meta-tag) |
