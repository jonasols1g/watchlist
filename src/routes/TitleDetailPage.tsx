import { useParams } from "react-router-dom";
import { ErrorMessage } from "../components/common/ErrorMessage";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { GenreTags } from "../components/media/GenreTags";
import { PosterImage } from "../components/media/PosterImage";
import { RatingsBadge } from "../components/media/RatingsBadge";
import { StreamingProvidersList } from "../components/media/StreamingProvidersList";
import { WatchlistToggleButton } from "../components/watchlist/WatchlistToggleButton";
import { useMediaDetails } from "../hooks/useMediaDetails";
import type { Media, MediaType, SeriesMedia } from "../types/media";

const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  movie: "Film",
  series: "Serie",
};

const SERIES_STATUS_LABEL: Record<
  NonNullable<SeriesMedia["status"]>,
  string
> = {
  ongoing: "Pågår",
  ended: "Avsluttet",
  canceled: "Kansellert",
  unknown: "Ukjent status",
};

function buildMetaLine(media: Media): string {
  const parts: string[] = [MEDIA_TYPE_LABEL[media.mediaType]];

  if (media.releaseYear !== null) {
    parts.push(String(media.releaseYear));
  }

  if (media.mediaType === "movie") {
    if (media.runtimeMinutes !== null && media.runtimeMinutes !== undefined) {
      parts.push(`${media.runtimeMinutes} min`);
    }
  } else {
    if (media.numberOfSeasons !== null && media.numberOfSeasons !== undefined) {
      const label = media.numberOfSeasons === 1 ? "sesong" : "sesonger";
      parts.push(`${media.numberOfSeasons} ${label}`);
    }
    if (media.status !== undefined) {
      parts.push(SERIES_STATUS_LABEL[media.status]);
    }
  }

  return parts.join(" · ");
}

/**
 * Detaljside for én tittel (se docs/design.md#detaljvisning). Rekkefølgen på
 * feltene følger dokumentasjonen: plakat/tittel, beskrivelse, sjangre,
 * rating, strømmetjenester, watchlist-toggle.
 */
export function TitleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { status, media, errorCode, retry } = useMediaDetails(id);

  if (id === undefined) {
    return <ErrorMessage code="not-found" />;
  }

  return (
    <section>
      {status === "loading" && <LoadingSpinner label="Laster tittel …" />}

      {status === "error" && errorCode !== null && (
        <ErrorMessage code={errorCode} onRetry={retry} />
      )}

      {status === "success" && media && (
        <article className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <PosterImage
              posterUrl={media.posterUrl}
              title={media.title}
              className="aspect-2/3 w-full max-w-60 self-start rounded-md object-cover"
            />
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold">{media.title}</h1>
              {media.originalTitle !== undefined &&
                media.originalTitle !== media.title && (
                  <p className="text-slate-500 italic">{media.originalTitle}</p>
                )}
              <p className="text-slate-600">{buildMetaLine(media)}</p>
            </div>
          </div>

          <p>{media.overview}</p>

          <GenreTags genres={media.genres} />

          <RatingsBadge ratings={media.ratings} />

          <StreamingProvidersList streaming={media.streaming} />

          <WatchlistToggleButton media={media} />
        </article>
      )}
    </section>
  );
}
