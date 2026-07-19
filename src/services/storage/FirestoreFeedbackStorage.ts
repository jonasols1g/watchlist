import {
  addDoc,
  collection,
  type Firestore,
} from "firebase/firestore/lite";
import type { FeedbackSubmission } from "../../types/feedback";
import type { FeedbackStorage } from "./FeedbackStorage";

const FEEDBACK_COLLECTION = "feedback";

/**
 * `FeedbackStorage` mot Firestore (issue #40, se
 * docs/plans/feedback-innsending-og-automatisk-oppfolging.md#del-a).
 * Skriver til den nye top-level collectionen `feedback/{autoId}` — IKKE
 * brukerbundet (i motsetning til `users/{uid}/watchlistItems/{mediaId}`),
 * derfor `addDoc` med auto-generert ID fremfor `setDoc` mot en meningsfull
 * nøkkel: det finnes ingen naturlig nøkkel slik `mediaId` er for watchlisten.
 *
 * Bygget mot `firebase/firestore/lite`, samme begrunnelse som
 * `FirestoreWatchlistStorage.ts`/`services/auth/firebaseClient.ts`.
 */
export class FirestoreFeedbackStorage implements FeedbackStorage {
  private readonly firestore: Firestore;

  constructor(firestore: Firestore) {
    this.firestore = firestore;
  }

  async submit(data: FeedbackSubmission): Promise<void> {
    await addDoc(collection(this.firestore, FEEDBACK_COLLECTION), {
      text: data.text,
      score: data.score,
      createdAt: new Date().toISOString(),
    });
  }
}
