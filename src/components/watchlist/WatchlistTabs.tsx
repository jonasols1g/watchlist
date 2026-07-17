import type { WatchlistStatus } from "../../types/watchlist";

export interface WatchlistTabsProps {
  active: WatchlistStatus;
  onChange: (status: WatchlistStatus) => void;
  plannedCount: number;
  watchedCount: number;
}

const TAB_ORDER: WatchlistStatus[] = ["planned", "watched"];

const TAB_LABEL: Record<WatchlistStatus, string> = {
  planned: "Planlagt",
  watched: "Sett",
};

/** Faneskifte mellom "Planlagt" og "Sett" på `WatchlistPage` (se docs/design.md#watchlist-ux). */
export function WatchlistTabs({
  active,
  onChange,
  plannedCount,
  watchedCount,
}: WatchlistTabsProps) {
  const counts: Record<WatchlistStatus, number> = {
    planned: plannedCount,
    watched: watchedCount,
  };

  return (
    <div
      role="tablist"
      aria-label="Watchlist-status"
      className="flex gap-2 border-b border-slate-200"
    >
      {TAB_ORDER.map((status) => (
        <button
          key={status}
          id={`watchlist-tab-${status}`}
          type="button"
          role="tab"
          aria-selected={active === status}
          aria-controls="watchlist-tabpanel"
          onClick={() => {
            onChange(status);
          }}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800 ${
            active === status
              ? "border-slate-800 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          {TAB_LABEL[status]} ({counts[status]})
        </button>
      ))}
    </div>
  );
}
