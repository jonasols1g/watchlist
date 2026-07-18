import type { WatchlistItem, WatchlistStatus } from "../../types/watchlist";

/**
 * Async storage-grensesnitt for watchlisten mot en ekte, delt database
 * (DB-migrering issue C — se
 * docs/plans/watchlist-database-migrering.md#arkitektur). Parallelt til
 * `MediaProvider`-mønsteret: konsumenten (`WatchlistContext`) er uavhengig av
 * hvilken database som faktisk brukes bak grensesnittet — i dag
 * `FirestoreWatchlistStorage`.
 *
 * MERK — filnavn: issue #18/planen spesifiserer filnavnet
 * `WatchlistStorage.ts`, men det kolliderer bokstavelig med det allerede
 * eksisterende `watchlistStorage.ts` (den synkrone `localStorage`-koden) på
 * et versjonssensitivt-men-ikke-store/små bokstaver-filsystem (macOS' APFS
 * standardoppsett, verifisert empirisk under implementasjonen: å lese
 * `WatchlistStorage.ts` returnerte innholdet i `watchlistStorage.ts`). De to
 * filene kan derfor ikke sameksistere med kun forskjell i store/små
 * bokstaver i navnet på dette utviklingsmiljøet (og ville vært en skjør
 * felle for enhver fremtidig macOS-/Windows-utvikler på repoet, selv om
 * Linux-CI ikke ville brydd seg). Selve det eksporterte grensesnittnavnet
 * (`WatchlistStorage`, se under) er likevel nøyaktig som spesifisert — kun
 * filbanen er endret for å unngå kollisjonen. Se PR-beskrivelsen for full
 * begrunnelse.
 *
 * `watchlistStorage.ts` implementerer *ikke* dette grensesnittet — den er
 * fortsatt en egen, separat offline-skriveputt (se
 * `LocalStorageWatchlistStorage`), ikke lenger primær kilde.
 */
export interface WatchlistStorage {
  /** Henter hele watchlisten for brukeren fra databasen. */
  load(userId: string): Promise<WatchlistItem[]>;
  /** Oppretter eller overskriver et helt element (dokument-ID = `item.mediaId`). */
  upsert(userId: string, item: WatchlistItem): Promise<void>;
  /** Fjerner ett element fra watchlisten. */
  remove(userId: string, mediaId: string): Promise<void>;
  /**
   * Oppdaterer kun status (og `watchedAt`) på et eksisterende element.
   * `watchedAt` utelates/fjernes når den er `undefined` (tilbakebytte til
   * "planned" — se docs/data-model.md#typeswatchlistts).
   */
  updateStatus(
    userId: string,
    mediaId: string,
    status: WatchlistStatus,
    watchedAt?: string,
  ): Promise<void>;
}
