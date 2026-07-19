# Streamie

En 100 % klient-side webapp for å slå opp filmer og serier og holde en personlig watchlist. Søk med tekst eller tale (engelsk), se beskrivelse, sjanger, IMDb-/Rotten Tomatoes-score og hvilke strømmetjenester tittelen ligger på, og lagre den til senere. Ingen synlig innlogging — appen oppretter en usynlig, anonym Firebase-identitet automatisk, og watchlisten persisteres i Firestore (i tillegg til en lokal `localStorage`-kopi). Se [docs/architecture.md](./docs/architecture.md#identitet-og-datalagring-firebase) for detaljer.

Bygget med React + TypeScript + Vite. Titteldata hentes fra OMDb og Movie of the Night; watchlisten lagres i Firebase/Firestore. Publiseres på GitHub Pages: [jonasols1g.github.io/streamie](https://jonasols1g.github.io/streamie/).

All dokumentasjon — arkitektur, datamodell og design — ligger i [`docs/`](./docs/README.md). Oppgavesporing skjer i GitHub-prosjektet [«Watchlist»](https://github.com/users/jonasols1g/projects/2).

## Kjøre lokalt

1. `npm install`
2. Kopier `.env.example` til `.env.local` og fyll inn:
   - `VITE_OMDB_API_KEY` — gratis nøkkel fra <https://www.omdbapi.com/apikey.aspx>.
   - `VITE_MOTN_API_KEY` — gratis nøkkel fra Movie of the Night sin Developers-plattform.
   - `VITE_FIREBASE_*` (seks variabler) — se eget Firebase-oppsett under.
3. `npm run dev`

### Eget Firebase-prosjekt

Appen krever et Firebase-prosjekt for watchlist-lagring (Firestore + Anonymous Auth). For å kjøre appen lokalt med egen, isolert data:

1. Opprett et prosjekt på <https://console.firebase.google.com> (Spark/gratis-planen holder).
2. **Authentication** → Sign-in method → aktiver **Anonymous**-provideren.
3. **Firestore Database** → opprett en database (produksjonsmodus er greit — reglene i steg 5 styrer tilgangen).
4. **Project settings** → General → "Your apps" → legg til en Web-app (`</>`-ikonet). Kopier de seks feltene i `firebaseConfig` (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) inn i `VITE_FIREBASE_*` i `.env.local`.
5. **Firestore Database** → Rules-fanen → lim inn innholdet i repoets `firestore.rules` og publiser. (Alternativt `firebase deploy --only firestore:rules` med Firebase CLI, men det krever et eget `firebase init`-oppsett som ikke ligger i dette repoet.) Uten dette avviser Firestore alle lese-/skrivekall med `403`.

Se [docs/architecture.md](./docs/architecture.md#identitet-og-datalagring-firebase) for skjema og sikkerhetsregler, og [docs/data-model.md](./docs/data-model.md#firestore-skjema) for feltdetaljer.
