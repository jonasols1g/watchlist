import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WatchlistProvider } from "../../context/WatchlistContext";
import { createMediaSummary } from "../../test/fixtures/media.fixtures";
import { createMockWatchlistStorage } from "../../test/mocks/createMockWatchlistStorage";
import { SearchResultCard } from "./SearchResultCard";

function renderCard(media: ReturnType<typeof createMediaSummary>) {
  return render(
    <WatchlistProvider storage={createMockWatchlistStorage()} userId={null}>
      <MemoryRouter>
        <SearchResultCard media={media} />
      </MemoryRouter>
    </WatchlistProvider>,
  );
}

describe("SearchResultCard", () => {
  it("viser tittel, år og type, og lenker til detaljsiden", () => {
    const media = createMediaSummary({
      id: "mock-movie-1",
      title: "The Matrix",
      releaseYear: 1999,
      mediaType: "movie",
    });

    renderCard(media);

    expect(screen.getByText("The Matrix")).toBeInTheDocument();
    expect(screen.getByText("1999 · Film")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/title/mock-movie-1",
    );
  });

  it("viser 'Ukjent år' når releaseYear er null, og 'Serie' for serier", () => {
    const media = createMediaSummary({
      id: "mock-series-1",
      title: "The Wire",
      releaseYear: null,
      mediaType: "series",
    });

    renderCard(media);

    expect(screen.getByText("Ukjent år · Serie")).toBeInTheDocument();
  });

  it("viser plakat-placeholder når posterUrl er null", () => {
    const media = createMediaSummary({ title: "Solaris", posterUrl: null });

    renderCard(media);

    expect(
      screen.getByRole("img", {
        name: "Ingen plakat tilgjengelig for Solaris",
      }),
    ).toBeInTheDocument();
  });

  it("viser 'Legg til i watchlist' som default watchlist-handling", () => {
    const media = createMediaSummary({ id: "mock-movie-1" });

    renderCard(media);

    expect(
      screen.getByRole("button", { name: "Legg til i watchlist" }),
    ).toBeInTheDocument();
  });
});
