import { firestore } from "../auth/firebaseClient";
import { FirestoreFeedbackStorage } from "./FirestoreFeedbackStorage";
import { FirestoreWatchlistStorage } from "./FirestoreWatchlistStorage";
import type { FeedbackStorage } from "./FeedbackStorage";
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

/**
 * Sammensetningsrot for `FeedbackStorage` (issue #40). `FeedbackPage`
 * injiserer denne instansen direkte (ingen React Context nødvendig — kun én
 * side bruker den, i motsetning til watchlisten).
 */
export const feedbackStorage: FeedbackStorage = new FirestoreFeedbackStorage(
  firestore,
);
