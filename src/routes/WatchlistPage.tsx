import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/common/EmptyState";
import { WatchlistItemCard } from "../components/watchlist/WatchlistItemCard";
import { WatchlistTabs } from "../components/watchlist/WatchlistTabs";
import { useWatchlist } from "../context/WatchlistContext";
import type { WatchlistStatus } from "../types/watchlist";

const EMPTY_MESSAGE: Record<WatchlistStatus, string> = {
  planned: "Du har ikke lagt til noe du planlegger å se ennå.",
  watched: "Du har ikke merket noe som sett ennå.",
};

const searchLink = (
  <Link
    to="/"
    className="rounded bg-slate-800 px-4 py-2 font-medium text-white hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800"
  >
    Søk etter titler
  </Link>
);

/**
 * Watchlist-siden (se docs/design.md#watchlist-ux): to faner ("Planlagt" /
 * "Sett") som filtrerer `WatchlistItem`-listen på status, med egen
 * tom-tilstand per fane.
 */
export function WatchlistPage() {
  const { items } = useWatchlist();
  const [activeTab, setActiveTab] = useState<WatchlistStatus>("planned");

  const planned = items.filter((item) => item.status === "planned");
  const watched = items.filter((item) => item.status === "watched");
  const visibleItems = activeTab === "planned" ? planned : watched;

  return (
    <section>
      <h1 className="text-2xl font-bold">Watchlist</h1>

      <div className="mt-4">
        <WatchlistTabs
          active={activeTab}
          onChange={setActiveTab}
          plannedCount={planned.length}
          watchedCount={watched.length}
        />
      </div>

      <div className="mt-6">
        {visibleItems.length === 0 ? (
          <EmptyState message={EMPTY_MESSAGE[activeTab]} action={searchLink} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {visibleItems.map((item) => (
              <WatchlistItemCard key={item.mediaId} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
