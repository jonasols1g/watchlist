import type { FeedbackSubmission } from "../../types/feedback";

/**
 * Tynt async storage-grensesnitt for feedback-innsending (issue #40, se
 * docs/plans/feedback-innsending-og-automatisk-oppfolging.md#del-a).
 * Parallelt til `WatchlistStorage`-mønsteret, men mye enklere: kun
 * append-only innsending, ingen lesing/oppdatering/sletting fra klienten.
 */
export interface FeedbackStorage {
  /** Lagrer en ny feedback-innsending (auto-generert dokument-ID). */
  submit(data: FeedbackSubmission): Promise<void>;
}
