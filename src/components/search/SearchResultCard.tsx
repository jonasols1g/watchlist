import { Link } from "react-router-dom";
import { WatchlistToggleButton } from "../watchlist/WatchlistToggleButton";
import { PosterImage } from "../media/PosterImage";
import type { MediaSummary } from "../../types/media";

export interface SearchResultCardProps {
  media: MediaSummary;
}

const MEDIA_TYPE_LABEL: Record<MediaSummary["mediaType"], string> = {
  movie: "Film",
  series: "Serie",
};

/**
 * Ett treff i søkeresultat-grid (se docs/design.md#visning-av-søkeresultater):
 * plakat, tittel, utgivelsesår, type og watchlist-toggle. Klikk på
 * plakat/tittel navigerer til `/title/:id`. Strømmetilgjengelighet vises
 * bevisst ikke her — den hentes først på detaljsiden.
 *
 * `WatchlistToggleButton` ligger bevisst utenfor `<Link>`-en: nøstede
 * interaktive elementer (knapp inne i lenke) er ugyldig HTML og ville gjort
 * at klikk på knappen også trigget navigasjon.
 */
export function SearchResultCard({ media }: SearchResultCardProps) {
  return (
    <article className="flex flex-col overflow-hidden rounded-md border border-slate-200 transition hover:shadow-md">
      <Link
        to={`/title/${media.id}`}
        className="flex flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800"
      >
        <PosterImage
          posterUrl={media.posterUrl}
          title={media.title}
          className="aspect-2/3 w-full object-cover"
        />
        <div className="flex flex-1 flex-col gap-1 p-3 pb-2">
          <span className="font-semibold">{media.title}</span>
          <span className="text-sm text-slate-600">
            {media.releaseYear ?? "Ukjent år"} ·{" "}
            {MEDIA_TYPE_LABEL[media.mediaType]}
          </span>
        </div>
      </Link>
      <div className="p-3 pt-0">
        <WatchlistToggleButton media={media} />
      </div>
    </article>
  );
}
