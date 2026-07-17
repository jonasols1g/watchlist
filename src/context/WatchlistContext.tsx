import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

export interface WatchlistContextValue {
  items: WatchlistItem[];
  addToWatchlist: (media: MediaSummary) => void;
  removeFromWatchlist: (mediaId: string) => void;
  setStatus: (mediaId: string, status: WatchlistStatus) => void;
  isInWatchlist: (mediaId: string) => boolean;
  getStatus: (mediaId: string) => WatchlistStatus | null;
  /** `true` når siste lagringsforsøk mot `localStorage` feilet (se docs/design.md#watchlist-ux). */
  saveError: boolean;
  dismissSaveError: () => void;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export interface WatchlistProviderProps {
  children: ReactNode;
}

/**
 * Global watchlist-state (se «State management» i docs/architecture.md):
 * React Context + `useReducer`, persistert til `localStorage` via
 * `watchlistStorage` på hver endring. Skriving som feiler (full
 * lagringsplass selv etter cache-opprydding) tapes aldri stille — `saveError`
 * eksponeres slik at UI kan vise en synlig feilmelding.
 *
 * Persisteringen skjer synkront inne i `applyAction` (kalt fra
 * add/remove/setStatus), *ikke* i en `useEffect` som reagerer på `items`:
 * `items` speiles i en ref som oppdateres i samme steg som reduceren kjøres,
 * slik at flere handlinger i samme hendelse alltid lagrer det korrekte,
 * akkumulerte resultatet — og et separat `setSaveError`-kall i en effekt
 * (som ville trigget en unødvendig ekstra render) unngås.
 */
export function WatchlistProvider({ children }: WatchlistProviderProps) {
  const [items, dispatch] = useReducer(
    watchlistReducer,
    undefined,
    loadWatchlistFromStorage,
  );
  // Speiler kun det som faktisk skrives via `applyAction` under — *ikke*
  // synkronisert med `items` på hver render (det ville vært en
  // ref-mutasjon under selve renderingen, som React (og
  // `eslint-plugin-react-hooks`) ikke tillater). Alle endringer går uten
  // unntak via `applyAction`, som holder `itemsRef.current` og React sin
  // egen reducer-tilstand i lockstep.
  const itemsRef = useRef(items);

  const [saveError, setSaveError] = useState(false);

  const applyAction = useCallback((action: WatchlistAction) => {
    const next = watchlistReducer(itemsRef.current, action);
    itemsRef.current = next;
    dispatch(action);
    const ok = saveWatchlistToStorage(next);
    setSaveError(!ok);
  }, []);

  const addToWatchlist = useCallback(
    (media: MediaSummary) => {
      applyAction({
        type: "ADD",
        item: {
          mediaId: media.id,
          media,
          status: "planned",
          addedAt: new Date().toISOString(),
        },
      });
    },
    [applyAction],
  );

  const removeFromWatchlist = useCallback(
    (mediaId: string) => {
      applyAction({ type: "REMOVE", mediaId });
    },
    [applyAction],
  );

  const setStatus = useCallback(
    (mediaId: string, status: WatchlistStatus) => {
      applyAction({ type: "SET_STATUS", mediaId, status });
    },
    [applyAction],
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
