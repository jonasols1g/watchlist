# Watchlist — instruksjoner for hovedsamtalen

100 % klient-side webapp (React + TypeScript + Vite, Tailwind, React Router) for film-/serieoppslag og personlig watchlist. All arkitektur og design er besluttet og dokumentert i `docs/` — les relevant dokument før beslutninger tas. Oppgavesporing skjer i GitHub-prosjektet [«Watchlist»](https://github.com/users/jonasols1g/projects/2) (prosjekt-nummer 2, eier `jonasols1g`) — se referansetabellen under; dagslogg føres fortsatt i `dev-log.md` i rota.

### GitHub Project — referanse

- Prosjekt-node-ID: `PVT_kwHOEfx_Xc4BdvxI`
- Status-felt-ID: `PVTSSF_lAHOEfx_Xc4BdvxIzhYPG40`
- Status-opsjoner: Backlog `f75ad846` · Ready `61e4505c` · In progress `47fc9ee4` · In review `df73e18b` · Done `98236657`

```
gh issue create -R jonasols1g/watchlist --title "..." --body "..."
gh project item-add 2 --owner jonasols1g --url <issue-url> --format json   # gir item-id
gh project item-edit --id <item-id> --project-id PVT_kwHOEfx_Xc4BdvxI \
  --field-id PVTSSF_lAHOEfx_Xc4BdvxIzhYPG40 --single-select-option-id <opsjons-id>
```

## Agent-arbeidsflyt (én oppgave = ett issue = én PR = én squash-commit på `main`)

Oppgaver implementeres av subagent-teamet i `.claude/agents/`. Hovedsamtalen orkestrerer og er den eneste som merger og flytter kort på prosjektboardet. **Kun én agent berører repoet om gangen**, og mellom agentkjøringer skal arbeidskatalogen stå på `main` — agentene er instruert til å bytte tilbake selv.

1. **Planlegging (kun nye features):** hovedsamtalen oppretter et issue (`gh issue create`) og legger det til boardet i status Backlog. `feature-planner` vurderer idéen mot docs og leverer en oppgaveliste + Definition of done formatert som issue-body; hovedsamtalen skriver den inn (`gh issue edit <nr> --body`) og flytter kortet til Ready. Trivielle, veldefinerte oppgaver (typisk bugs) kan opprettes direkte i Ready uten planleggingsrunde.
2. **Implementasjon:** flytt kortet til In progress, spawn deretter `dev` med issue-nummeret. Dev jobber på `feat/<issue-nr>-kortnavn`, åpner PR mot `main` med `Closes #<issue-nr>` i beskrivelsen, og rapporterer branch + PR-nummer.
3. **Review:** flytt kortet til In review, spawn deretter `reviewer` med PR-nummeret. Reviewer sjekker CI-status (`gh pr checks`) og diffen mot issuens DoD og docs, og konkluderer alltid med en PR-kommentar (`**Review: godkjent**` eller `**Review: endringer kreves**`).
4. **Review-runder:** ved funn, send funnene til **samme** dev-agent via SendMessage — ikke ny spawn; konteksten om implementasjonsvalgene skal beholdes. Ny review-runde går tilsvarende via SendMessage til samme reviewer. Er dev og reviewer fortsatt uenige om samme funn etter to runder, avgjør hovedsamtalen saken (eventuelt med brukeren) i stedet for å kjøre flere runder.
5. **Verifisering:** etter godkjent review, spawn `verifier` med PR-nummeret. Verifier bekrefter grønn CI (som beviser lint/enhetstester/E2E/bygg), driver den berørte flyten manuelt mot produksjonsbygget, og legger konklusjonen som kommentar på **issuen** (ikke PR-en — se `verifier.md`). Feiler noe: tilbake til steg 4.
6. **Merge og etterarbeid:** ved verifisert grønt squash-merger hovedsamtalen med `gh pr merge <nr> --squash --delete-branch` (issuen auto-lukkes via `Closes #`) og flytter kortet til Done. Deretter oppdaterer hovedsamtalen `dev-log.md` og committer det direkte på `main`. Endret fasen en dokumentert beslutning, oppdateres relevant fil i `docs/` i samme slengen.

## Rammer som gjelder alt arbeid

- Dokumentasjonen i `docs/` er fasit; avvik er feil, og utdatert dokumentasjon rapporteres i stedet for at det improviseres rundt den.
- All datatilgang går gjennom `MediaProvider`-interfacet; fase 1–9 bygger mot `MockMediaProvider`.
- Ingen ekte API-kall før fase 10 — MOTN-kvoten er 100 kall/døgn. Playwright E2E kjører alltid mot stubbet nettverk og produksjonsbygg.
