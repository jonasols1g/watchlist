# Design

Se [architecture.md](./architecture.md) for teknisk struktur bak sidene beskrevet her, og [data-model.md](./data-model.md) for feltene som vises.

## Sider

| Rute | Side | Innhold |
|---|---|---|
| `/` | Hjem/søk | Søkefelt (tekst + tale), resultatgrid |
| `/mylist` | Watchlist | Faner "Planlagt" / "Sett" |
| `/title/:id` | Detaljvisning | Full informasjon om én tittel |
| `*` | 404 | Enkel melding + lenke tilbake til hjem |

`NavBar` vises på alle sider med lenker til Hjem og Watchlist. En `Footer` vises på alle sider og bærer attribusjonen (se [Attribusjon](#attribusjon)).

## Søkeflyt (tekst og tale)

- Søkefeltet (`SearchBar`) er alltid tilgjengelig og er standardveien inn — talesøk er et alternativ, ikke en erstatning.
- Søket trigges **eksplisitt** — ved Enter eller klikk på søkeknappen. Det søkes ikke mens man skriver (ingen debounce): enklere flyt med færre race-tilfeller å teste, færre API-kall og mindre cache. Et nytt submit avbryter et eventuelt pågående søk via `AbortSignal`, slik at et utdatert resultat aldri kan overskrive et nyere.
- En mikrofonknapp (`VoiceSearchButton`) vises ved siden av søkefeltet. Når nettleseren ikke støtter `SpeechRecognition` (Web Speech API) — typisk Firefox og Safari — vises knappen enten deaktivert med en forklarende tekst («Talesøk støttes ikke i denne nettleseren») eller skjules helt. Søkefeltet fungerer uendret uansett.
- Tekstsøk og talesøk går gjennom **nøyaktig samme kodepath**: begge ender i ett `handleSearch(query)`-kall på hjemsiden, som normaliserer query og kaller `MediaProvider.search`. Talesøk skiller seg kun ved at teksten kommer fra et tale-til-tekst-resultat (kun endelig/`isFinal`-resultat brukes) i stedet for tastatur.
- Mens talegjenkjenning lytter, vises en tydelig visuell indikasjon (f.eks. pulserende mikrofonikon). Feil fra talegjenkjenning (f.eks. nektet mikrofontilgang, ingen tale oppdaget) vises som en ikke-blokkerende feilmelding ved siden av søkefeltet — søkefeltet forblir brukbart.
- Talegjenkjenningen kjører med `lang: 'en-US'`: engelske titler («the lord of the rings») treffer riktig, og OMDb-katalogen er uansett engelskspråklig. Norske søkefraser støttes ikke via tale — da brukes tekstsøk. Merk at Chrome sender lydopptaket til Googles servere for gjenkjenning — akseptert risiko, se [architecture.md](./architecture.md#kjente-forutsetninger-og-risikoer).

## Visning av søkeresultater

`SearchResultsGrid` viser et rutenett av `SearchResultCard` for hvert treff:
- Plakatbilde (fallback til en generisk placeholder når `posterUrl` er `null`)
- Tittel og utgivelsesår
- Type (film/serie)

Klikk på et kort navigerer til `/title/:id`. Tre eksplisitte tilstander håndteres på siden: laster (skeleton/spinner), ingen treff (tom-tilstand med forslag om å prøve et annet søk), og feil (f.eks. nettverksfeil — vises med mulighet til å prøve igjen).

Søkeresultatene kommer fra OMDb, som gir maks 10 treff per side. V1 viser kun side 1 (bevisst avgrensning, se [architecture.md](./architecture.md#mediaprovider-abstraksjonen)) — altså inntil 10 resultater. Strømmetilgjengelighet vises **ikke** på søkeresultat-kortene; den hentes først på detaljsiden, slik at et søk aldri koster kall mot MOTNs kvote på 100/døgn.

## Detaljvisning

`TitleDetailPage` viser, i denne rekkefølgen:
1. Plakatbilde og tittel
2. Kort beskrivelse (`overview`)
3. Sjangre (`GenreTags`)
4. Rating (`RatingsBadge`): IMDb-score (0–10) og Rotten Tomatoes-score (0–100 %) side ved side, begge fra OMDb. Når en score er `null`, vises tydelig «Ikke tilgjengelig» i stedet for å skjule feltet eller vise en misvisende verdi som 0. RT-score mangler i praksis ofte — «ikke tilgjengelig» er en vanlig tilstand her, ikke et sjeldent unntak.
5. Strømmetjenester (`StreamingProvidersList`): logo/navn per tjeneste som tilbyr tittelen. Når `streaming` er `null` eller `offers` er tom, vises en tom-tilstand («Ingen strømmetjenester funnet for din region»). Lenker til strømmetjenester åpnes i ny fane med `target="_blank"` og `rel="noopener noreferrer"`; kun `https:`-URL-er rendres (validert i provider-laget, se [architecture.md](./architecture.md#robusthet-og-sikkerhet)).
6. `WatchlistToggleButton`: legg til i watchlist (som «planlagt»), eller — hvis tittelen allerede er i watchlisten — bytt status mellom «planlagt» og «sett», eller fjern fra watchlisten.

Samme null-håndtering (rating, streaming, plakat) gjenbrukes identisk på både søkeresultat-kort og detaljside gjennom delte komponenter i `components/media/`.

## Watchlist-UX

- `WatchlistPage` har to faner: **Planlagt** og **Sett**, som filtrerer `WatchlistItem`-listen på `status`.
- Hver oppføring vises som et `WatchlistItemCard` med plakat, tittel, år, og handlinger: bytt status (planlagt ↔ sett) og fjern fra listen.
- Klikk på et watchlist-kort navigerer til `/title/:id` for å se full informasjon (ferske rating/streaming-data hentes der, se [architecture.md](./architecture.md) for hvorfor watchlisten kun lagrer et lett snapshot).
- Tom-tilstand per fane når listen er tom (f.eks. «Du har ikke lagt til noe du planlegger å se ennå» med lenke til søk).
- «Sett»-status gjelder hele tittelen — for serier finnes ingen sporing per sesong/episode i v1 (bevisst avgrensning).
- Hvis lagring av en watchlist-endring feiler (full `localStorage` selv etter cache-opprydding), vises en synlig feilmelding — watchlist-skriving feiler aldri stille (se kvotehåndtering i [architecture.md](./architecture.md#cache-design)).

## Feilmeldinger

`ErrorMessage` (i `components/common/`) mapper `MediaProviderError.code` til faste, brukervennlige tekster:

| `code` | Melding |
|---|---|
| `network` | «Kunne ikke kontakte tjenesten — sjekk nettverket og prøv igjen» |
| `rate-limit` | «For mange forespørsler — vent litt og prøv igjen» |
| `not-found` | «Fant ikke tittelen» |
| `invalid-response` / `unknown` | «Noe gikk galt — prøv igjen» |

Tekniske detaljer logges til konsollen, aldri til bruker. Alle feiltilstander som kan gjentas (nettverk, rate-limit, ukjent) viser en «prøv igjen»-handling.

## Attribusjon

Movie of the Nights vilkår **krever** synlig attribusjon i appen. Dette er ikke valgfritt pynt — det er en betingelse for å bruke APIet, også på gratisplanen.

- En `Footer`-komponent (`components/layout/Footer.tsx`) vises på alle sider med teksten «Streaming Availability API by Movie of the Night», lenket til <https://www.movieofthenight.com/about/api>.
- OMDb stiller ikke samme krav, men krediteres i samme footer for ryddighets skyld («Filmdata fra OMDb API»).
- Lenkene åpnes i ny fane med `rel="noopener noreferrer"`, som alle andre eksterne lenker i appen.

## Styling

- **Tailwind CSS** brukes gjennomgående — ingen separat komponentbibliotek.
- Responsivt grunnoppsett: enkeltkolonne på mobil, flerkolonners grid for søkeresultater/watchlist på bredere skjermer.
- Konsekvent mønster for tilstander på tvers av hele appen: lasting, tom-tilstand og feil-tilstand skal se og oppføre seg likt uansett hvilken side de opptrer på (delte komponenter i `components/common/`).
- Talesøk-knappen og alle interaktive elementer skal ha tydelige `aria-label`er og synlig fokus-styling for tastaturnavigasjon.

## Visuelt tema (CineFind, fase 11)

Fasit for farger, typografi og layout er [docs/design-spec/README.md](./design-spec/README.md) og skjermbildene i `docs/design-spec/screenshots/` — hifi, pixel-nært. Dette avsnittet oppsummerer beslutningene og hvordan de går inn i den eksisterende strukturen; slår oppsummeringen og kildedokumentet feil av hverandre, er `design-spec/README.md` fasit.

- **Wordmark/tema-navn «CineFind»** er en del av hifi-designet (gradient-tekst-logo på søkesiden) og tas i bruk som appens visuelle identitet. Prosjektnavnet `watchlist` (repo, `package.json`, ruter) endres ikke.
- **Fargepalett**: mørk indigo→blå→teal→nær-svart bakgrunnsgradient, magenta→blå primærgradient (knapper/CTA/wordmark), gull for rating/stjerne-ikoner, samt fem faste per-tittel-hues (blå/fiolett/teal/amber/korall) — se eksakte `oklch()`-verdier i design-spec.
- **Per-tittel hue** er et rent UI-lag, **ikke** et nytt felt på `MediaSummary`/`Media` (se [data-model.md](./data-model.md)): en deterministisk funksjon (hash av `id`) velger én av de fem faste hue-verdiene. Dette holder `MediaProvider`-kontrakten uendret foran fase 10 — verken OMDb- eller MOTN-mapping trenger å levere en hue.
- **Typografi**: Space Grotesk 600/700 (overskrifter/wordmark) og Manrope 400–800 (brødtekst/UI), begge fra Google Fonts. Krever CSP-utvidelse (`style-src`/`font-src` for `fonts.googleapis.com`/`fonts.gstatic.com`) i `vite.config.ts`s CSP-meta-tag-plugin.
- **Bunn-fanebar** erstatter dagens `NavBar`-lenker visuelt (samme to ruter, `/` og `/mylist`): fast posisjon, 78px, gjennomsiktig/blur, aktiv fane i magenta.
- **Stjerne-toggle** (søkeresultat-kort og watchlist-rad) viser samme "i watchlist"-tilstand som i dag (`WatchlistToggleButton`), kun restylet — fylt hue-bakgrunn når lagt til, gjennomsiktig mørk når ikke.
- Alle eksisterende tilstander (lasting/tom/feil, a11y, tastaturnavigasjon) videreføres uendret — dette er en restyling av eksisterende sider (fase 5–9s `SearchResultCard`, `TitleDetailPage`, `WatchlistItemCard`, `NavBar`), ikke en ny flyt.
