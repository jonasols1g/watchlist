# Datamodell

Alle typer under lever i `src/types/` og er de eneste formene UI, hooks og context kjenner til — konkrete API-responsformater (OMDb, Movie of the Night) mappes om til disse typene inne i den enkelte `MediaProvider`-implementasjon, aldri lenger ut i appen. Se [architecture.md](./architecture.md) for hvordan `MediaProvider`-interfacet bruker disse typene.

## `types/media.ts`

Søk og detaljer returnerer bevisst ulike typer: `MediaSummary` er lett metadata til bruk i søkeresultater, mens `Media` (og undertypene `MovieMedia`/`SeriesMedia`) inneholder alt som trengs på detaljsiden.

```ts
export type MediaType = 'movie' | 'series';

export interface MediaSummary {
  id: string;                  // IMDb-ID, f.eks. "tt0133093" ("mock-movie-1" i fase 1–9)
  mediaType: MediaType;
  title: string;
  releaseYear: number | null;
  posterUrl: string | null;
}

export interface Ratings {
  imdbScore: number | null;          // 0–10, fra OMDb (imdbRating)
  rottenTomatoesScore: number | null; // 0–100 (%), fra OMDbs Ratings-array; mangler ofte
}

export interface StreamingOffer {
  providerId: string;      // normalisert slug, f.eks. "netflix"
  providerName: string;
  logoUrl?: string;
  type: 'subscription' | 'rent' | 'buy' | 'free';
  url?: string;
}

export interface StreamingAvailability {
  region: string;           // ISO-landkode, f.eks. "NO"
  offers: StreamingOffer[];
  lastUpdated: string;      // ISO-tidsstempel
}

interface MediaBase extends MediaSummary {
  providerId: string;       // hvilken kilde recorden kom fra: 'composite' | 'mock' | ...
  originalTitle?: string;
  overview: string;
  genres: string[];
  ratings: Ratings;
  streaming: StreamingAvailability | null; // null = ikke hentet/ikke tilgjengelig i regionen
}

export interface MovieMedia extends MediaBase {
  mediaType: 'movie';
  runtimeMinutes?: number | null;
}

export interface SeriesMedia extends MediaBase {
  mediaType: 'series';
  numberOfSeasons?: number | null;
  status?: 'ongoing' | 'ended' | 'canceled' | 'unknown';
}

export type Media = MovieMedia | SeriesMedia;
```

**Hvorfor `id` er IMDb-ID-en:** OMDbs søk returnerer `imdbID` per treff, og MOTNs `/shows/{id}` slår opp direkte på samme ID (`tt<nummer>`). IMDb-ID-en er dermed den naturlige felles nøkkelen mellom de to kildene — ingen prefiksing eller ID-oversettelse trengs. Den er også stabil på tvers av datakilder, så watchlisten overlever et eventuelt senere bytte av OMDb eller MOTN. Se [Datakilder](./architecture.md#datakilder).

**Hvorfor ikke `externalIds`:** Feltet er unødvendig når `id` *er* IMDb-ID-en. MOTNs `tmdbId` mappes ikke inn — appen har ingen bruk for den.

**Hvorfor `rottenTomatoesScore: number | null`:** OMDb leverer RT-score via sitt `Ratings`-array, men kun for et delsett av titlene — for mange titler mangler den helt. Feltet er nullable slik at UI (`RatingsBadge`) alltid må håndtere «score ikke tilgjengelig» eksplisitt. Det samme gjelder `imdbScore`: OMDb returnerer strengen `"N/A"` når scoren mangler, og den mappes til `null` (se [OMDb-mapping](./architecture.md#omdb-mapping--kjente-fallgruver)).

**Hvorfor `streaming: StreamingAvailability | null`:** Streaming-tilgjengelighet er ikke garantert å finnes for alle titler/regioner. `null` skiller «ikke hentet ennå» / «ingen tilbud i denne regionen» fra en tom `offers`-liste med gyldig, men tom, respons. Med MOTN som kilde er `null` en helt normal tilstand: en tittel som ikke strømmes i Norge finnes ikke i MOTNs katalog, og detaljsiden rendres da komplett på OMDb-data alene (se [CompositeMediaProvider](./architecture.md#compositemediaprovider)).

## `types/watchlist.ts`

```ts
export type WatchlistStatus = 'planned' | 'watched';

export interface WatchlistItem {
  mediaId: string;
  media: MediaSummary;      // lett snapshot (poster/tittel/år) - IKKE full Media
  status: WatchlistStatus;
  addedAt: string;          // ISO-tidsstempel
  watchedAt?: string;       // settes når status settes til 'watched'
}
```

**Hvorfor bare `MediaSummary`, ikke full `Media`:** `WatchlistItem` lagrer et lett snapshot, ikke rating/streaming-data. Detaljsiden henter alltid ferske detaljer via `CachingMediaProvider.getDetails(id)` (som selv avgjør cache-hit/miss) når man åpner en tittel fra watchlisten. Dette holder localStorage-bruken liten (relevant for kvotegrensen på ~5–10 MB) og unngår at rating/streaming blir stale inne i watchlisten uten at det er synlig for brukeren.

**Status-modellen:** `"planned"` og `"watched"` dekker kravet om å skille mellom titler man har planlagt å se og titler man har sett. `watchedAt` settes når status endres til `"watched"` og kan brukes til sortering/visning senere (f.eks. «sett nylig»). Status gjelder hele tittelen — ingen sesong-/episodesporing for serier i v1 (bevisst avgrensning).

**`mediaId` og provider-bytte:** `mediaId` er `mock-movie-1` e.l. i fase 2–9 og en IMDb-ID (`tt0133093`) fra fase 10. Ved byttet til ekte API nullstilles watchlisten bevisst — data-versjonen bumpes og det bygges ingen migrasjonslogikk (se risikoavsnittet i [architecture.md](./architecture.md#kjente-forutsetninger-og-risikoer)). Det er en engangshendelse: IMDb-ID-er er stabile på tvers av datakilder, så senere bytte av OMDb eller MOTN krever ingen ny nullstilling.

## Firestore-skjema

Med DB-migreringen (se [architecture.md](./architecture.md#identitet-og-datalagring-firebase)) er `WatchlistItem` også formen som persisteres i Firestore, ved siden av (ikke i stedet for) `localStorage`. `FirestoreWatchlistStorage` (`src/services/storage/FirestoreWatchlistStorage.ts`) mapper mellom de to formene — dokumentet under er nøyaktig feltsettet appen faktisk skriver og leser, ikke en full `WatchlistItem`-serialisering:

```
users/{uid}/watchlistItems/{mediaId}
  media: MediaSummary       // samme lette snapshot som WatchlistItem.media
  status: 'planned' | 'watched'
  addedAt: string            // ISO-tidsstempel
  watchedAt?: string          // kun til stede når status er 'watched'
```

- **Dokument-ID = `mediaId`** (IMDb-ID) — `WatchlistItem.mediaId` lagres altså ikke som eget felt i dokumentet, den *er* dokument-stien. `FirestoreWatchlistStorage.load()` setter den tilbake inn i objektet fra `documentSnapshot.id` ved lesing.
- **`watchedAt` fjernes eksplisitt** (Firestores `deleteField()`), ikke settes til `undefined`, når status settes tilbake til `"planned"` — Firestore tillater ikke `undefined`-verdier i dokumenter.
- **Runtime-validering ved lesing:** samme prinsipp som for `localStorage` (se «Runtime-validering» under) — et Firestore-dokument som parser, men har feil form (manipulert eller korrupt), behandles som fravær av elementet, ikke en krasj. Valideringen er bevisst duplisert lokalt i `FirestoreWatchlistStorage.ts` fremfor gjenbrukt fra `watchlistStorage.ts`, som issue #18 holder uendret.
- **Security rules** (`firestore.rules`, repo-rot) håndhever at kun `request.auth.uid == userId` kan lese eller skrive et gitt brukerdokument-tre — se [architecture.md](./architecture.md#identitet-og-datalagring-firebase).
- **Migreringsflagget** (`watchlist:v2:data:migratedToCloud`) lagres derimot ikke i Firestore — det er et rent lokalt, per-nettleserprofil flagg i `localStorage` (samme data-navnerom som selve den lokale watchlisten), se `migrateLocalWatchlistToCloud.ts`.

### `feedback`-collection

Ny top-level collection (issue #40, se
[docs/plans/feedback-innsending-og-automatisk-oppfolging.md](./plans/feedback-innsending-og-automatisk-oppfolging.md#del-a))
for innsendinger fra den skjulte `/feedback`-siden — **ikke** brukerbundet
(i motsetning til `watchlistItems`, som ligger under `users/{uid}/`).
`FirestoreFeedbackStorage` (`src/services/storage/FirestoreFeedbackStorage.ts`)
skriver hvert dokument med `addDoc` (auto-generert dokument-ID — det finnes
ingen naturlig nøkkel slik `mediaId` er for watchlisten):

```
feedback/{autoId}
  text: string        // trimmet fritekst, 1–2000 tegn
  score: number        // heltall 1–5
  createdAt: string    // ISO-tidsstempel, samme mønster som addedAt i watchlistItems
```

- **Klienttypen** `FeedbackSubmission` (`src/types/feedback.ts`) omfatter kun `text` og `score` — `createdAt` settes av `FirestoreFeedbackStorage` selv ved skriving, ikke av kalleren.
- **Security rules** (`firestore.rules`): lesing er åpen (`allow read: if true`, konsistent med appens allerede åpne tillitsmodell — anonym auth, ingen ekte kontoer). Skriving krever (anonym) auth og server-side-validering av `text` (streng, 1–2000 tegn) og `score` (heltall 1–5). Ingen `update`/`delete` — collectionen er append-only.

## `types/cache.ts`

```ts
export interface CacheEntry<T> {
  data: T;
  cachedAt: number;   // epoch ms
  expiresAt: number;  // epoch ms
}
```

Brukes internt av `LocalStorageCacheStore` (se [architecture.md](./architecture.md#cache-design)) til å pakke inn både søkeresultater (`MediaSummary[]`) og detaljer (`Media`) med utløpstidspunkt.

## Runtime-validering

Alt som leses tilbake fra `localStorage` (`CacheEntry`, `WatchlistItem[]`) valideres med lettvekts type guards (håndskrevne `is…`-funksjoner, ingen Zod-avhengighet) før bruk — data som parser, men har feil form, behandles som fravær. Se «Robusthet og sikkerhet» i [architecture.md](./architecture.md#robusthet-og-sikkerhet).
