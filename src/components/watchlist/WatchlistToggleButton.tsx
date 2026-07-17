import { useWatchlist } from "../../context/WatchlistContext";
import type { MediaSummary } from "../../types/media";
import type { WatchlistStatus } from "../../types/watchlist";

export interface WatchlistToggleButtonProps {
  media: MediaSummary;
  className?: string;
}

const STATUS_LABEL: Record<WatchlistStatus, string> = {
  planned: "Planlagt",
  watched: "Sett",
};

const buttonClassName =
  "rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800";

const primaryButtonClassName =
  "rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800";

/**
 * Legg til/fjern/bytt status for én tittel i watchlisten (se
 * docs/design.md#detaljvisning punkt 6). Brukes både på
 * `SearchResultCard` og `TitleDetailPage`. Må ikke rendres inne i et
 * navigerende element (`<Link>`/`<a>`) uten at klikk stoppes fra å boble —
 * se kortkomponentene for hvordan de unngår nøstede interaktive elementer.
 */
export function WatchlistToggleButton({
  media,
  className,
}: WatchlistToggleButtonProps) {
  const { addToWatchlist, removeFromWatchlist, setStatus, getStatus } =
    useWatchlist();
  const status = getStatus(media.id);

  if (status === null) {
    return (
      <button
        type="button"
        onClick={() => {
          addToWatchlist(media);
        }}
        className={`${primaryButtonClassName} ${className ?? ""}`}
      >
        Legg til i watchlist
      </button>
    );
  }

  const otherStatus: WatchlistStatus =
    status === "planned" ? "watched" : "planned";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <span className="text-sm text-slate-600">
        I watchlisten – {STATUS_LABEL[status]}
      </span>
      <button
        type="button"
        onClick={() => {
          setStatus(media.id, otherStatus);
        }}
        className={buttonClassName}
      >
        Merk som {STATUS_LABEL[otherStatus].toLowerCase()}
      </button>
      <button
        type="button"
        onClick={() => {
          removeFromWatchlist(media.id);
        }}
        className={buttonClassName}
      >
        Fjern fra watchlist
      </button>
    </div>
  );
}
