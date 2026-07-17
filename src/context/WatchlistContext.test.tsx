import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaSummary } from "../test/fixtures/media.fixtures";
import { WatchlistProvider, useWatchlist } from "./WatchlistContext";

function wrapper({ children }: { children: ReactNode }) {
  return <WatchlistProvider>{children}</WatchlistProvider>;
}

/**
 * `Storage`-stubbe med en total byte-kvote akkurat stor nok for en tom
 * watchlist (`"[]"`), men ikke mer — simulerer en enhet der lagringsplassen
 * er full uten noen cache-entries å rydde. `detectLocalStorage`s
 * probe-skriving (en annen, kortlevd nøkkel) påvirkes ikke, siden den
 * fjernes igjen umiddelbart.
 */
function createNearFullWatchlistStorage(): Storage {
  const entries = new Map<string, string>();
  const maxTotalLength = "[]".length;

  function totalLength(): number {
    let total = 0;
    for (const value of entries.values()) {
      total += value.length;
    }
    return total;
  }

  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      const previousLength = entries.get(key)?.length ?? 0;
      const projectedTotal = totalLength() - previousLength + value.length;
      if (projectedTotal > maxTotalLength) {
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

describe("WatchlistContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("starter tom når ingenting er lagret", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    expect(result.current.items).toEqual([]);
  });

  it("kaster en tydelig feil når hooken brukes utenfor en provider", () => {
    expect(() => renderHook(() => useWatchlist())).toThrow(
      "useWatchlist må brukes innenfor en WatchlistProvider",
    );
  });

  it("addToWatchlist legger til tittelen som 'planned'", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    const media = createMediaSummary({ id: "mock-movie-1" });

    act(() => {
      result.current.addToWatchlist(media);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      mediaId: "mock-movie-1",
      media,
      status: "planned",
    });
    expect(result.current.isInWatchlist("mock-movie-1")).toBe(true);
    expect(result.current.getStatus("mock-movie-1")).toBe("planned");
  });

  it("addToWatchlist er idempotent — legger ikke til samme tittel to ganger", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    const media = createMediaSummary({ id: "mock-movie-1" });

    act(() => {
      result.current.addToWatchlist(media);
      result.current.addToWatchlist(media);
    });

    expect(result.current.items).toHaveLength(1);
  });

  it("setStatus bytter status og setter watchedAt kun ved 'watched'", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    const media = createMediaSummary({ id: "mock-movie-1" });

    act(() => {
      result.current.addToWatchlist(media);
    });
    act(() => {
      result.current.setStatus("mock-movie-1", "watched");
    });

    expect(result.current.getStatus("mock-movie-1")).toBe("watched");
    expect(result.current.items[0]?.watchedAt).toBeDefined();

    act(() => {
      result.current.setStatus("mock-movie-1", "planned");
    });

    expect(result.current.getStatus("mock-movie-1")).toBe("planned");
    expect(result.current.items[0]?.watchedAt).toBeUndefined();
  });

  it("removeFromWatchlist fjerner tittelen", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    const media = createMediaSummary({ id: "mock-movie-1" });

    act(() => {
      result.current.addToWatchlist(media);
    });
    act(() => {
      result.current.removeFromWatchlist("mock-movie-1");
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.isInWatchlist("mock-movie-1")).toBe(false);
  });

  it("persisterer endringer til localStorage — en ny provider-instans leser dem tilbake", () => {
    const media = createMediaSummary({ id: "mock-movie-1" });
    const { result, unmount } = renderHook(() => useWatchlist(), { wrapper });

    act(() => {
      result.current.addToWatchlist(media);
    });
    unmount();

    const { result: reloaded } = renderHook(() => useWatchlist(), {
      wrapper,
    });
    expect(reloaded.current.items).toHaveLength(1);
    expect(reloaded.current.items[0]?.mediaId).toBe("mock-movie-1");
  });
});

describe("WatchlistContext — lagringsfeil", () => {
  // `watchlistStorage` detekterer `localStorage` kun én gang og cacher den
  // (se watchlistStorage.ts) — stubben må derfor være på plass *før*
  // `WatchlistContext` (og dermed `watchlistStorage`) importeres på nytt via
  // `vi.resetModules()`, ellers gjenbrukes en tidligere tests cachede
  // instans.
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    localStorage.clear();
  });

  it("setter saveError når lagring feiler selv etter cache-opprydding, og kan avvises", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createNearFullWatchlistStorage());
    const {
      WatchlistProvider: FreshWatchlistProvider,
      useWatchlist: useFreshWatchlist,
    } = await import("./WatchlistContext");

    function freshWrapper({ children }: { children: ReactNode }) {
      return <FreshWatchlistProvider>{children}</FreshWatchlistProvider>;
    }

    const { result } = renderHook(() => useFreshWatchlist(), {
      wrapper: freshWrapper,
    });

    expect(result.current.saveError).toBe(false);

    act(() => {
      result.current.addToWatchlist(createMediaSummary({ id: "mock-movie-1" }));
    });

    expect(result.current.saveError).toBe(true);

    act(() => {
      result.current.dismissSaveError();
    });

    expect(result.current.saveError).toBe(false);
  });
});
