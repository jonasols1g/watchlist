import type { Media, MediaSummary } from "../../types/media";
import type { CacheStore } from "../cache/CacheStore";
import { buildDetailsCacheKey, buildSearchCacheKey } from "../cache/cacheKeys";
import type {
  DetailsOptions,
  MediaProvider,
  SearchOptions,
} from "./MediaProvider";

export interface CachingProviderTtlConfig {
  searchTtlMs: number;
  detailsTtlMs: number;
}

/**
 * Dekoratør som cacher svar fra en indre `MediaProvider`. Implementerer samme
 * interface som den wrapper, så resten av appen ser aldri forskjell på cachet
 * og ikke-cachet provider. TTL er konfigurasjon, ikke hardkodet her.
 *
 * Merk: feltene deklareres eksplisitt (ikke parameter properties) — tsconfig
 * har `erasableSyntaxOnly: true`, som forbyr TS-syntaks med runtime-semantikk.
 */
export class CachingMediaProvider implements MediaProvider {
  readonly id: string;
  private readonly inner: MediaProvider;
  private readonly cache: CacheStore;
  private readonly ttl: CachingProviderTtlConfig;

  constructor(
    inner: MediaProvider,
    cache: CacheStore,
    ttl: CachingProviderTtlConfig,
  ) {
    this.inner = inner;
    this.cache = cache;
    this.ttl = ttl;
    this.id = inner.id;
  }

  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<MediaSummary[]> {
    const key = buildSearchCacheKey(this.id, query);
    const cached = this.cache.get<MediaSummary[]>(key);
    if (cached !== null) {
      return cached;
    }

    const result = await this.inner.search(query, options);
    this.cache.set(key, result, this.ttl.searchTtlMs);
    return result;
  }

  async getDetails(id: string, options?: DetailsOptions): Promise<Media> {
    const key = buildDetailsCacheKey(this.id, id);
    const cached = this.cache.get<Media>(key);
    if (cached !== null) {
      return cached;
    }

    const result = await this.inner.getDetails(id, options);
    this.cache.set(key, result, this.ttl.detailsTtlMs);
    return result;
  }
}
