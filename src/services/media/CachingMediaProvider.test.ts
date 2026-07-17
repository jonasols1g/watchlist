import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  createMediaSummary,
  createMovieMedia,
} from "../../test/fixtures/media.fixtures";
import { createMockMediaProvider } from "../../test/mocks/createMockMediaProvider";
import type { CacheStore } from "../cache/CacheStore";
import { buildDetailsCacheKey, buildSearchCacheKey } from "../cache/cacheKeys";
import { CachingMediaProvider } from "./CachingMediaProvider";
import type { MediaProvider } from "./MediaProvider";

const TTL = {
  searchTtlMs: 48 * 60 * 60 * 1000,
  detailsTtlMs: 24 * 60 * 60 * 1000,
};

/** Enkel in-memory CacheStore uten TTL-logikk — TTL testes i cache-laget. */
function createFakeCacheStore(): CacheStore {
  const entries = new Map<string, unknown>();
  return {
    get: <T>(key: string): T | null =>
      entries.has(key) ? (entries.get(key) as T) : null,
    set: <T>(key: string, value: T): void => {
      entries.set(key, value);
    },
    remove: (key: string): void => {
      entries.delete(key);
    },
    clear: (): void => {
      entries.clear();
    },
  };
}

describe("CachingMediaProvider", () => {
  let searchMock: Mock<MediaProvider["search"]>;
  let getDetailsMock: Mock<MediaProvider["getDetails"]>;
  let cache: CacheStore;
  let provider: CachingMediaProvider;

  beforeEach(() => {
    searchMock = vi.fn<MediaProvider["search"]>().mockResolvedValue([]);
    getDetailsMock = vi
      .fn<MediaProvider["getDetails"]>()
      .mockResolvedValue(createMovieMedia());
    cache = createFakeCacheStore();
    provider = new CachingMediaProvider(
      createMockMediaProvider({
        search: searchMock,
        getDetails: getDetailsMock,
      }),
      cache,
      TTL,
    );
  });

  it("speiler id fra den indre provideren", () => {
    expect(provider.id).toBe("mock");
  });

  describe("search", () => {
    it("kaller indre provider ved cache-miss og cacher resultatet", async () => {
      const results = [createMediaSummary()];
      searchMock.mockResolvedValue(results);

      await expect(provider.search("the matrix")).resolves.toEqual(results);
      expect(searchMock).toHaveBeenCalledTimes(1);
      expect(cache.get(buildSearchCacheKey("mock", "the matrix"))).toEqual(
        results,
      );
    });

    it("hopper over indre kall ved cache-hit", async () => {
      const results = [createMediaSummary()];
      searchMock.mockResolvedValue(results);

      await provider.search("the matrix");
      const second = await provider.search("the matrix");

      expect(second).toEqual(results);
      expect(searchMock).toHaveBeenCalledTimes(1);
    });

    it("behandler cachet tomt resultat som hit, ikke miss", async () => {
      searchMock.mockResolvedValue([]);

      await provider.search("no hits");
      await expect(provider.search("no hits")).resolves.toEqual([]);

      expect(searchMock).toHaveBeenCalledTimes(1);
    });

    it("gir cache-hit for samme query med annen casing/whitespace", async () => {
      searchMock.mockResolvedValue([createMediaSummary()]);

      await provider.search("the matrix");
      await provider.search("  The  MATRIX ");

      expect(searchMock).toHaveBeenCalledTimes(1);
    });

    it("cacher med searchTtlMs fra konfigurasjonen", async () => {
      const setSpy = vi.spyOn(cache, "set");
      searchMock.mockResolvedValue([]);

      await provider.search("the matrix");

      expect(setSpy).toHaveBeenCalledWith(
        buildSearchCacheKey("mock", "the matrix"),
        [],
        TTL.searchTtlMs,
      );
    });

    it("videresender options til indre provider og cacher ikke ved feil", async () => {
      const failure = new Error("network down");
      searchMock.mockRejectedValue(failure);
      const controller = new AbortController();

      await expect(
        provider.search("the matrix", { signal: controller.signal }),
      ).rejects.toBe(failure);
      expect(searchMock).toHaveBeenCalledWith("the matrix", {
        signal: controller.signal,
      });
      expect(cache.get(buildSearchCacheKey("mock", "the matrix"))).toBeNull();
    });
  });

  describe("getDetails", () => {
    it("kaller indre provider ved cache-miss og cacher resultatet", async () => {
      const media = createMovieMedia();
      getDetailsMock.mockResolvedValue(media);

      await expect(provider.getDetails("mock-movie-1")).resolves.toEqual(media);
      expect(getDetailsMock).toHaveBeenCalledTimes(1);
      expect(cache.get(buildDetailsCacheKey("mock", "mock-movie-1"))).toEqual(
        media,
      );
    });

    it("hopper over indre kall ved cache-hit", async () => {
      const media = createMovieMedia();
      getDetailsMock.mockResolvedValue(media);

      await provider.getDetails("mock-movie-1");
      const second = await provider.getDetails("mock-movie-1");

      expect(second).toEqual(media);
      expect(getDetailsMock).toHaveBeenCalledTimes(1);
    });

    it("cacher med detailsTtlMs fra konfigurasjonen", async () => {
      const setSpy = vi.spyOn(cache, "set");
      const media = createMovieMedia();
      getDetailsMock.mockResolvedValue(media);

      await provider.getDetails("mock-movie-1");

      expect(setSpy).toHaveBeenCalledWith(
        buildDetailsCacheKey("mock", "mock-movie-1"),
        media,
        TTL.detailsTtlMs,
      );
    });

    it("videresender options til indre provider og cacher ikke ved feil", async () => {
      const failure = new Error("not found");
      getDetailsMock.mockRejectedValue(failure);
      const controller = new AbortController();

      await expect(
        provider.getDetails("mock-movie-1", { signal: controller.signal }),
      ).rejects.toBe(failure);
      expect(getDetailsMock).toHaveBeenCalledWith("mock-movie-1", {
        signal: controller.signal,
      });
      expect(
        cache.get(buildDetailsCacheKey("mock", "mock-movie-1")),
      ).toBeNull();
    });
  });
});
