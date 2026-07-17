import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheEntry } from "../../types/cache";
import { CACHE_KEY_PREFIX, DATA_KEY_PREFIX } from "../../utils/storageKeys";
import {
  InMemoryKeyValueStorage,
  LocalStorageCacheStore,
  type KeyValueStorage,
} from "./LocalStorageCacheStore";

const HOUR_MS = 60 * 60 * 1000;

function cacheKey(name: string): string {
  return `${CACHE_KEY_PREFIX}details:mock:${name}`;
}

/**
 * Storage-stubbe med kvotegrense: `setItem` av en ny nøkkel kaster
 * `QuotaExceededError` når antall lagrede nøkler har nådd `maxEntries`.
 */
class QuotaLimitedStorage extends InMemoryKeyValueStorage {
  private readonly maxEntries: number;

  constructor(maxEntries: number) {
    super();
    this.maxEntries = maxEntries;
  }

  override setItem(key: string, value: string): void {
    const isNewKey = this.getItem(key) === null;
    if (isNewKey && this.length >= this.maxEntries) {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    }
    super.setItem(key, value);
  }
}

describe("LocalStorageCacheStore", () => {
  let storage: InMemoryKeyValueStorage;
  let store: LocalStorageCacheStore;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-17T12:00:00.000Z") });
    storage = new InMemoryKeyValueStorage();
    store = new LocalStorageCacheStore(storage);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("set/get-roundtrip", () => {
    it("returnerer verdien som ble satt, før TTL utløper", () => {
      store.set(cacheKey("a"), { title: "The Matrix" }, HOUR_MS);
      expect(store.get<{ title: string }>(cacheKey("a"))).toEqual({
        title: "The Matrix",
      });
    });

    it("returnerer null for nøkkel som aldri er satt", () => {
      expect(store.get(cacheKey("missing"))).toBeNull();
    });

    it("lagrer entries som CacheEntry med cachedAt og expiresAt", () => {
      store.set(cacheKey("a"), [1, 2, 3], HOUR_MS);
      const raw = storage.getItem(cacheKey("a"));
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw as string) as CacheEntry<number[]>;
      expect(parsed.data).toEqual([1, 2, 3]);
      expect(parsed.cachedAt).toBe(Date.now());
      expect(parsed.expiresAt).toBe(Date.now() + HOUR_MS);
    });

    it("kan roundtrippe en tom liste (gyldig cache-hit, ikke miss)", () => {
      store.set(cacheKey("empty"), [], HOUR_MS);
      expect(store.get<unknown[]>(cacheKey("empty"))).toEqual([]);
    });

    it("remove() fjerner en enkelt entry", () => {
      store.set(cacheKey("a"), "value", HOUR_MS);
      store.remove(cacheKey("a"));
      expect(store.get(cacheKey("a"))).toBeNull();
    });
  });

  describe("TTL-utløp", () => {
    it("returnerer null når entry er utløpt, og fjerner den fra storage", () => {
      store.set(cacheKey("a"), "value", HOUR_MS);
      vi.advanceTimersByTime(HOUR_MS + 1);
      expect(store.get(cacheKey("a"))).toBeNull();
      expect(storage.getItem(cacheKey("a"))).toBeNull();
    });

    it("returnerer verdien rett før utløp", () => {
      store.set(cacheKey("a"), "value", HOUR_MS);
      vi.advanceTimersByTime(HOUR_MS - 1);
      expect(store.get(cacheKey("a"))).toBe("value");
    });
  });

  describe("korrupt/feilformet entry", () => {
    it("behandler entry som ikke er gyldig JSON som miss og fjerner den stille", () => {
      storage.setItem(cacheKey("corrupt"), "not-json{{{");
      expect(store.get(cacheKey("corrupt"))).toBeNull();
      expect(storage.getItem(cacheKey("corrupt"))).toBeNull();
    });

    it("behandler JSON med feil form som miss og fjerner den stille", () => {
      storage.setItem(cacheKey("wrong-shape"), JSON.stringify({ foo: "bar" }));
      expect(store.get(cacheKey("wrong-shape"))).toBeNull();
      expect(storage.getItem(cacheKey("wrong-shape"))).toBeNull();
    });

    it("behandler entry med ikke-numeriske tidsstempler som miss", () => {
      storage.setItem(
        cacheKey("bad-timestamps"),
        JSON.stringify({ data: "x", cachedAt: "yesterday", expiresAt: "soon" }),
      );
      expect(store.get(cacheKey("bad-timestamps"))).toBeNull();
      expect(storage.getItem(cacheKey("bad-timestamps"))).toBeNull();
    });
  });

  describe("quota-exceeded-eviction", () => {
    it("fjerner utløpte entries først ved kvote-feil", () => {
      const limited = new QuotaLimitedStorage(3);
      const limitedStore = new LocalStorageCacheStore(limited);

      limitedStore.set(cacheKey("expired"), "old", HOUR_MS);
      vi.advanceTimersByTime(2 * HOUR_MS); // "expired" er nå utløpt
      limitedStore.set(cacheKey("fresh-1"), "v1", HOUR_MS);
      limitedStore.set(cacheKey("fresh-2"), "v2", HOUR_MS);

      // Kvoten (3 nøkler) er full; neste set må evicte den utløpte.
      limitedStore.set(cacheKey("new"), "v3", HOUR_MS);

      expect(limited.getItem(cacheKey("expired"))).toBeNull();
      expect(limitedStore.get(cacheKey("fresh-1"))).toBe("v1");
      expect(limitedStore.get(cacheKey("fresh-2"))).toBe("v2");
      expect(limitedStore.get(cacheKey("new"))).toBe("v3");
    });

    it("fjerner eldste entries (cachedAt stigende) når ingen er utløpt", () => {
      const limited = new QuotaLimitedStorage(3);
      const limitedStore = new LocalStorageCacheStore(limited);

      limitedStore.set(cacheKey("oldest"), "v1", 10 * HOUR_MS);
      vi.advanceTimersByTime(HOUR_MS);
      limitedStore.set(cacheKey("middle"), "v2", 10 * HOUR_MS);
      vi.advanceTimersByTime(HOUR_MS);
      limitedStore.set(cacheKey("newest"), "v3", 10 * HOUR_MS);

      // Kvoten er full og ingenting er utløpt; eldste må vike.
      limitedStore.set(cacheKey("new"), "v4", 10 * HOUR_MS);

      expect(limited.getItem(cacheKey("oldest"))).toBeNull();
      expect(limitedStore.get(cacheKey("middle"))).toBe("v2");
      expect(limitedStore.get(cacheKey("newest"))).toBe("v3");
      expect(limitedStore.get(cacheKey("new"))).toBe("v4");
    });

    it("evicter aldri nøkler utenfor cache-navnerommet, selv under kvotepress", () => {
      const limited = new QuotaLimitedStorage(2);
      const dataKey = `${DATA_KEY_PREFIX}items`;
      limited.setItem(dataKey, JSON.stringify([{ mediaId: "mock-movie-1" }]));
      const limitedStore = new LocalStorageCacheStore(limited);

      limitedStore.set(cacheKey("a"), "v1", HOUR_MS);
      vi.advanceTimersByTime(1);
      limitedStore.set(cacheKey("b"), "v2", HOUR_MS); // evicter "a", ikke watchlisten

      expect(limited.getItem(dataKey)).toBe(
        JSON.stringify([{ mediaId: "mock-movie-1" }]),
      );
      expect(limited.getItem(cacheKey("a"))).toBeNull();
      expect(limitedStore.get(cacheKey("b"))).toBe("v2");
    });

    it("gir opp stille med console.warn når skriving aldri lykkes", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const dataKey = `${DATA_KEY_PREFIX}items`;
      const limited = new QuotaLimitedStorage(1);
      limited.setItem(dataKey, "[]"); // fyller hele kvoten; ingenting kan evictes

      const limitedStore = new LocalStorageCacheStore(limited);
      expect(() => {
        limitedStore.set(cacheKey("a"), "value", HOUR_MS);
      }).not.toThrow();

      expect(limited.getItem(cacheKey("a"))).toBeNull();
      expect(limited.getItem(dataKey)).toBe("[]");
      expect(warn).toHaveBeenCalled();
    });
  });

  describe("navneromsseparasjon", () => {
    it("clear() fjerner kun cache-navnerommet, aldri watchlist-data", () => {
      const dataKey = `${DATA_KEY_PREFIX}items`;
      const watchlistJson = JSON.stringify([{ mediaId: "mock-movie-1" }]);
      storage.setItem(dataKey, watchlistJson);
      store.set(cacheKey("a"), "v1", HOUR_MS);
      store.set(cacheKey("b"), "v2", HOUR_MS);

      store.clear();

      expect(store.get(cacheKey("a"))).toBeNull();
      expect(store.get(cacheKey("b"))).toBeNull();
      expect(storage.getItem(dataKey)).toBe(watchlistJson);
    });
  });

  describe("in-memory-fallback", () => {
    it("faller tilbake til in-memory når localStorage-aksess kaster", () => {
      vi.stubGlobal("localStorage", undefined);
      const fallbackStore = new LocalStorageCacheStore();
      fallbackStore.set(cacheKey("a"), "value", HOUR_MS);
      expect(fallbackStore.get(cacheKey("a"))).toBe("value");
    });

    it("faller tilbake til in-memory når localStorage avviser all skriving", () => {
      const rejectingStorage: KeyValueStorage = {
        length: 0,
        key: () => null,
        getItem: () => null,
        setItem: () => {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        },
        removeItem: () => {},
      };
      vi.stubGlobal("localStorage", rejectingStorage);

      const fallbackStore = new LocalStorageCacheStore();
      fallbackStore.set(cacheKey("a"), "value", HOUR_MS);
      expect(fallbackStore.get(cacheKey("a"))).toBe("value");
    });

    it("bruker ekte localStorage når den er tilgjengelig", () => {
      const defaultStore = new LocalStorageCacheStore();
      defaultStore.set(cacheKey("a"), "value", HOUR_MS);
      expect(localStorage.getItem(cacheKey("a"))).not.toBeNull();
      defaultStore.clear();
      expect(localStorage.getItem(cacheKey("a"))).toBeNull();
    });
  });

  describe("InMemoryKeyValueStorage", () => {
    it("oppfyller storage-kontrakten (length/key/get/set/remove)", () => {
      const mem = new InMemoryKeyValueStorage();
      expect(mem.length).toBe(0);
      expect(mem.key(0)).toBeNull();
      mem.setItem("a", "1");
      mem.setItem("b", "2");
      expect(mem.length).toBe(2);
      expect(mem.key(0)).toBe("a");
      expect(mem.key(1)).toBe("b");
      expect(mem.key(2)).toBeNull();
      expect(mem.key(-1)).toBeNull();
      expect(mem.getItem("a")).toBe("1");
      mem.removeItem("a");
      expect(mem.getItem("a")).toBeNull();
      expect(mem.length).toBe(1);
    });
  });
});
