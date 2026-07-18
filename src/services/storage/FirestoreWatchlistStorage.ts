import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore/lite";
import type { MediaSummary } from "../../types/media";
import type { WatchlistItem, WatchlistStatus } from "../../types/watchlist";
import type { WatchlistStorage } from "./WatchlistRemoteStorage";

const WATCHLIST_SUBCOLLECTION = "watchlistItems";

function isWatchlistStatus(value: unknown): value is WatchlistStatus {
  return value === "planned" || value === "watched";
}

// Samme runtime-validering som `watchlistStorage.ts` bruker for
// `localStorage`-data (se docs/architecture.md#robusthet-og-sikkerhet) —
// dupliseres bevisst lite/lokalt her fremfor å eksportere fra
// `watchlistStorage.ts`, som issue #18 sier skal holdes uendret.
function isMediaSummary(value: unknown): value is MediaSummary {
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

/**
 * Mapper et Firestore-dokument (`users/{uid}/watchlistItems/{mediaId}`) til
 * en `WatchlistItem`. Feil form (korrupt/manipulert data) behandles som
 * fravær av elementet — samme prinsipp som `watchlistStorage.ts`s
 * `isWatchlistItemArray`-validering, ikke en krasj.
 */
function toWatchlistItem(
  mediaId: string,
  data: Record<string, unknown>,
): WatchlistItem | null {
  if (
    !isMediaSummary(data.media) ||
    !isWatchlistStatus(data.status) ||
    typeof data.addedAt !== "string" ||
    (data.watchedAt !== undefined && typeof data.watchedAt !== "string")
  ) {
    return null;
  }

  const item: WatchlistItem = {
    mediaId,
    media: data.media,
    status: data.status,
    addedAt: data.addedAt,
  };
  if (typeof data.watchedAt === "string") {
    item.watchedAt = data.watchedAt;
  }
  return item;
}

function toFirestoreData(item: WatchlistItem): Record<string, unknown> {
  const data: Record<string, unknown> = {
    media: item.media,
    status: item.status,
    addedAt: item.addedAt,
  };
  if (item.watchedAt !== undefined) {
    data.watchedAt = item.watchedAt;
  }
  return data;
}

/**
 * `WatchlistStorage` mot Firestore (DB-migrering issue C — se
 * docs/plans/watchlist-database-migrering.md#datamodell-firestore).
 * Dokument-ID = `mediaId` (IMDb-ID), under `users/{uid}/watchlistItems/`.
 *
 * Bygget mot `firebase/firestore/lite` (ikke den fulle `firebase/firestore`)
 * — se `services/auth/firebaseClient.ts` for begrunnelsen (ingen realtime-
 * lyttere brukes her, og Lite-SDK-en gir ordinære, stubbare REST-kall for
 * E2E fremfor den fulle SDK-ens WebChannel-sesjonsprotokoll).
 */
export class FirestoreWatchlistStorage implements WatchlistStorage {
  private readonly firestore: Firestore;

  constructor(firestore: Firestore) {
    this.firestore = firestore;
  }

  private docRef(userId: string, mediaId: string) {
    return doc(
      this.firestore,
      "users",
      userId,
      WATCHLIST_SUBCOLLECTION,
      mediaId,
    );
  }

  async load(userId: string): Promise<WatchlistItem[]> {
    const snapshot = await getDocs(
      collection(this.firestore, "users", userId, WATCHLIST_SUBCOLLECTION),
    );
    const items: WatchlistItem[] = [];
    for (const documentSnapshot of snapshot.docs) {
      const item = toWatchlistItem(documentSnapshot.id, documentSnapshot.data());
      if (item !== null) {
        items.push(item);
      }
    }
    return items;
  }

  async upsert(userId: string, item: WatchlistItem): Promise<void> {
    await setDoc(this.docRef(userId, item.mediaId), toFirestoreData(item));
  }

  async remove(userId: string, mediaId: string): Promise<void> {
    await deleteDoc(this.docRef(userId, mediaId));
  }

  async updateStatus(
    userId: string,
    mediaId: string,
    status: WatchlistStatus,
    watchedAt?: string,
  ): Promise<void> {
    await updateDoc(this.docRef(userId, mediaId), {
      status,
      // `watchedAt` fjernes eksplisitt (ikke satt til `undefined`, som
      // Firestore ikke tillater) ved tilbakebytte til "planned" — se
      // docs/data-model.md#typeswatchlistts.
      watchedAt: watchedAt === undefined ? deleteField() : watchedAt,
    });
  }
}
