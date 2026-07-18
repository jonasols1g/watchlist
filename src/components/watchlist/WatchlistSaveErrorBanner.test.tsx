import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaSummary } from "../../test/fixtures/media.fixtures";
import { createMockWatchlistStorage } from "../../test/mocks/createMockWatchlistStorage";
import { DATA_KEY_PREFIX } from "../../utils/storageKeys";

const WATCHLIST_KEY = `${DATA_KEY_PREFIX}items`;

function createAlwaysFailingWatchlistStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === WATCHLIST_KEY) {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  };
}

describe("WatchlistSaveErrorBanner", () => {
  // `watchlistStorage` detekterer `localStorage` kun én gang og cacher den
  // (se watchlistStorage.ts) — `WatchlistProvider` (og dermed
  // `watchlistStorage`) må derfor importeres på nytt via
  // `vi.resetModules()` etter at global `localStorage` er stubbet, ellers
  // gjenbrukes en tidligere tests cachede instans.
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    localStorage.clear();
  });

  it("vises ikke når det ikke er noen lagringsfeil", async () => {
    vi.resetModules();
    const { WatchlistProvider } =
      await import("../../context/WatchlistContext");
    const { WatchlistSaveErrorBanner } =
      await import("./WatchlistSaveErrorBanner");

    render(
      <WatchlistProvider storage={createMockWatchlistStorage()} userId={null}>
        <WatchlistSaveErrorBanner />
      </WatchlistProvider>,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("viser en synlig feilmelding som kan lukkes når en watchlist-endring feiler å lagre", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createAlwaysFailingWatchlistStorage());
    const { WatchlistProvider, useWatchlist } =
      await import("../../context/WatchlistContext");
    const { WatchlistSaveErrorBanner } =
      await import("./WatchlistSaveErrorBanner");

    function TriggerAdd() {
      const { addToWatchlist } = useWatchlist();
      return (
        <button
          type="button"
          onClick={() => {
            addToWatchlist(createMediaSummary({ id: "mock-movie-1" }));
          }}
        >
          Legg til
        </button>
      );
    }

    const user = userEvent.setup();
    render(
      <WatchlistProvider storage={createMockWatchlistStorage()} userId={null}>
        <WatchlistSaveErrorBanner />
        <TriggerAdd />
      </WatchlistProvider>,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Legg til" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lukk" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
