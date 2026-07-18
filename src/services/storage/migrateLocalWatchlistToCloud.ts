import type { WatchlistItem } from "../../types/watchlist";
import type { WatchlistStorage } from "./WatchlistRemoteStorage";
import {
  hasMigratedWatchlistToCloud,
  loadWatchlistFromStorage,
  markWatchlistMigratedToCloud,
} from "./watchlistStorage";

export interface WatchlistMigrationOutcome {
  /**
   * De lokale elementene dette migreringsforsøket gjaldt — tom når ingen
   * migrering var nødvendig (migreringsflagget var allerede satt, eller
   * `localStorage`-watchlisten var tom). Returneres uansett om selve
   * opplastingen lyktes, slik at kallstedet (`WatchlistContext`) kan vise
   * dem i UI-et selv om opplastingen feilet — kjente, gyldige lokale data
   * skal ikke midlertidig fremstå som forsvunnet mens migreringen venter på
   * å lykkes ved et senere app-load.
   */
  items: WatchlistItem[];
  /**
   * `true` når alle elementene ble bekreftet skrevet til Firestore (og
   * migreringsflagget dermed er satt). `false` både ved en feilet
   * opplasting og når ingen migrering var nødvendig i utgangspunktet.
   */
  succeeded: boolean;
}

/**
 * Engangs migrering av en eksisterende `localStorage`-watchlist til
 * Firestore (DB-migrering issue D — se
 * docs/plans/watchlist-database-migrering.md#migrering-av-eksisterende-
 * localstorage-data). Kalles av `WatchlistContext` rett etter at den
 * anonyme sesjonen er etablert og den *initiale* Firestore-hentingen er
 * fullført.
 *
 * 1. Er migreringsflagget allerede satt: ingen ting å gjøre.
 * 2. Er den lokale watchlisten tom: ingen ting å *migrere*, men flagget
 *    settes likevel med det samme — se begrunnelsen i kommentaren ved det
 *    tilfellet under; det er nettopp det som gjør dette til en ekte
 *    *engangs*-sjekk (ikke en som gjentas på hvert påfølgende app-load for
 *    enhver bruker som aldri hadde noen lokal watchlist å migrere i første
 *    omgang — som i praksis er de aller fleste brukere av denne funksjonen).
 * 3. Ellers skrives (`upsert`, merge) alle lokale elementer til
 *    `users/{uid}/watchlistItems/{mediaId}` — lokal versjon vinner ved
 *    konflikt (`upsert` overskriver hele dokumentet).
 * 4. Lykkes alle skrivingene, settes migreringsflagget.
 * 5. Feiler ett eller flere av opplastingsforsøkene (f.eks. offline):
 *    flagget settes **ikke** — et senere app-load prøver på nytt. Lokale
 *    data slettes aldri — `localStorage` er urørt av denne funksjonen
 *    uansett utfall.
 *
 * Kaster aldri selv ved en feilet opplasting — feilen logges her og
 * signaliseres til kallstedet via `succeeded: false`, slik at
 * `WatchlistContext` kan vise en synlig feilmelding uten å måtte
 * `try`/`catch` rundt kallet.
 */
export async function migrateLocalWatchlistToCloud(
  userId: string,
  storage: WatchlistStorage,
): Promise<WatchlistMigrationOutcome> {
  if (hasMigratedWatchlistToCloud()) {
    return { items: [], succeeded: false };
  }

  const localItems = loadWatchlistFromStorage();
  if (localItems.length === 0) {
    // Ingenting å migrere — men selve *sjekket* er nå utført, for godt.
    // Uten å sette flagget her ville denne funksjonen (og dermed
    // `WatchlistContext`s localStorage-vs-Firestore-sammenstilling, se
    // `mergeMigratedItemsLocalWins`) blitt forsøkt på nytt ved *hvert*
    // eneste påfølgende app-load, for evig, for enhver bruker som rett og
    // slett aldri hadde noen lokal watchlist å migrere — siden det aldri
    // finnes noe tidspunkt der en tom watchlist "beviser" at migreringen er
    // unødvendig for alltid, bortsett fra akkurat nå. Det er dessuten trygt:
    // enhver senere lokal skriving skjer gjennom normal `applyAction`-bruk
    // (som selv synker til Firestore når `userId` er satt), ikke gjennom
    // denne engangsfunksjonen.
    markWatchlistMigratedToCloud();
    return { items: [], succeeded: false };
  }

  try {
    await Promise.all(localItems.map((item) => storage.upsert(userId, item)));
  } catch (error) {
    console.error(
      "[watchlist] Kunne ikke migrere den lokale watchlisten til Firestore — prøver igjen ved neste app-load",
      error,
    );
    return { items: localItems, succeeded: false };
  }

  markWatchlistMigratedToCloud();
  return { items: localItems, succeeded: true };
}
