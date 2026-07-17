import { Link } from "react-router-dom";
import { useWatchlist } from "../../context/WatchlistContext";
import type { WatchlistItem, WatchlistStatus } from "../../types/watchlist";
import { PosterImage } from "../media/PosterImage";

export interface WatchlistItemCardProps {
  item: WatchlistItem;
}

const OTHER_STATUS_LABEL: Record<WatchlistStatus, string> = {
  planned: "Merk som sett",
  watched: "Merk som planlagt",
};

/**
 * Én oppføring i watchlisten (se docs/design.md#watchlist-ux): plakat,
 * tittel, år, samt handlinger for statusbytte og fjerning. Klikk på
 * plakat/tittel navigerer til `/title/:id`; handlingsknappene ligger
 * bevisst utenfor `<Link>`-en for å unngå nøstede interaktive elementer.
 */
export function WatchlistItemCard({ item }: WatchlistItemCardProps) {
  const { setStatus, removeFromWatchlist } = useWatchlist();
  const otherStatus: WatchlistStatus =
    item.status === "planned" ? "watched" : "planned";

  return (
    <article className="flex flex-col overflow-hidden rounded-md border border-slate-200">
      <Link
        to={`/title/${item.mediaId}`}
        className="flex flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800"
      >
        <PosterImage
          posterUrl={item.media.posterUrl}
          title={item.media.title}
          className="aspect-2/3 w-full object-cover"
        />
        <div className="flex flex-1 flex-col gap-1 p-3 pb-2">
          <span className="font-semibold">{item.media.title}</span>
          <span className="text-sm text-slate-600">
            {item.media.releaseYear ?? "Ukjent år"}
          </span>
        </div>
      </Link>
      <div className="flex flex-wrap gap-2 p-3 pt-0">
        <button
          type="button"
          onClick={() => {
            setStatus(item.mediaId, otherStatus);
          }}
          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800"
        >
          {OTHER_STATUS_LABEL[item.status]}
        </button>
        <button
          type="button"
          onClick={() => {
            removeFromWatchlist(item.mediaId);
          }}
          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800"
        >
          Fjern
        </button>
      </div>
    </article>
  );
}
