import type { WatchlistItem } from "../../types/watchlist";
import { createMediaSummary } from "./media.fixtures";

export function createWatchlistItem(
  overrides: Partial<WatchlistItem> = {},
): WatchlistItem {
  return {
    mediaId: "mock-movie-1",
    media: createMediaSummary(),
    status: "planned",
    addedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}
