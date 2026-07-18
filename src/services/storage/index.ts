import { firestore } from "../auth/firebaseClient";
import { FirestoreWatchlistStorage } from "./FirestoreWatchlistStorage";
import type { WatchlistStorage } from "./WatchlistRemoteStorage";

/**
 * Sammensetningsrot for `WatchlistStorage` (DB-migrering issue C), samme
 * mønster som `services/media/index.ts` for `MediaProvider`. `App.tsx`
 * injiserer denne instansen inn i `WatchlistProvider` (se
 * `context/WatchlistContext.tsx`).
 */
export const watchlistStorage: WatchlistStorage = new FirestoreWatchlistStorage(
  firestore,
);
