import { vi } from "vitest";
import type { FeedbackStorage } from "../../services/storage/FeedbackStorage";

/**
 * Testdobbel for `FeedbackStorage` (parallelt til
 * `createMockWatchlistStorage`) til `FeedbackPage`-tester — ingen ekte
 * Firebase-kall fra Vitest. `submit` er en `vi.fn()`-stubb med en ufarlig
 * default (vellykket no-op-skriving). Overstyr per test etter behov, f.eks.
 * `createMockFeedbackStorage({ submit: vi.fn().mockRejectedValue(...) })`.
 */
export function createMockFeedbackStorage(
  overrides: Partial<FeedbackStorage> = {},
): FeedbackStorage {
  return {
    submit: vi.fn<FeedbackStorage["submit"]>().mockResolvedValue(undefined),
    ...overrides,
  };
}
