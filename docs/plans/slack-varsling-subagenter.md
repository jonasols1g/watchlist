# Slack-varsling for agent-arbeidsflyten

> **Status:** fullført 2026-07-19. Implementert og merget via issue #34 → PR #35, trial-kjørt via #36 → PR #37 (som avdekket at `username`/`icon_emoji` ignoreres av Slack-app-tilknyttede webhooks, se korrigeringen i "Valgt tilnærming"), og fikset via issue #38 → PR #39 (avsenderidentitet flyttet til et emoji+fett-navn-prefiks i selve `text`-feltet). Bekreftet korrekt i Slack av bruker etter siste merge. Videre korrigert 2026-07-19 (direkte brukerønske, se andre korrigering i "Valgt tilnærming"): emoji-prefikset fjernet igjen — kun fett navn står nå som prefiks, emoji brukes kun til slutt ved konkrete utfall. Dette er en plan for utviklings-tooling, ikke en beskrivelse av gjeldende arkitektur — se `CLAUDE.md` for gjeldende agent-arbeidsflyt.

## Kontekst

Watchlist-prosjektet driver utvikling gjennom et fast agent-orkestrert oppsett (se `CLAUDE.md`, "Agent-arbeidsflyt"): hovedsamtalen spawner `feature-planner`, `dev`, `reviewer` og `verifier` i tur og orden for hvert issue. I dag er den eneste synlige statusen enten i selve Claude Code-terminalen mens en agent kjører, eller i GitHub (issue-/PR-kommentarer, board-status). Brukeren må aktivt sjekke for å vite hva som skjer.

Ønsket er å få statusoppdateringer push-et til Slack i sanntid — når en agent tar tak i en oppgave og når den er ferdig — og at hver "avsender" (de fire agent-typene, samt hovedsamtalen selv) er visuelt gjenkjennelig i Slack under eget navn/ikon, slik at det er lett å se hvem som gjør hva uten å måtte holde et vindu åpent.

Nylig commit `b3d76e6` strammet bevisst inn alle fire agent-filene for å redusere token-/verktøybruk per kjøring. Løsningen under er designet for å ikke motvirke det: ett delt Node-script, ett Bash-kall per varslingspunkt, ingen nye avhengigheter, ingen MCP-server, og varsling som aldri kan blokkere arbeidsflyten selv om Slack er nede.

**Valgt tilnærming:** Slack Incoming Webhook (vurdert mot bot-token og MCP-server, begge forkastet som tyngre oppsett og i strid med kost-innstrammingen fra `b3d76e6`) — én webhook-URL, `POST` med JSON `{text}`.

**Korrigert 2026-07-19 (funnet under trial-runde på #36/PR #37):** den opprinnelige antakelsen om at `username`/`icon_emoji` i JSON-bodyen overstyrer avsendernavn/ikon, stemmer **kun** for gamle "legacy custom integration"-webhooks (rene `/services/`-URL-er uten tilknyttet app). Webhooks opprettet via en Slack-app — akkurat oppskriften i punkt 5 under — ignorerer disse feltene stille; meldingen arver alltid appens egne, faste navn/ikon satt under *Basic Information* i appinnstillingene. Løsningen er i stedet at scriptet selv setter avsenderidentiteten **inne i** `text`-feltet, som ett prefiks foran meldingen: emoji-kortkode (rendres av Slack som vanlig i meldingstekst) + fet visningsnavn, f.eks. `:mag: *Gransker Guri:* Review PR #37 (issue #36).`. Dette bevarer den visuelle skillingen mellom de fem avsenderne og krever fortsatt ingen ekstra Slack-app-oppsett — bare ikke som eget avatar/navn på selve meldingsboksen, men som tekst i starten av hver linje.

**Korrigert 2026-07-19 (direkte brukerønske, uten eget issue — liten presist spesifisert justering):** emoji-prefikset i starten av hver melding fjernet igjen — kun det fete avsendernavnet (`*Gransker Guri:*`) står nå som prefiks i `text`-feltet, ingen `icon_emoji` i `SENDERS` lenger. I stedet plasseres emoji kun helt til slutt i meldinger som melder et faktisk utfall: ✅ når noe har gått bra (godkjent review, bestått verifisering, vellykket merge), 🛑 når noe har gått galt (endringer kreves, feilet verifisering). Verifier bruker i tillegg ⚠️ ved konklusjonen «bestått med forslag». Nøytrale statusmeldinger (oppstart, «flyttet til...») har ingen emoji i det hele tatt.

**Detaljnivå bekreftet av brukeren:** full sporing — start/slutt per sub-agent, review-rundemeldinger, og hovedsamtalens egne steg (board-flytting, spawn, merge) — men ett kall per faktisk hendelse, ingen dobbeltvarsling der to steg i `CLAUDE.md` beskriver samme fysiske handling.

## 1. Nytt script: `scripts/notify-slack.mjs`

Ny mappe `scripts/` på repo-rot-nivå (samme nivå som `src/`, `e2e/`). Bruker Node 24s native `fetch` — ingen nye npm-avhengigheter. `package.json` har allerede `"type": "module"`.

```js
#!/usr/bin/env node
// scripts/notify-slack.mjs
//
// Lettvekts Slack-varsling for agent-arbeidsflyten (se CLAUDE.md,
// "Agent-arbeidsflyt"). Brukes av hovedsamtalen og alle fire sub-agentene
// via ett enkelt Bash-kall: `node scripts/notify-slack.mjs <sender> "<melding>"`.
//
// Designmål: scriptet skal ALDRI blokkere eller forsinke agent-arbeidet.
// Mangler webhook-URL, er senderen ukjent, eller feiler nettverkskallet,
// logges det til stderr og scriptet avslutter uansett med exit 0.

const SENDERS = {
  orchestrator: { username: 'Orkestrator Ole' },
  'feature-planner': { username: 'Planlegger Pia' },
  dev: { username: 'Utvikler Ulrik' },
  reviewer: { username: 'Gransker Guri' },
  verifier: { username: 'Godkjenner Gunnar' },
};

function skip(reason) {
  console.error(`[notify-slack] hoppet over varsling: ${reason}`);
  process.exit(0);
}

const [, , senderKey, message] = process.argv;

if (!senderKey || !message) {
  skip('mangler argumenter — bruk: node scripts/notify-slack.mjs <sender> "<melding>"');
}

const sender = SENDERS[senderKey];
if (!sender) {
  skip(`ukjent sender "${senderKey}" (gyldige: ${Object.keys(SENDERS).join(', ')})`);
}

const webhookUrl = process.env.SLACK_WEBHOOK_URL;
if (!webhookUrl) {
  skip('SLACK_WEBHOOK_URL er ikke satt (se .claude/settings.local.json)');
}

const text = `*${sender.username}:* ${message}`;

try {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) skip(`Slack svarte ${res.status} ${res.statusText}`);
} catch (err) {
  skip(`fetch feilet: ${err instanceof Error ? err.message : String(err)}`);
}
```

`JSON.stringify` håndterer norske tegn/anførselstegn i meldingsteksten trygt — ingen manuell JSON-bygging i Bash. Kallende agent sender ferdig Slack-mrkdwn-formatert tekst (`*fet*`, `<url|lenketekst>`) som ett quotet argument — scriptet setter selv navneprefikset foran (`username`-feltet i `SENDERS`; `icon_emoji` er fjernet, se korrigeringen over). Emoji er ikke lenger en del av dette prefikset — se meldingsmalene i punkt 3 for hvor emoji faktisk brukes (kun til slutt, kun ved et konkret utfall).

## 2. Avsender-mapping (i scriptet, se over)

| Sender | Visningsnavn |
|---|---|
| `orchestrator` | Orkestrator Ole |
| `feature-planner` | Planlegger Pia |
| `dev` | Utvikler Ulrik |
| `reviewer` | Gransker Guri |
| `verifier` | Godkjenner Gunnar |

## 3. Meldingspunkter og maler

Slack mrkdwn (`*fet*`, `<url|tekst>`). `<nr>` = issue-nr, `<pr>` = PR-nr. Emoji kun helt til slutt i meldingen, og kun ved et konkret utfall — ✅ godt utfall, 🛑 dårlig utfall, ⚠️ (kun verifier) bestått med forslag. Nøytrale statusmeldinger har ingen emoji.

**feature-planner** — start: `Vurderer featureidé for <lenke|#<nr>>: "<tittel>".` · ferdig: `Vurdering ferdig for #<nr>: anbefaler *<anbefaling>*. Oppgaveliste levert til hovedsamtalen.`

**dev** — start ny oppgave: `Starter implementasjon av #<nr>: "<tittel>".` · PR åpnet: `PR <lenke|#<pr>> åpnet for #<nr>: "<tittel>".` · start fiks: `Fikser review-funn på PR #<pr>.` · ferdig fiks: `Fiks pushet til PR #<pr> — klar for ny review.`

**reviewer** — start: `Review PR #<pr> (issue #<nr>).` · konklusjon godkjent: `*Review: godkjent* for PR #<pr>. <lenke til kommentar> ✅` · konklusjon endringer kreves: `*Review: endringer kreves* for PR #<pr>. <lenke til kommentar> 🛑`

**verifier** — start: `Verifiserer PR #<pr> (issue #<nr>).` · konklusjon bestått: `*Verifisering: bestått* for PR #<pr>. <lenke til issue-kommentar> ✅` · konklusjon bestått med forslag: `*Verifisering: bestått med forslag* for PR #<pr>. <lenke til issue-kommentar> ⚠️` · konklusjon feilet: `*Verifisering: feilet* for PR #<pr>. <lenke til issue-kommentar> 🛑`

**orchestrator** — kun ved faktiske hendelser, ingen dobling med review-runder (dekkes allerede av dev/reviewer sine egne meldinger):
- Issue opprettet + Backlog (ev. slått sammen med Ready-melding for trivielle issues)
- Plan klar, flyttet til Ready
- Flyttet til In progress + dev spawnet (én melding)
- Flyttet til In review + reviewer spawnet (én melding)
- Verifisering startet
- Merget + flyttet til Done + dev-log oppdatert (én melding, avsluttet med ✅)

## 4. Secret-håndtering: `.claude/settings.local.json`

**Ikke** i `.env.local` — den følger Vite sitt `VITE_`-mønster og bakes inn i klientbygget, synlig for sluttbruker. En Slack-webhook er dev-tooling og hører hjemme i Claude Code sin egen, gitignorerte settings-fil:

```json
{
  "permissions": {
    "allow": [
      "Bash(bash ~/.claude/statusline-command.sh)",
      "WebFetch(domain:docs.movieofthenight.com)",
      "Bash(node scripts/notify-slack.mjs:*)"
    ]
  },
  "env": {
    "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/..."
  }
}
```

Bekreftet: filen er allerede utenfor versjonskontroll (ignoreres av en global git-ignore-regel, `**/.claude/settings.local.json` i `~/.config/git/ignore`) — ingen endring i repoets `.gitignore` nødvendig. `permissions.allow`-regelen unngår permission-prompt ved hvert varslingskall.

Webhooken er opprettet i Slack og URL-en er allerede satt som `SLACK_WEBHOOK_URL` i `.claude/settings.local.json` (2026-07-19). `permissions.allow`-regelen for `Bash(node scripts/notify-slack.mjs:*)` legges til når scriptet i punkt 1 faktisk eksisterer.

## 5. Ettlinjers tillegg i `.claude/agents/*.md`

Ingen restrukturering — kun én kort setning satt inn i eksisterende steg, i tråd med `b3d76e6`-filosofien:

- **dev.md**: etter "Ny oppgave" steg 1 → varsle `dev` "Starter implementasjon...". Etter steg 3 (PR åpnet) → varsle `dev` "PR åpnet...". Etter "Review-runde" steg 1 → varsle `dev` "Fikser review-funn...". Etter steg 4 (kommentar lagt) → varsle `dev` "Fiks pushet...".
- **reviewer.md**: rett før gjennomgangen starter (i "Din jobb") → varsle `reviewer` "Review PR...". Etter PR-kommentaren i "Konklusjonen skal alltid på PR-en" → varsle `reviewer` med konklusjonslinjen + lenke.
- **verifier.md**: rett før steg 1 i "Din jobb" → varsle `verifier` "Verifiserer PR...". Etter issue-kommentaren i "Konklusjonen skal alltid på issuen" → varsle `verifier` med konklusjonslinjen + lenke.
- **feature-planner.md**: rett før analysen starter (slutten av "Din jobb"-innledningen) → varsle `feature-planner` "Vurderer featureidé...". Etter steg 3 (DoD levert) → varsle `feature-planner` "Vurdering ferdig...".

## 6. Endringer i `CLAUDE.md`

Legg til én varslingssetning på slutten av hvert nummererte steg i "Agent-arbeidsflyt" (steg 1, 2, 3, 5, 6 — **ikke** steg 4, se begrunnelse punkt 3), pluss en ny kort underseksjon "### Slack-varsling" rett etter den nummererte listen (før "## Rammer som gjelder alt arbeid") som forklarer scriptet og at `SLACK_WEBHOOK_URL` må settes lokalt (se punkt 4 — allerede gjort).

## Kritiske filer

- `scripts/notify-slack.mjs` (ny)
- `.claude/settings.local.json`
- `CLAUDE.md`
- `.claude/agents/dev.md`, `reviewer.md`, `verifier.md`, `feature-planner.md`

## Verifisering

1. **Isolert scripttest** før agent-filene endres: `SLACK_WEBHOOK_URL` er allerede satt (punkt 4) — kjør `node scripts/notify-slack.mjs dev "Testmelding — ignorer."` og bekreft at meldingen i Slack starter med `*Utvikler Ulrik:*` (fet navn i selve teksten, ingen emoji i starten — se korrigeringen 2026-07-19 i "Valgt tilnærming"). Gjenta for de fire andre senderne, og test at en melding med `✅`/`🛑`/`⚠️` til slutt (f.eks. `node scripts/notify-slack.mjs verifier "Testmelding — ignorer. ✅"`) faktisk vises korrekt. Test feilveien: tom `SLACK_WEBHOOK_URL` og ukjent sender-nøkkel skal begge gi exit 0 + stderr-linje, ingen krasj. Bekreft at permission-regelen faktisk unngår prompt ved kall via Bash-verktøyet.
2. **Full trial på et trivielt issue**: kjør hele `CLAUDE.md`-flyten steg 1–6 på et lite issue og observer i Slack at meldingene ankommer i riktig rekkefølge og antall (jf. punkt 3), uten duplikater eller forsinkelse. Provoser gjerne én review-runde bevisst for å bekrefte at dev/reviewer sine runde-meldinger også trigges korrekt.
