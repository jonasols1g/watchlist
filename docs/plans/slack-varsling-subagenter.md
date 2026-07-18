# Slack-varsling for agent-arbeidsflyten

> **Status:** planlagt 2026-07-18, ikke påbegynt. Dette er en plan for utviklings-tooling, ikke en beskrivelse av gjeldende arkitektur — se `CLAUDE.md` for gjeldende agent-arbeidsflyt. Når arbeidet startes, spores det som et GitHub-issue jf. `CLAUDE.md`, med denne filen som utgangspunkt.

## Kontekst

Watchlist-prosjektet driver utvikling gjennom et fast agent-orkestrert oppsett (se `CLAUDE.md`, "Agent-arbeidsflyt"): hovedsamtalen spawner `feature-planner`, `dev`, `reviewer` og `verifier` i tur og orden for hvert issue. I dag er den eneste synlige statusen enten i selve Claude Code-terminalen mens en agent kjører, eller i GitHub (issue-/PR-kommentarer, board-status). Brukeren må aktivt sjekke for å vite hva som skjer.

Ønsket er å få statusoppdateringer push-et til Slack i sanntid — når en agent tar tak i en oppgave og når den er ferdig — og at hver "avsender" (de fire agent-typene, samt hovedsamtalen selv) er visuelt gjenkjennelig i Slack under eget navn/ikon, slik at det er lett å se hvem som gjør hva uten å måtte holde et vindu åpent.

Nylig commit `b3d76e6` strammet bevisst inn alle fire agent-filene for å redusere token-/verktøybruk per kjøring. Løsningen under er designet for å ikke motvirke det: ett delt Node-script, ett Bash-kall per varslingspunkt, ingen nye avhengigheter, ingen MCP-server, og varsling som aldri kan blokkere arbeidsflyten selv om Slack er nede.

**Valgt tilnærming:** Slack Incoming Webhook (vurdert mot bot-token og MCP-server, begge forkastet som tyngre oppsett og i strid med kost-innstrammingen fra `b3d76e6`) — én webhook-URL, `POST` med JSON `{username, icon_emoji, text}`. Slack lar avsendernavn og ikon overstyres per melding uten noe ekstra app-oppsett, så alle fem avsendere kan dele én webhook.

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
  orchestrator: { username: 'Watchlist Orchestrator', icon_emoji: ':control_knobs:' },
  'feature-planner': { username: 'Feature Planner', icon_emoji: ':compass:' },
  dev: { username: 'Dev Agent', icon_emoji: ':hammer_and_wrench:' },
  reviewer: { username: 'Reviewer Agent', icon_emoji: ':mag:' },
  verifier: { username: 'Verifier Agent', icon_emoji: ':white_check_mark:' },
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

try {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: sender.username, icon_emoji: sender.icon_emoji, text: message }),
  });
  if (!res.ok) skip(`Slack svarte ${res.status} ${res.statusText}`);
} catch (err) {
  skip(`fetch feilet: ${err instanceof Error ? err.message : String(err)}`);
}
```

`JSON.stringify` håndterer norske tegn/anførselstegn i meldingsteksten trygt — ingen manuell JSON-bygging i Bash. Kallende agent sender ferdig Slack-mrkdwn-formatert tekst (`*fet*`, `<url|lenketekst>`) som ett quotet argument.

## 2. Avsender-mapping (i scriptet, se over)

| Sender | Visningsnavn | Emoji |
|---|---|---|
| `orchestrator` | Watchlist Orchestrator | `:control_knobs:` |
| `feature-planner` | Feature Planner | `:compass:` |
| `dev` | Dev Agent | `:hammer_and_wrench:` |
| `reviewer` | Reviewer Agent | `:mag:` |
| `verifier` | Verifier Agent | `:white_check_mark:` |

## 3. Meldingspunkter og maler

Slack mrkdwn (`*fet*`, `<url|tekst>`). `<nr>` = issue-nr, `<pr>` = PR-nr.

**feature-planner** — start: `Vurderer featureidé for <lenke|#<nr>>: "<tittel>".` · ferdig: `Vurdering ferdig for #<nr>: anbefaler *<anbefaling>*. Oppgaveliste levert til hovedsamtalen.`

**dev** — start ny oppgave: `Starter implementasjon av #<nr>: "<tittel>".` · PR åpnet: `PR <lenke|#<pr>> åpnet for #<nr>: "<tittel>".` · start fiks: `Fikser reviewer-funn på PR #<pr>.` · ferdig fiks: `Fiks pushet til PR #<pr> — klar for ny review.`

**reviewer** — start: `Reviewer PR #<pr> (issue #<nr>).` · konklusjon: `*Review: godkjent*` eller `*Review: endringer kreves*` `for PR #<pr>. <lenke til kommentar>`

**verifier** — start: `Verifiserer PR #<pr> (issue #<nr>).` · konklusjon: `*Verifisering: bestått* / *bestått med forslag* / *feilet*` `for PR #<pr>. <lenke til issue-kommentar>`

**orchestrator** — kun ved faktiske hendelser, ingen dobling med review-runder (dekkes allerede av dev/reviewer sine egne meldinger):
- Issue opprettet + Backlog (ev. slått sammen med Ready-melding for trivielle issues)
- Plan klar, flyttet til Ready
- Flyttet til In progress + dev spawnet (én melding)
- Flyttet til In review + reviewer spawnet (én melding)
- Verifisering startet
- Merget + flyttet til Done + dev-log oppdatert (én melding)

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

## 5. Opprette Slack-webhooken (brukeren gjør dette selv)

1. `https://api.slack.com/apps` → *Create New App* → *From scratch* → velg workspace, gi den et navn (f.eks. "Watchlist Agent Notifications").
2. *Incoming Webhooks* i sidemenyen → skru på *Activate Incoming Webhooks*.
3. *Add New Webhook to Workspace* → velg kanal (f.eks. en dedikert `#watchlist-dev`) → godkjenn.
4. Kopier `https://hooks.slack.com/services/...`-URL-en inn som `SLACK_WEBHOOK_URL` i `.claude/settings.local.json` (punkt 4).

## 6. Ettlinjers tillegg i `.claude/agents/*.md`

Ingen restrukturering — kun én kort setning satt inn i eksisterende steg, i tråd med `b3d76e6`-filosofien:

- **dev.md**: etter "Ny oppgave" steg 1 → varsle `dev` "Starter implementasjon...". Etter steg 3 (PR åpnet) → varsle `dev` "PR åpnet...". Etter "Review-runde" steg 1 → varsle `dev` "Fikser reviewer-funn...". Etter steg 4 (kommentar lagt) → varsle `dev` "Fiks pushet...".
- **reviewer.md**: rett før gjennomgangen starter (i "Din jobb") → varsle `reviewer` "Reviewer PR...". Etter PR-kommentaren i "Konklusjonen skal alltid på PR-en" → varsle `reviewer` med konklusjonslinjen + lenke.
- **verifier.md**: rett før steg 1 i "Din jobb" → varsle `verifier` "Verifiserer PR...". Etter issue-kommentaren i "Konklusjonen skal alltid på issuen" → varsle `verifier` med konklusjonslinjen + lenke.
- **feature-planner.md**: rett før analysen starter (slutten av "Din jobb"-innledningen) → varsle `feature-planner` "Vurderer featureidé...". Etter steg 3 (DoD levert) → varsle `feature-planner` "Vurdering ferdig...".

## 7. Endringer i `CLAUDE.md`

Legg til én varslingssetning på slutten av hvert nummererte steg i "Agent-arbeidsflyt" (steg 1, 2, 3, 5, 6 — **ikke** steg 4, se begrunnelse punkt 3), pluss en ny kort underseksjon "### Slack-varsling" rett etter den nummererte listen (før "## Rammer som gjelder alt arbeid") som forklarer scriptet, at `SLACK_WEBHOOK_URL` må settes lokalt, og lenker til oppskriften i punkt 5.

## Kritiske filer

- `scripts/notify-slack.mjs` (ny)
- `.claude/settings.local.json`
- `CLAUDE.md`
- `.claude/agents/dev.md`, `reviewer.md`, `verifier.md`, `feature-planner.md`

## Verifisering

1. **Isolert scripttest** før agent-filene endres: opprett webhook (punkt 5), sett `SLACK_WEBHOOK_URL`, kjør `node scripts/notify-slack.mjs dev "Testmelding — ignorer."` og bekreft riktig navn/ikon i Slack. Gjenta for de fire andre senderne. Test feilveien: tom `SLACK_WEBHOOK_URL` og ukjent sender-nøkkel skal begge gi exit 0 + stderr-linje, ingen krasj. Bekreft at permission-regelen faktisk unngår prompt ved kall via Bash-verktøyet.
2. **Full trial på et trivielt issue**: kjør hele `CLAUDE.md`-flyten steg 1–6 på et lite issue og observer i Slack at meldingene ankommer i riktig rekkefølge og antall (jf. punkt 3), uten duplikater eller forsinkelse. Provoser gjerne én review-runde bevisst for å bekrefte at dev/reviewer sine runde-meldinger også trigges korrekt.
