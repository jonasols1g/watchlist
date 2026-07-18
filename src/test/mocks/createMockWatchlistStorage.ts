import { vi } from "vitest";
import type { WatchlistStorage } from "../../services/storage/WatchlistRemoteStorage";

/**
 * Testdobbel for `WatchlistStorage` (parallelt til `createMockMediaProvider`)
 * til komponent-/hook-tester — ingen ekte Firebase-kall fra Vitest. Alle
 * metoder er `vi.fn()`-stubber med ufarlige defaults (tom watchlist ved
 * `load`, vellykkede no-op-skrivinger ellers). Overstyr per test etter
 * behov, f.eks.
 * `createMockWatchlistStorage({ upsert: vi.fn().mockRejectedValue(...) })`.
 */
export function createMockWatchlistStorage(
  overrides: Partial<WatchlistStorage> = {},
): WatchlistStorage {
  return {
    load: vi.fn<WatchlistStorage["load"]>().mockResolvedValue([]),
    upsert: vi.fn<WatchlistStorage["upsert"]>().mockResolvedValue(undefined),
    remove: vi.fn<WatchlistStorage["remove"]>().mockResolvedValue(undefined),
    updateStatus: vi
      .fn<WatchlistStorage["updateStatus"]>()
      .mockResolvedValue(undefined),
    ...overrides,
  };
}
