import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { migrateLocalWatchlistToCloud } from "../services/storage/migrateLocalWatchlistToCloud";
import type { WatchlistStorage } from "../services/storage/WatchlistRemoteStorage";
import {
  loadWatchlistFromStorage,
  saveWatchlistToStorage,
} from "../services/storage/watchlistStorage";
import type { MediaSummary } from "../types/media";
import type { WatchlistItem, WatchlistStatus } from "../types/watchlist";

export type WatchlistAction =
  | { type: "ADD"; item: WatchlistItem }
  | { type: "REMOVE"; mediaId: string }
  | { type: "SET_STATUS"; mediaId: string; status: WatchlistStatus };

export function watchlistReducer(
  state: WatchlistItem[],
  action: WatchlistAction,
): WatchlistItem[] {
  switch (action.type) {
    case "ADD":
      // Idempotent: en tittel som allerede er i watchlisten legges ikke til på nytt.
      if (state.some((item) => item.mediaId === action.item.mediaId)) {
        return state;
      }
      return [...state, action.item];

    case "REMOVE":
      return state.filter((item) => item.mediaId !== action.mediaId);

    case "SET_STATUS":
      return state.map((item) =>
        item.mediaId === action.mediaId
          ? {
              ...item,
              status: action.status,
              // watchedAt settes kun når status endres til "watched" (se
              // docs/data-model.md#typeswatchlistts); ved tilbakebytte til
              // "planned" fjernes den igjen fremfor å beholde en stale verdi.
              watchedAt:
                action.status === "watched"
                  ? new Date().toISOString()
                  : undefined,
            }
          : item,
      );

    default:
      return state;
  }
}

/** En ren funksjon som anvender/reverserer nøyaktig én handlings egen effekt
 * på et hvilket som helst gitt datasett — brukt i stedet for å
 * erstatte/gjenopprette hele arrayen med et gammelt snapshot, slik at
 * senere, uavhengige handlinger på andre titler aldri klippes bort (se
 * PR #23-reviewen). */
type ItemsPatch = (items: WatchlistItem[]) => WatchlistItem[];

/**
 * Beregner en presis "angre"-patch for `action`, gitt tilstanden rett *før*
 * den ble anvendt (`before`). Brukes ved feilet Firestore-skriving: i
 * stedet for å rulle hele tilstanden tilbake til `before` (som ville slettet
 * enhver annen, uavhengig handling som har lykkes i mellomtiden), reverserer
 * denne patchen kun `action`s egen effekt på tilstanden slik den faktisk ser
 * ut *nå* (på anvendelsestidspunktet for patchen, ikke på kalltidspunktet).
 */
function computeUndoPatch(
  action: WatchlistAction,
  before: WatchlistItem[],
): ItemsPatch {
  switch (action.type) {
    case "ADD": {
      const existedBefore = before.some(
        (item) => item.mediaId === action.item.mediaId,
      );
      if (existedBefore) {
        // Idempotent no-op-ADD (tittelen fantes allerede) — denne
        // handlingen la ikke faktisk til noe, så det er ingenting å angre.
        return (items) => items;
      }
      return (items) =>
        items.filter((item) => item.mediaId !== action.item.mediaId);
    }

    case "REMOVE": {
      const removedItem = before.find(
        (item) => item.mediaId === action.mediaId,
      );
      if (removedItem === undefined) {
        // Fantes ikke fra før (no-op-REMOVE) — ingenting å gjenopprette.
        return (items) => items;
      }
      return (items) =>
        items.some((item) => item.mediaId === removedItem.mediaId)
          ? items
          : [...items, removedItem];
    }

    case "SET_STATUS": {
      const previousItem = before.find(
        (item) => item.mediaId === action.mediaId,
      );
      if (previousItem === undefined) {
        return (items) => items;
      }
      return (items) =>
        items.map((item) =>
          item.mediaId === action.mediaId
            ? {
                ...item,
                status: previousItem.status,
                watchedAt: previousItem.watchedAt,
              }
            : item,
        );
    }

    default:
      return (items) => items;
  }
}

/**
 * Beregner en presis "gjør om"-patch for `action`, gitt tilstanden rett
 * *etter* at den ble anvendt (`after`). Brukes til å spille av handlinger
 * som ble utført mens en Firestore-henting var underveis, oppå selve
 * hentingsresultatet — i stedet for at hentingen ubetinget overskriver dem
 * (se PR #23-reviewen). Bruker det allerede beregnede `after`-datasettet
 * (ikke reduceren på nytt) slik at f.eks. `watchedAt`-tidsstempler forblir
 * nøyaktig de samme som da handlingen faktisk skjedde.
 */
function computeRedoPatch(
  action: WatchlistAction,
  after: WatchlistItem[],
): ItemsPatch {
  switch (action.type) {
    case "ADD": {
      const addedItem = action.item;
      return (items) =>
        items.some((item) => item.mediaId === addedItem.mediaId)
          ? items
          : [...items, addedItem];
    }

    case "REMOVE": {
      const { mediaId } = action;
      return (items) => items.filter((item) => item.mediaId !== mediaId);
    }

    case "SET_STATUS": {
      const updatedItem = after.find((item) => item.mediaId === action.mediaId);
      if (updatedItem === undefined) {
        return (items) => items;
      }
      return (items) =>
        items.map((item) =>
          item.mediaId === action.mediaId
            ? {
                ...item,
                status: updatedItem.status,
                watchedAt: updatedItem.watchedAt,
              }
            : item,
        );
    }

    default:
      return (items) => items;
  }
}

/**
 * Slår sammen migrerte lokale elementer (se `migrateLocalWatchlistToCloud`)
 * inn i det hentede Firestore-resultatet — lokal versjon vinner ved
 * konflikt (samme regel som selve migreringen bruker mot Firestore), slik
 * at et akkurat migrert element ikke vises med en potensielt eldre
 * Firestore-variant i UI-et i det korte vinduet før neste henting.
 */
function mergeMigratedItemsLocalWins(
  remote: WatchlistItem[],
  migrated: WatchlistItem[],
): WatchlistItem[] {
  if (migrated.length === 0) {
    return remote;
  }
  const migratedIds = new Set(migrated.map((item) => item.mediaId));
  return [
    ...remote.filter((item) => !migratedIds.has(item.mediaId)),
    ...migrated,
  ];
}

export interface WatchlistContextValue {
  items: WatchlistItem[];
  addToWatchlist: (media: MediaSummary) => void;
  removeFromWatchlist: (mediaId: string) => void;
  setStatus: (mediaId: string, status: WatchlistStatus) => void;
  isInWatchlist: (mediaId: string) => boolean;
  getStatus: (mediaId: string) => WatchlistStatus | null;
  /**
   * `true` under den *første* hentingen fra Firestore (se
   * docs/plans/watchlist-database-migrering.md#arkitektur) — ikke satt igjen
   * ved påfølgende bakgrunnsoppfriskninger (f.eks. `online`-gjenoppkobling).
   */
  isLoading: boolean;
  /**
   * `true` når siste lagringsforsøk feilet — enten mot `localStorage` (full
   * lagringsplass selv etter cache-opprydding) eller mot Firestore
   * (nettverksfeil), se docs/design.md#watchlist-ux.
   */
  saveError: boolean;
  dismissSaveError: () => void;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export interface WatchlistProviderProps {
  children: ReactNode;
  /**
   * `WatchlistStorage`-instansen som brukes som skriveputt mot en delt
   * database (Firestore i produksjon, en testdobbel i tester) — injisert
   * eksplisitt fremfor konsumert fra en nestet context, samme DI-mønster som
   * `MediaProviderProvider.provider` (se docs/architecture.md#state-
   * management), for å gjøre testdobler trivielle å bruke.
   */
  storage: WatchlistStorage;
  /**
   * IMDb-uavhengig bruker-ID fra `AuthContext` (anonym Firebase-sesjon).
   * `null` inntil den anonyme sesjonen er klar (eller ved en autentiserings-
   * feil) — writes går da kun til den lokale skriveputten (`localStorage`),
   * ingen Firestore-synk skjer før `userId` er satt (se v1-avgrensningen i
   * docs/plans/watchlist-database-migrering.md#arkitektur — ingen full
   * offline-synk-kø bygges).
   */
  userId: string | null;
}

/**
 * Global watchlist-state (se «State management» i docs/architecture.md):
 * React Context + lokal `items`-state, med optimistic update + write-through
 * mot to lag — synkront til `localStorage` (uendret, se
 * `services/storage/watchlistStorage.ts`) og asynkront til
 * `WatchlistStorage` (Firestore i produksjon, DB-migrering issue C).
 *
 * Mønster per handling (`applyAction`):
 * 1. `watchlistReducer` (ren funksjon, uendret siden før DB-migreringen)
 *    beregner neste tilstand og den settes umiddelbart (optimistic update).
 * 2. Neste tilstand skrives synkront til `localStorage`.
 * 3. Den tilsvarende operasjonen sendes asynkront til `storage`
 *    (`WatchlistStorage`). Feiler den, angres *kun denne handlingens egen
 *    effekt* (via `computeUndoPatch`, anvendt på gjeldende `itemsRef.current`
 *    på feiltidspunktet — ikke et gammelt snapshot), og `saveError` settes.
 *    Se PR #23-reviewen: å erstatte hele tilstanden med et snapshot tatt ved
 *    kalltidspunktet kunne slette en senere, uavhengig, vellykket handling
 *    på en annen tittel.
 *
 * Tilsvarende presisjon gjelder `hydrate()`: handlinger utført mens den
 * *initiale* Firestore-hentingen er underveis spilles av oppå
 * hentingsresultatet (via `computeRedoPatch`) i stedet for å bli overskrevet
 * av det.
 *
 * Rett etter at den initiale hentingen er ferdig, forsøkes en engangs-
 * migrering av en eventuell eksisterende `localStorage`-watchlist til
 * Firestore (`migrateLocalWatchlistToCloud`, DB-migrering issue D) —
 * ventes på før `items` settes, slik at allerede-lokale elementer aldri
 * blinker bort bak et (typisk tomt) første Firestore-hentingsresultat.
 *
 * `items` speiles i en ref (`itemsRef`) som oppdateres i samme steg som
 * state settes, slik at flere handlinger i rask rekkefølge alltid bygger
 * videre på det korrekte, akkumulerte resultatet (ikke en stale closure over
 * `items`).
 */
export function WatchlistProvider({
  children,
  storage,
  userId,
}: WatchlistProviderProps) {
  const [items, setItems] = useState<WatchlistItem[]>(loadWatchlistFromStorage);
  const itemsRef = useRef(items);

  const [isLoading, setIsLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const hasHydratedOnceRef = useRef(false);

  // Handlinger utført mens en henting er underveis må spilles av oppå
  // hentingsresultatet i stedet for å bli overskrevet av det (se
  // docstringen over og PR #23-reviewen).
  const isHydratingRef = useRef(false);
  const pendingPatchesRef = useRef<ItemsPatch[]>([]);

  const hydrate = useCallback(() => {
    if (userId === null) {
      return;
    }

    const isInitialHydration = !hasHydratedOnceRef.current;
    if (isInitialHydration) {
      setIsLoading(true);
    }

    isHydratingRef.current = true;
    pendingPatchesRef.current = [];

    storage
      .load(userId)
      .then(async (remoteItems) => {
        hasHydratedOnceRef.current = true;
        isHydratingRef.current = false;

        // Spill av handlinger som ble utført mens hentingen var underveis,
        // oppå det hentede resultatet — dekker racen der f.eks. et
        // addToWatchlist-kall midt i en pågående henting ellers ville blitt
        // usynlig igjen idet hentingen resolver med et datasett fra før
        // handlingen.
        const patches = pendingPatchesRef.current;
        pendingPatchesRef.current = [];
        let merged = patches.reduce((acc, patch) => patch(acc), remoteItems);

        // Engangs-migrering av en eventuell eksisterende
        // localStorage-watchlist til Firestore (DB-migrering issue D), kun
        // forsøkt ved den *initiale* hentingen i denne app-instansens
        // levetid — se docs/plans/watchlist-database-migrering.md#migrering-
        // av-eksisterende-localstorage-data. Ventes på her (før `setItems`
        // kalles i det hele tatt) slik at eventuelle allerede-lokale
        // elementer aldri vises som midlertidig forsvunnet bak et typisk
        // tomt første Firestore-hentingsresultat.
        if (isInitialHydration) {
          const migration = await migrateLocalWatchlistToCloud(userId, storage);
          if (migration.items.length > 0) {
            // Slås inn i visningen uansett om selve opplastingen lyktes —
            // se `WatchlistMigrationOutcome`s docstring for begrunnelsen
            // (kjente, gyldige lokale data skal ikke fremstå som forsvunnet
            // mens migreringen venter på et senere retry-forsøk).
            merged = mergeMigratedItemsLocalWins(merged, migration.items);
            if (!migration.succeeded) {
              setSaveError(true);
            }
          }
        }

        itemsRef.current = merged;
        setItems(merged);
        if (isInitialHydration) {
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        console.error(
          "[watchlist] Kunne ikke hente watchlisten fra Firestore",
          error,
        );
        hasHydratedOnceRef.current = true;
        isHydratingRef.current = false;
        // Hentingen feilet — lokal state (allerede oppdatert optimistisk av
        // eventuelle handlinger underveis) er urørt, så det er ingenting å
        // spille av. Nullstill likevel køen for å unngå at eldre patcher
        // (med potensielt utdaterte tidsstempler) gjenbrukes av en senere,
        // vellykket henting.
        pendingPatchesRef.current = [];
        if (isInitialHydration) {
          setIsLoading(false);
        }
        setSaveError(true);
      });
  }, [storage, userId]);

  // Første henting (eller ny henting dersom userId/storage endres — i
  // praksis kun når den anonyme sesjonen blir klar).
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // v1-avgrensning (se docs/plans/watchlist-database-migrering.md#arkitektur):
  // ingen full offline-synk-kø, men en enkel gjenoppkoblings-retry — når
  // nettleseren melder at den er tilbake online, hentes watchlisten på nytt
  // fra Firestore (harmløst å gjøre selv om forrige henting lyktes).
  useEffect(() => {
    window.addEventListener("online", hydrate);
    return () => {
      window.removeEventListener("online", hydrate);
    };
  }, [hydrate]);

  const applyAction = useCallback(
    (
      action: WatchlistAction,
      syncToRemote: (uid: string, next: WatchlistItem[]) => Promise<void>,
    ) => {
      const previous = itemsRef.current;
      const next = watchlistReducer(previous, action);
      itemsRef.current = next;
      setItems(next);

      // Registrer en gjør-om-patch for denne handlingen så lenge en henting
      // er underveis (se `hydrate()`) — samme patch-referanse gjenbrukes
      // under for å fjerne den igjen dersom denne handlingens egen skriving
      // feiler *før* hentingen rekker å resolve (uten dette ville en
      // rullet-tilbake handling likevel blitt "gjort om" igjen når
      // hentingen senere spiller av køen).
      const redoPatchForHydration = isHydratingRef.current
        ? computeRedoPatch(action, next)
        : null;
      if (redoPatchForHydration !== null) {
        pendingPatchesRef.current = [
          ...pendingPatchesRef.current,
          redoPatchForHydration,
        ];
      }

      const savedLocally = saveWatchlistToStorage(next);
      setSaveError(!savedLocally);

      if (userId === null) {
        // Auth-sesjonen er ikke klar ennå (eller feilet) — se
        // `WatchlistProviderProps.userId`.
        return;
      }

      syncToRemote(userId, next).catch((error: unknown) => {
        console.error(
          "[watchlist] Kunne ikke lagre watchlist-endringen til Firestore — ruller tilbake",
          error,
        );
        if (redoPatchForHydration !== null) {
          pendingPatchesRef.current = pendingPatchesRef.current.filter(
            (patch) => patch !== redoPatchForHydration,
          );
        }
        // Angre kun DENNE handlingens egen effekt, anvendt på tilstanden
        // slik den faktisk er *nå* (kan ha blitt endret av andre,
        // uavhengige handlinger i mellomtiden) — ikke et gammelt snapshot
        // fra kalltidspunktet (se PR #23-reviewen).
        const undoPatch = computeUndoPatch(action, previous);
        const rolledBack = undoPatch(itemsRef.current);
        itemsRef.current = rolledBack;
        setItems(rolledBack);
        saveWatchlistToStorage(rolledBack);
        setSaveError(true);
      });
    },
    [userId],
  );

  const addToWatchlist = useCallback(
    (media: MediaSummary) => {
      const item: WatchlistItem = {
        mediaId: media.id,
        media,
        status: "planned",
        addedAt: new Date().toISOString(),
      };
      applyAction({ type: "ADD", item }, (uid) => storage.upsert(uid, item));
    },
    [applyAction, storage],
  );

  const removeFromWatchlist = useCallback(
    (mediaId: string) => {
      applyAction({ type: "REMOVE", mediaId }, (uid) =>
        storage.remove(uid, mediaId),
      );
    },
    [applyAction, storage],
  );

  const setStatus = useCallback(
    (mediaId: string, status: WatchlistStatus) => {
      applyAction({ type: "SET_STATUS", mediaId, status }, (uid, next) => {
        const watchedAt = next.find(
          (item) => item.mediaId === mediaId,
        )?.watchedAt;
        return storage.updateStatus(uid, mediaId, status, watchedAt);
      });
    },
    [applyAction, storage],
  );

  const isInWatchlist = useCallback(
    (mediaId: string) => items.some((item) => item.mediaId === mediaId),
    [items],
  );

  const getStatus = useCallback(
    (mediaId: string) =>
      items.find((item) => item.mediaId === mediaId)?.status ?? null,
    [items],
  );

  const dismissSaveError = useCallback(() => {
    setSaveError(false);
  }, []);

  const value = useMemo<WatchlistContextValue>(
    () => ({
      items,
      addToWatchlist,
      removeFromWatchlist,
      setStatus,
      isInWatchlist,
      getStatus,
      isLoading,
      saveError,
      dismissSaveError,
    }),
    [
      items,
      addToWatchlist,
      removeFromWatchlist,
      setStatus,
      isInWatchlist,
      getStatus,
      isLoading,
      saveError,
      dismissSaveError,
    ],
  );

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist(): WatchlistContextValue {
  const context = useContext(WatchlistContext);
  if (context === null) {
    throw new Error("useWatchlist må brukes innenfor en WatchlistProvider");
  }
  return context;
}
