import type { CacheEntry } from "../../types/cache";
import type { WatchlistItem, WatchlistStatus } from "../../types/watchlist";
import { CACHE_KEY_PREFIX, DATA_KEY_PREFIX } from "../../utils/storageKeys";
import {
  InMemoryKeyValueStorage,
  detectLocalStorage,
  type KeyValueStorage,
} from "../cache/LocalStorageCacheStore";

const WATCHLIST_STORAGE_KEY = `${DATA_KEY_PREFIX}items`;

/**
 * Flagg satt etter en vellykket engangs-migrering av den lokale watchlisten
 * til Firestore (DB-migrering issue D — se
 * docs/plans/watchlist-database-migrering.md#migrering-av-eksisterende-
 * localstorage-data og `services/storage/migrateLocalWatchlistToCloud.ts`).
 * Ren tilstedeværelse av nøkkelen er signalet — verdien selv brukes ikke.
 */
const MIGRATED_TO_CLOUD_KEY = `${DATA_KEY_PREFIX}migratedToCloud`;

/** Øvre grense for cache-evictions per lagringsforsøk — skal aldri kunne henge appen. */
const MAX_EVICTION_ITERATIONS = 100;

function isWatchlistStatus(value: unknown): value is WatchlistStatus {
  return value === "planned" || value === "watched";
}

function isMediaSummary(value: unknown): value is WatchlistItem["media"] {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    (candidate.mediaType === "movie" || candidate.mediaType === "series") &&
    typeof candidate.title === "string" &&
    (typeof candidate.releaseYear === "number" ||
      candidate.releaseYear === null) &&
    (typeof candidate.posterUrl === "string" || candidate.posterUrl === null)
  );
}

function isWatchlistItem(value: unknown): value is WatchlistItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.mediaId === "string" &&
    isMediaSummary(candidate.media) &&
    isWatchlistStatus(candidate.status) &&
    typeof candidate.addedAt === "string" &&
    (candidate.watchedAt === undefined ||
      typeof candidate.watchedAt === "string")
  );
}

function isWatchlistItemArray(value: unknown): value is WatchlistItem[] {
  return Array.isArray(value) && value.every(isWatchlistItem);
}

function isCacheEntryShape(value: unknown): value is CacheEntry<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "cachedAt" in value &&
    "expiresAt" in value &&
    typeof (value as { cachedAt: unknown }).cachedAt === "number" &&
    typeof (value as { expiresAt: unknown }).expiresAt === "number"
  );
}

/**
 * `localStorage`-backet lagring for watchlisten, med in-memory-fallback og
 * runtime-validering ved lesing (se docs/architecture.md#cache-design og
 * #robusthet-og-sikkerhet). I motsetning til cache-laget (`best effort`,
 * skal aldri feile synlig) skal skriving av watchlist-data **aldri** tape
 * brukerdata stille: ved `QuotaExceededError` ryddes cache-navnerommet for
 * å frigjøre plass (utløpte entries først, deretter eldste), og feiler
 * skrivingen fortsatt etter det, signaliseres `ok: false` slik at kallstedet
 * (`WatchlistContext`) kan vise en synlig feilmelding.
 */
export class LocalStorageWatchlistStorage {
  private readonly storage: KeyValueStorage;

  constructor(storage: KeyValueStorage) {
    this.storage = storage;
  }

  load(): WatchlistItem[] {
    const raw = this.storage.getItem(WATCHLIST_STORAGE_KEY);
    if (raw === null) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Korrupt data behandles som tom watchlist, ikke en krasj.
      return [];
    }

    // Feil form = tom watchlist, akkurat som en korrupt cache-entry
    // behandles som miss (se docs/architecture.md#robusthet-og-sikkerhet).
    return isWatchlistItemArray(parsed) ? parsed : [];
  }

  save(items: WatchlistItem[]): boolean {
    let serialized: string;
    try {
      serialized = JSON.stringify(items);
    } catch (error) {
      console.error("[watchlist] Kunne ikke serialisere watchlist-data", error);
      return false;
    }

    if (this.trySetItem(serialized)) {
      return true;
    }

    // Skrivingen feilet (typisk QuotaExceededError): rydd cache-navnerommet
    // for å frigjøre plass — utløpte entries først, deretter eldste — og
    // prøv igjen. Watchlist-data skal aldri gå tapt stille.
    this.removeExpiredCacheEntries();
    if (this.trySetItem(serialized)) {
      return true;
    }

    for (let i = 0; i < MAX_EVICTION_ITERATIONS; i++) {
      const oldestKey = this.findOldestCacheEntryKey();
      if (oldestKey === null) {
        break;
      }
      this.storage.removeItem(oldestKey);
      if (this.trySetItem(serialized)) {
        return true;
      }
    }

    console.error(
      "[watchlist] Kunne ikke lagre watchlist-endring; lagringsplassen er full selv etter cache-opprydding",
    );
    return false;
  }

  private trySetItem(serialized: string): boolean {
    try {
      this.storage.setItem(WATCHLIST_STORAGE_KEY, serialized);
      return true;
    } catch {
      return false;
    }
  }

  /** Alle nøkler i cache-navnerommet — aldri watchlist-nøkkelen selv. */
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

  private readCacheEntry(key: string): CacheEntry<unknown> | null {
    const raw = this.storage.getItem(key);
    if (raw === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return isCacheEntryShape(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private removeExpiredCacheEntries(): void {
    const now = Date.now();
    for (const key of this.listCacheKeys()) {
      const entry = this.readCacheEntry(key);
      // Feilformede entries er verdiløse og ryddes også bort her.
      if (entry === null || entry.expiresAt <= now) {
        this.storage.removeItem(key);
      }
    }
  }

  private findOldestCacheEntryKey(): string | null {
    let oldestKey: string | null = null;
    let oldestCachedAt = Infinity;
    for (const key of this.listCacheKeys()) {
      const entry = this.readCacheEntry(key);
      const cachedAt = entry === null ? -Infinity : entry.cachedAt;
      if (cachedAt < oldestCachedAt) {
        oldestCachedAt = cachedAt;
        oldestKey = key;
      }
    }
    return oldestKey;
  }
}

// `localStorage` detekteres kun én gang og caches deretter, i stedet for å
// re-probes ved hvert load()/save()-kall. Én-gangs deteksjon (i praksis
// analogt med `LocalStorageCacheStore`, som detekterer ved konstruksjon)
// unngår en snikende feilkilde: probe-skrivingen (`detectLocalStorage`) kan
// selv kaste `QuotaExceededError` når den *ekte* watchlisten/cachen har
// fylt opp lagringsplassen — noe som ville vært en helt normal, forventet
// tilstand (håndteres av `save()`s egen cache-opprydding-og-retry), ikke et
// tegn på at `localStorage` er utilgjengelig. Med re-probing per kall ville
// nettopp den tilstanden feilaktig trigget et bytte til en flyktig
// in-memory-fallback — stikk i strid med at watchlist-skriving aldri skal
// tape data stille (se docs/architecture.md#cache-design punkt 6).
let cachedDefaultStorage: KeyValueStorage | null = null;

function resolveDefaultStorage(): KeyValueStorage {
  cachedDefaultStorage ??=
    detectLocalStorage(DATA_KEY_PREFIX) ?? new InMemoryKeyValueStorage();
  return cachedDefaultStorage;
}

/** Leser watchlisten fra `localStorage` (se `context/WatchlistContext.tsx`). */
export function loadWatchlistFromStorage(): WatchlistItem[] {
  return new LocalStorageWatchlistStorage(resolveDefaultStorage()).load();
}

/**
 * Lagrer watchlisten til `localStorage`. Returnerer `false` når skrivingen
 * feilet selv etter cache-opprydding — kallstedet må da vise en synlig
 * feilmelding (se docs/design.md#watchlist-ux).
 */
export function saveWatchlistToStorage(items: WatchlistItem[]): boolean {
  return new LocalStorageWatchlistStorage(resolveDefaultStorage()).save(items);
}

/**
 * `true` når den lokale watchlisten allerede er migrert til Firestore (se
 * `migrateLocalWatchlistToCloud.ts`) — hindrer at et gjentatt app-load
 * laster opp de samme elementene på nytt.
 */
export function hasMigratedWatchlistToCloud(): boolean {
  return resolveDefaultStorage().getItem(MIGRATED_TO_CLOUD_KEY) !== null;
}

/**
 * Setter migreringsflagget. Kalles **kun** etter at alle lokale elementer er
 * bekreftet skrevet til Firestore — se `migrateLocalWatchlistToCloud.ts`,
 * som aldri setter flagget ved en feilet opplasting (retry ved neste
 * app-load).
 */
export function markWatchlistMigratedToCloud(): void {
  resolveDefaultStorage().setItem(MIGRATED_TO_CLOUD_KEY, "true");
}
