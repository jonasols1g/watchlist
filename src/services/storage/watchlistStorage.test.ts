import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWatchlistItem } from "../../test/fixtures/watchlist.fixtures";
import { CACHE_KEY_PREFIX, DATA_KEY_PREFIX } from "../../utils/storageKeys";
import { InMemoryKeyValueStorage } from "../cache/LocalStorageCacheStore";
import { LocalStorageWatchlistStorage } from "./watchlistStorage";

const HOUR_MS = 60 * 60 * 1000;
const WATCHLIST_KEY = `${DATA_KEY_PREFIX}items`;

function cacheKey(name: string): string {
  return `${CACHE_KEY_PREFIX}details:mock:${name}`;
}

function cacheEntryJson(data: unknown, cachedAt: number, expiresAt: number) {
  return JSON.stringify({ data, cachedAt, expiresAt });
}

/**
 * Storage-stubbe med byte-kvote (totalt antall tegn på tvers av alle
 * nøkler) — nærmere ekte `localStorage`-oppførsel enn en ren
 * antall-nøkler-grense, siden den også fanger opp at *overskriving* av en
 * eksisterende nøkkel med en større verdi kan overskride kvoten.
 */
class QuotaLimitedStorage extends InMemoryKeyValueStorage {
  private readonly maxTotalLength: number;

  constructor(maxTotalLength: number) {
    super();
    this.maxTotalLength = maxTotalLength;
  }

  override setItem(key: string, value: string): void {
    const previousLength = this.getItem(key)?.length ?? 0;
    const projectedTotal = this.totalLength() - previousLength + value.length;
    if (projectedTotal > this.maxTotalLength) {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    }
    super.setItem(key, value);
  }

  private totalLength(): number {
    let total = 0;
    for (let i = 0; i < this.length; i++) {
      const key = this.key(i);
      total += key === null ? 0 : (this.getItem(key)?.length ?? 0);
    }
    return total;
  }
}

describe("LocalStorageWatchlistStorage", () => {
  let storage: InMemoryKeyValueStorage;
  let watchlistStorage: LocalStorageWatchlistStorage;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-17T12:00:00.000Z") });
    storage = new InMemoryKeyValueStorage();
    watchlistStorage = new LocalStorageWatchlistStorage(storage);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("load/save-roundtrip", () => {
    it("returnerer tom liste når ingenting er lagret", () => {
      expect(watchlistStorage.load()).toEqual([]);
    });

    it("lagrer og leser en watchlist tilbake uendret", () => {
      const item = createWatchlistItem();
      const ok = watchlistStorage.save([item]);

      expect(ok).toBe(true);
      expect(watchlistStorage.load()).toEqual([item]);
    });

    it("lagrer under det versjonerte data-navnerommet, ikke cache-navnerommet", () => {
      watchlistStorage.save([createWatchlistItem()]);
      expect(storage.getItem(WATCHLIST_KEY)).not.toBeNull();
    });
  });

  describe("runtime-validering ved lesing", () => {
    it("behandler ugyldig JSON som tom watchlist", () => {
      storage.setItem(WATCHLIST_KEY, "not-json{{{");
      expect(watchlistStorage.load()).toEqual([]);
    });

    it("behandler JSON med feil form (ikke en liste) som tom watchlist", () => {
      storage.setItem(WATCHLIST_KEY, JSON.stringify({ foo: "bar" }));
      expect(watchlistStorage.load()).toEqual([]);
    });

    it("behandler en liste med manglende felter som tom watchlist", () => {
      storage.setItem(
        WATCHLIST_KEY,
        JSON.stringify([{ mediaId: "mock-movie-1" }]),
      );
      expect(watchlistStorage.load()).toEqual([]);
    });

    it("behandler en liste med ugyldig status som tom watchlist", () => {
      const item = { ...createWatchlistItem(), status: "not-a-status" };
      storage.setItem(WATCHLIST_KEY, JSON.stringify([item]));
      expect(watchlistStorage.load()).toEqual([]);
    });

    it("godtar en gyldig oppføring uten watchedAt (valgfritt felt)", () => {
      const item = createWatchlistItem();
      storage.setItem(WATCHLIST_KEY, JSON.stringify([item]));
      expect(watchlistStorage.load()).toEqual([item]);
    });
  });

  describe("kvotehåndtering ved skriving (aldri stille tap av watchlist-data)", () => {
    it("rydder utløpte cache-entries for å frigjøre plass, og lykkes deretter", () => {
      const item = createWatchlistItem();
      const watchlistJson = JSON.stringify([item]);
      const staleEntryJson = cacheEntryJson(
        "x",
        Date.now() - 2 * HOUR_MS,
        Date.now() - HOUR_MS,
      );

      // Kvoten rommer den utløpte cache-entryen alene, og watchlist-skrivingen
      // alene (etter opprydding) — men ikke begge samtidig.
      const limited = new QuotaLimitedStorage(
        Math.max(staleEntryJson.length, watchlistJson.length),
      );
      limited.setItem(cacheKey("expired"), staleEntryJson);
      const limitedStorage = new LocalStorageWatchlistStorage(limited);

      const ok = limitedStorage.save([item]);

      expect(ok).toBe(true);
      expect(limited.getItem(cacheKey("expired"))).toBeNull();
      expect(limitedStorage.load()).toEqual([item]);
      expect(limited.getItem(WATCHLIST_KEY)).toBe(watchlistJson);
    });

    it("rydder eldste cache-entries (cachedAt stigende) når ingen er utløpt", () => {
      const item = createWatchlistItem();
      const oldestJson = cacheEntryJson(
        "old",
        Date.now(),
        Date.now() + 10 * HOUR_MS,
      );
      vi.advanceTimersByTime(HOUR_MS);
      const newestJson = cacheEntryJson(
        "new",
        Date.now(),
        Date.now() + 10 * HOUR_MS,
      );

      // Kvoten rommer én cache-entry i tillegg til watchlisten, ikke begge.
      const limited = new QuotaLimitedStorage(
        JSON.stringify([item]).length + oldestJson.length,
      );
      limited.setItem(cacheKey("oldest"), oldestJson);
      limited.setItem(cacheKey("newest"), newestJson);
      const limitedStorage = new LocalStorageWatchlistStorage(limited);

      const ok = limitedStorage.save([item]);

      expect(ok).toBe(true);
      expect(limited.getItem(cacheKey("oldest"))).toBeNull();
      expect(limited.getItem(cacheKey("newest"))).toBe(newestJson);
      expect(limitedStorage.load()).toEqual([item]);
    });

    it("returnerer false og logger en feil når skrivingen fortsatt feiler etter opprydding", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const existingItem = createWatchlistItem();
      const newItem = createWatchlistItem({
        mediaId: "mock-movie-2",
        status: "watched",
        watchedAt: "2026-07-17T12:00:00.000Z",
      });
      const existingJson = JSON.stringify([existingItem]);
      const newJson = JSON.stringify([newItem]);
      expect(newJson.length).toBeGreaterThan(existingJson.length);

      // Kvoten rommer akkurat den eksisterende watchlisten, ikke den nye
      // (lengre) versjonen — og det finnes ingen cache-entries å evicte.
      const limited = new QuotaLimitedStorage(existingJson.length);
      limited.setItem(WATCHLIST_KEY, existingJson);
      const limitedStorage = new LocalStorageWatchlistStorage(limited);

      const ok = limitedStorage.save([newItem]);

      expect(ok).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
      // Den forrige, gyldige watchlisten er urørt — ingen tap av data.
      expect(limited.getItem(WATCHLIST_KEY)).toBe(existingJson);
    });
  });

  describe("navneromsseparasjon fra cache", () => {
    it("evicter kun cache-navnerommet for å frigjøre plass, aldri watchlist-nøkkelen selv", () => {
      const items = [
        createWatchlistItem(),
        createWatchlistItem({ mediaId: "mock-movie-2" }),
      ];
      const smallExistingJson = JSON.stringify([createWatchlistItem()]);
      const finalJson = JSON.stringify(items);
      const staleEntryJson = cacheEntryJson(
        "x",
        Date.now() - 2 * HOUR_MS,
        Date.now() - HOUR_MS,
      );

      const limited = new QuotaLimitedStorage(finalJson.length);
      limited.setItem(WATCHLIST_KEY, smallExistingJson);
      limited.setItem(cacheKey("a"), staleEntryJson);
      const limitedStorage = new LocalStorageWatchlistStorage(limited);

      const ok = limitedStorage.save(items);

      expect(ok).toBe(true);
      expect(limited.getItem(cacheKey("a"))).toBeNull();
      expect(limitedStorage.load()).toEqual(items);
    });
  });
});

describe("loadWatchlistFromStorage / saveWatchlistToStorage (default-instans)", () => {
  // Default-instansen detekterer `localStorage` kun én gang og cacher den
  // deretter (se kommentaren i watchlistStorage.ts) — hver test må derfor
  // stubbe global `localStorage` *før* modulen importeres på nytt via
  // `vi.resetModules()`, ellers gjenbrukes forrige tests cachede instans.
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    localStorage.clear();
  });

  it("bruker ekte localStorage når den er tilgjengelig", async () => {
    vi.resetModules();
    const { loadWatchlistFromStorage: load, saveWatchlistToStorage: save } =
      await import("./watchlistStorage");

    const item = createWatchlistItem();
    const ok = save([item]);

    expect(ok).toBe(true);
    expect(load()).toEqual([item]);
    expect(localStorage.getItem(WATCHLIST_KEY)).not.toBeNull();
  });

  it("faller tilbake til in-memory når localStorage er utilgjengelig, og beholder data på tvers av kall i samme økt", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", undefined);
    const { loadWatchlistFromStorage: load, saveWatchlistToStorage: save } =
      await import("./watchlistStorage");

    const item = createWatchlistItem();
    save([item]);

    expect(load()).toEqual([item]);
  });
});
