# Streamie — instruksjoner for hovedsamtalen

100 % klient-side webapp (React + TypeScript + Vite, Tailwind, React Router) for film-/serieoppslag og personlig watchlist. All arkitektur og design er besluttet og dokumentert i `docs/` — les relevant dokument før beslutninger tas. Oppgavesporing skjer i GitHub-prosjektet [«Streamie»](https://github.com/users/jonasols1g/projects/2) (prosjekt-nummer 2, eier `jonasols1g`) — se referansetabellen under; dagslogg føres fortsatt i `dev-log.md` i rota.

### GitHub Project — referanse

- Prosjekt-node-ID: `PVT_kwHOEfx_Xc4BdvxI`
- Status-felt-ID: `PVTSSF_lAHOEfx_Xc4BdvxIzhYPG40`
- Status-opsjoner: Backlog `f75ad846` · Ready `61e4505c` · In progress `47fc9ee4` · In review `df73e18b` · Done `98236657`

```
gh issue create -R jonasols1g/streamie --title "..." --body "..."
gh project item-add 2 --owner jonasols1g --url <issue-url> --format json   # gir item-id
gh project item-edit --id <item-id> --project-id PVT_kwHOEfx_Xc4BdvxI \
  --field-id PVTSSF_lAHOEfx_Xc4BdvxIzhYPG40 --single-select-option-id <opsjons-id>
```

## Agent-arbeidsflyt (én oppgave = ett issue = én PR = én squash-commit på `main`)

Oppgaver implementeres av subagent-teamet i `.claude/agents/`. Hovedsamtalen orkestrerer og er den eneste som merger og flytter kort på prosjektboardet.

**Isolasjon er standard, ikke unntak.** Enhver agent som gjør git-operasjoner mot repoet — `dev`, `reviewer` og `verifier` likt — spawnes med `isolation: "worktree"` på Agent-kallet, slik at hver kjøring får sin egen, midlertidige git worktree fremfor å dele hovedsamtalens arbeidskatalog. Dette gjelder uansett om oppgavene kjøres sekvensielt eller i parallell: delt arbeidskatalog har vist seg å gi reell flakiness (branch byttet under en annen agents føtter, kolliderende `vite preview`-prosesser, feilplasserte commits) selv når «bare én» kjøring var tiltenkt om gangen. `feature-planner` er unntaket — den er strengt read-only mot GitHub/docs og trenger ikke isolasjon.

**Det samme gjelder hovedsamtalens egne commits direkte på `main`** (f.eks. `dev-log.md`, `docs/`-oppdateringer etter merge): ikke commit i den delte hovedkatalogen hvis det er noen sjanse for at en agent kjører eller nylig har kjørt der. I stedet: `git worktree add <midlertidig-sti> -b <midlertidig-branch> origin/main`, gjør endringen og committen der, `git push origin <midlertidig-branch>:main`, og rydd opp igjen (`git worktree remove`, `git branch -D`). Den delte hovedkatalogen er kun trygg å bruke direkte når hovedsamtalen er helt sikker på at ingen agent er aktiv eller nylig avsluttet der.

1. **Planlegging (kun nye features):** hovedsamtalen oppretter et issue (`gh issue create`) og legger det til boardet i status Backlog. `feature-planner` vurderer idéen mot docs og leverer en oppgaveliste + Definition of done formatert som issue-body; hovedsamtalen skriver den inn (`gh issue edit <nr> --body`) og flytter kortet til Ready. Trivielle, veldefinerte oppgaver (typisk bugs) kan opprettes direkte i Ready uten planleggingsrunde. Varsle Slack ved hver faktisk hendelse: `node scripts/notify-slack.mjs orchestrator "..."` etter issue opprettet + Backlog, og igjen når planen er klar og kortet flyttet til Ready.
2. **Implementasjon:** flytt kortet til In progress, spawn deretter `dev` (med `isolation: "worktree"`) med issue-nummeret. Dev jobber på `feat/<issue-nr>-kortnavn`, åpner PR mot `main` med `Closes #<issue-nr>` i beskrivelsen, og rapporterer branch + PR-nummer. Varsle Slack (`node scripts/notify-slack.mjs orchestrator "..."`) med én melding for flytting til In progress + dev spawnet.
3. **Review:** flytt kortet til In review, spawn deretter `reviewer` (med `isolation: "worktree"`) med PR-nummeret. Reviewer sjekker CI-status (`gh pr checks`) og diffen mot issuens DoD og docs, og konkluderer alltid med en PR-kommentar (`**Review: godkjent**` eller `**Review: endringer kreves**`). Varsle Slack (`node scripts/notify-slack.mjs orchestrator "..."`) med én melding for flytting til In review + reviewer spawnet.
4. **Review-runder:** ved funn, send funnene til **samme** dev-agent via SendMessage — ikke ny spawn; konteksten om implementasjonsvalgene og den isolerte worktreen skal beholdes. Ny review-runde går tilsvarende via SendMessage til samme reviewer. Er dev og reviewer fortsatt uenige om samme funn etter to runder, avgjør hovedsamtalen saken (eventuelt med brukeren) i stedet for å kjøre flere runder.
5. **Verifisering:** etter godkjent review, spawn `verifier` (med `isolation: "worktree"`) med PR-nummeret. Verifier bekrefter grønn CI (som beviser lint/enhetstester/E2E/bygg), driver den berørte flyten manuelt mot produksjonsbygget, og legger konklusjonen som kommentar på **issuen** (ikke PR-en — se `verifier.md`). Feiler noe: tilbake til steg 4. Varsle Slack (`node scripts/notify-slack.mjs orchestrator "..."`) når verifisering startes.
6. **Merge og etterarbeid:** ved verifisert grønt squash-merger hovedsamtalen med `gh pr merge <nr> --squash --delete-branch` (issuen auto-lukkes via `Closes #`) og flytter kortet til Done. Deretter oppdaterer hovedsamtalen `dev-log.md` og committer det direkte på `main` — via den isolerte worktree-fremgangsmåten over dersom andre agenter er eller nylig var aktive. Endret fasen en dokumentert beslutning, oppdateres relevant fil i `docs/` i samme slengen. Varsle Slack (`node scripts/notify-slack.mjs orchestrator "..."`) med én melding for merget + flyttet til Done + dev-log oppdatert, avsluttet med ✅.

### Slack-varsling

Hvert varslingspunkt over (og de tilsvarende punktene i `.claude/agents/dev.md`, `reviewer.md`, `verifier.md`, `feature-planner.md`) går via `node scripts/notify-slack.mjs <sender> "<melding>"`, som POSTer til en delt Slack Incoming Webhook med avsendernavn satt per agent-type (`orchestrator`, `feature-planner`, `dev`, `reviewer`, `verifier` — se `docs/plans/slack-varsling-subagenter.md` for full avsender-mapping og meldingsmaler). Scriptet leser webhook-URL-en fra miljøvariabelen `SLACK_WEBHOOK_URL`, som må settes lokalt i den gitignorerte `.claude/settings.local.json` (`env.SLACK_WEBHOOK_URL`) — uten den hopper scriptet stille over varslingen (logger til stderr, exit 0) i stedet for å blokkere arbeidsflyten.

Meldingsteksten skal aldri ha emoji i starten. Emoji brukes kun helt til slutt, og kun i meldinger som melder et faktisk utfall: ✅ når noe har gått bra (godkjent review, bestått verifisering, vellykket merge), 🛑 når noe har gått galt (endringer kreves, feilet verifisering). Verifier bruker i tillegg ⚠️ ved konklusjonen «bestått med forslag». Nøytrale statusmeldinger (oppstart, «flyttet til...», «spawner...») har ingen emoji.

## Rammer som gjelder alt arbeid

- Dokumentasjonen i `docs/` er fasit; avvik er feil, og utdatert dokumentasjon rapporteres i stedet for at det improviseres rundt den.
- All datatilgang går gjennom `MediaProvider`-interfacet. Produksjon bruker `CompositeMediaProvider` (ekte OMDb-/MOTN-kall via `CachingMediaProvider`); `MockMediaProvider` er kun en testdobbel-mal for enhetstester.
- MOTN-kvoten er 100 kall/døgn — cache-laget holder appen innenfor grensen ved normal bruk. Playwright E2E kjører alltid mot stubbet nettverk og produksjonsbygg, aldri ekte API-er.
