import { normalizeQuery } from "../../utils/normalizeQuery";
import { CACHE_KEY_PREFIX } from "../../utils/storageKeys";

/**
 * Nøkkelstrategi fra «Cache-design» i docs/architecture.md. Query normaliseres
 * (trim/lowercase/whitespace-kollaps) før nøkkelen bygges — normalisering her
 * er idempotent, så det er trygt å sende inn både rå og allerede normalisert
 * query.
 */
export function buildSearchCacheKey(providerId: string, query: string): string {
  return `${CACHE_KEY_PREFIX}search:${providerId}:${normalizeQuery(query)}`;
}

export function buildDetailsCacheKey(providerId: string, id: string): string {
  return `${CACHE_KEY_PREFIX}details:${providerId}:${id}`;
}
