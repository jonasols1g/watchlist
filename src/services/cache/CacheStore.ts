export interface CacheStore {
  get<T>(key: string): T | null; // null = mangler eller utløpt
  set<T>(key: string, value: T, ttlMs: number): void;
  remove(key: string): void;
  clear(): void; // kun cache-navnerom, ikke watchlist-data
}
