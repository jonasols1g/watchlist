import { describe, expect, it } from "vitest";
import { CACHE_KEY_PREFIX, DATA_KEY_PREFIX } from "../../utils/storageKeys";
import { buildDetailsCacheKey, buildSearchCacheKey } from "./cacheKeys";

describe("cacheKeys", () => {
  it("bygger søkenøkkel på formen watchlist:v1:cache:search:<provider>:<query>", () => {
    expect(buildSearchCacheKey("mock", "the matrix")).toBe(
      "watchlist:v1:cache:search:mock:the matrix",
    );
  });

  it("normaliserer query før nøkkelbygging", () => {
    expect(buildSearchCacheKey("mock", "  The  MATRIX ")).toBe(
      buildSearchCacheKey("mock", "the matrix"),
    );
  });

  it("bygger detaljnøkkel på formen watchlist:v1:cache:details:<provider>:<id>", () => {
    expect(buildDetailsCacheKey("mock", "tt0133093")).toBe(
      "watchlist:v1:cache:details:mock:tt0133093",
    );
  });

  it("legger alle nøkler i cache-navnerommet, som er adskilt fra data-navnerommet", () => {
    const searchKey = buildSearchCacheKey("mock", "solaris");
    const detailsKey = buildDetailsCacheKey("mock", "mock-movie-2");
    expect(searchKey.startsWith(CACHE_KEY_PREFIX)).toBe(true);
    expect(detailsKey.startsWith(CACHE_KEY_PREFIX)).toBe(true);
    expect(searchKey.startsWith(DATA_KEY_PREFIX)).toBe(false);
    expect(detailsKey.startsWith(DATA_KEY_PREFIX)).toBe(false);
  });
});
