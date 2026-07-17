import type { CacheEntry } from "../../types/cache";
import { CACHE_KEY_PREFIX } from "../../utils/storageKeys";
import type { CacheStore } from "./CacheStore";

/**
 * Minste felles flate mot `localStorage` som cache-storen trenger. Både ekte
 * `Storage` og in-memory-fallbacken oppfyller den, og tester kan injisere
 * kontrollerte varianter (f.eks. med kvotegrense).
 */
export interface KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * In-memory-fallback når `localStorage` er utilgjengelig (deaktivert, enkelte
 * private-moduser). Appen fungerer da fullt ut, men uten persistens mellom
 * økter.
 */
export class InMemoryKeyValueStorage implements KeyValueStorage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    if (index < 0 || index >= this.entries.size) {
      return null;
    }
    return [...this.entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

/**
 * Feature-detection av `localStorage`: selve property-aksessen kan kaste
 * (SecurityError), og en prøveskriving avslører moduser der storage finnes,
 * men avviser all skriving.
 */
function detectLocalStorage(): KeyValueStorage | null {
  try {
    const storage = globalThis.localStorage;
    const probeKey = `${CACHE_KEY_PREFIX}__probe__`;
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

function isCacheEntry(value: unknown): value is CacheEntry<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    "cachedAt" in value &&
    "expiresAt" in value &&
    typeof (value as { cachedAt: unknown }).cachedAt === "number" &&
    Number.isFinite((value as { cachedAt: number }).cachedAt) &&
    typeof (value as { expiresAt: unknown }).expiresAt === "number" &&
    Number.isFinite((value as { expiresAt: number }).expiresAt)
  );
}

/** Øvre grense for evictions per `set()` — cache skal aldri kunne henge appen. */
const MAX_EVICTION_ITERATIONS = 100;

/**
 * `CacheStore` over `localStorage`, med in-memory-fallback, runtime-validering
 * av leste entries og best effort-håndtering av `QuotaExceededError`.
 * Se «Cache-design» og «Robusthet og sikkerhet» i docs/architecture.md.
 *
 * Storen opererer kun på nøkler i cache-navnerommet (`watchlist:v1:cache:`);
 * `clear()` og eviction rører aldri data-navnerommet (watchlisten).
 */
export class LocalStorageCacheStore implements CacheStore {
  private readonly storage: KeyValueStorage;

  constructor(storage?: KeyValueStorage) {
    this.storage =
      storage ?? detectLocalStorage() ?? new InMemoryKeyValueStorage();
  }

  get<T>(key: string): T | null {
    const raw = this.storage.getItem(key);
    if (raw === null) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Korrupt entry = cache-miss; fjernes stille.
      this.storage.removeItem(key);
      return null;
    }

    if (!isCacheEntry(parsed)) {
      // Feil form = cache-miss; fjernes stille.
      this.storage.removeItem(key);
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      this.storage.removeItem(key);
      return null;
    }

    return parsed.data as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      data: value,
      cachedAt: now,
      expiresAt: now + ttlMs,
    };

    let serialized: string;
    try {
      serialized = JSON.stringify(entry);
    } catch (error) {
      console.warn("[cache] Could not serialize cache entry; skipping", error);
      return;
    }

    if (this.trySetItem(key, serialized)) {
      return;
    }

    // Kvote-feil: fjern først alle utløpte cache-oppføringer …
    this.removeExpiredEntries();
    if (this.trySetItem(key, serialized)) {
      return;
    }

    // … deretter eldste (cachedAt stigende) til skriving lykkes eller grensen nås.
    for (let i = 0; i < MAX_EVICTION_ITERATIONS; i++) {
      const oldestKey = this.findOldestEntryKey();
      if (oldestKey === null) {
        break;
      }
      this.storage.removeItem(oldestKey);
      if (this.trySetItem(key, serialized)) {
        return;
      }
    }

    // Cache er best effort — gi opp stille; verdien returneres uansett fra
    // kallet som trigget dette settet.
    console.warn(
      `[cache] Could not persist cache entry for "${key}"; giving up`,
    );
  }

  remove(key: string): void {
    this.storage.removeItem(key);
  }

  clear(): void {
    for (const key of this.listCacheKeys()) {
      this.storage.removeItem(key);
    }
  }

  private trySetItem(key: string, serialized: string): boolean {
    try {
      this.storage.setItem(key, serialized);
      return true;
    } catch {
      return false;
    }
  }

  /** Alle nøkler i cache-navnerommet — aldri data-navnerommet. */
  private listCacheKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key !== null && key.startsWith(CACHE_KEY_PREFIX)) {
        keys.push(key);
      }
    }
    return keys;
  }

  private removeExpiredEntries(): void {
    const now = Date.now();
    for (const key of this.listCacheKeys()) {
      const entry = this.readEntry(key);
      // Feilformede entries er verdiløse og ryddes også bort her.
      if (entry === null || entry.expiresAt <= now) {
        this.storage.removeItem(key);
      }
    }
  }

  private findOldestEntryKey(): string | null {
    let oldestKey: string | null = null;
    let oldestCachedAt = Infinity;
    for (const key of this.listCacheKeys()) {
      const entry = this.readEntry(key);
      // Feilformede entries regnes som eldst og evictes først.
      const cachedAt = entry === null ? -Infinity : entry.cachedAt;
      if (cachedAt < oldestCachedAt) {
        oldestCachedAt = cachedAt;
        oldestKey = key;
      }
    }
    return oldestKey;
  }

  /** Leser og validerer en entry uten å røre den; null = korrupt/feil form. */
  private readEntry(key: string): CacheEntry<unknown> | null {
    const raw = this.storage.getItem(key);
    if (raw === null) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    return isCacheEntry(parsed) ? parsed : null;
  }
}
