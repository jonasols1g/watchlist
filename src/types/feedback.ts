/**
 * Innsending fra `/feedback`-siden (se
 * docs/plans/feedback-innsending-og-automatisk-oppfolging.md#del-a).
 * Lagres i Firestore-collectionen `feedback/{autoId}` — IKKE brukerbundet,
 * se `FirestoreFeedbackStorage.ts`. `createdAt` settes av lagringslaget selv
 * (ikke del av denne typen), samme fordeling av ansvar som `WatchlistItem` vs.
 * `FirestoreWatchlistStorage.toFirestoreData()`.
 */
export interface FeedbackSubmission {
  /** Trimmet fritekst, 1–2000 tegn. */
  text: string;
  /** Heltall 1–5. */
  score: number;
}
