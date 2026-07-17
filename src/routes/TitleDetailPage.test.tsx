import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  MediaProviderError,
  type MediaProvider,
} from "../services/media/MediaProvider";
import {
  createMovieMedia,
  createSeriesMedia,
} from "../test/fixtures/media.fixtures";
import { createMockMediaProvider } from "../test/mocks/createMockMediaProvider";
import { renderWithProviders } from "../test/testUtils";
import { TitleDetailPage } from "./TitleDetailPage";

/** Ruten leser `id` fra URL-en via `useParams`, så testene må rendre
 * gjennom en faktisk `<Route path="/title/:id">` for at hooken skal få en
 * id (se docs/architecture.md#routing). */
function renderTitleDetailPage(
  provider: MediaProvider,
  route: `/title/${string}`,
) {
  return renderWithProviders(
    <Routes>
      <Route path="/title/:id" element={<TitleDetailPage />} />
    </Routes>,
    { provider, route },
  );
}

describe("TitleDetailPage", () => {
  it("viser en lasteindikator mens detaljer hentes", () => {
    const provider = createMockMediaProvider({
      getDetails: vi.fn<MediaProvider["getDetails"]>().mockImplementation(
        () =>
          new Promise(() => {
            // løses aldri i denne testen
          }),
      ),
    });

    renderTitleDetailPage(provider, "/title/mock-movie-1");

    expect(screen.getByRole("status")).toHaveTextContent("Laster tittel …");
  });

  it("viser alle felt fra en film-fixture korrekt, inkludert manglende RT-score og plakat", async () => {
    const media = createMovieMedia({
      id: "mock-movie-2",
      title: "Solaris",
      originalTitle: "Солярис",
      posterUrl: null,
      releaseYear: 1972,
      overview: "En psykolog sendes til en romstasjon.",
      genres: ["Drama", "Mystery", "Sci-Fi"],
      ratings: { imdbScore: 8.0, rottenTomatoesScore: null },
      runtimeMinutes: 167,
      streaming: null,
    });
    const provider = createMockMediaProvider({
      getDetails: vi.fn<MediaProvider["getDetails"]>().mockResolvedValue(media),
    });

    renderTitleDetailPage(provider, "/title/mock-movie-2");

    expect(await screen.findByText("Solaris")).toBeInTheDocument();
    expect(screen.getByText("Солярис")).toBeInTheDocument();
    expect(
      screen.getByText("En psykolog sendes til en romstasjon."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Film · 1972 · 167 min/)).toBeInTheDocument();
    expect(screen.getByText("Drama")).toBeInTheDocument();
    expect(screen.getByText("Mystery")).toBeInTheDocument();
    expect(screen.getByText("Sci-Fi")).toBeInTheDocument();
    expect(screen.getByText("8/10")).toBeInTheDocument();
    expect(screen.getByText("Ikke tilgjengelig")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Ingen plakat tilgjengelig for Solaris",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ingen strømmetjenester funnet for din region"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Legg til i watchlist" }),
    ).toBeInTheDocument();
  });

  it("viser alle felt fra en serie-fixture korrekt, inkludert strømmetilbud", async () => {
    const media = createSeriesMedia({
      id: "mock-series-1",
      title: "The Wire",
      numberOfSeasons: 5,
      status: "ended",
    });
    const provider = createMockMediaProvider({
      getDetails: vi.fn<MediaProvider["getDetails"]>().mockResolvedValue(media),
    });

    renderTitleDetailPage(provider, "/title/mock-series-1");

    expect(await screen.findByText("The Wire")).toBeInTheDocument();
    expect(
      screen.getByText(/Serie · 2002 · 5 sesonger · Avsluttet/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /HBO Max/ })).toBeInTheDocument();
  });

  it("viser feilmelding med «prøv igjen» ved en MediaProviderError, og prøver på nytt", async () => {
    const media = createMovieMedia({ title: "The Matrix" });
    const getDetails = vi
      .fn<MediaProvider["getDetails"]>()
      .mockRejectedValueOnce(new MediaProviderError("Nede", "network"))
      .mockResolvedValueOnce(media);
    const provider = createMockMediaProvider({ getDetails });

    renderTitleDetailPage(provider, "/title/mock-movie-1");

    expect(
      await screen.findByText(
        "Kunne ikke kontakte tjenesten — sjekk nettverket og prøv igjen",
      ),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Prøv igjen" }));

    expect(await screen.findByText("The Matrix")).toBeInTheDocument();
    await waitFor(() => {
      expect(getDetails).toHaveBeenCalledTimes(2);
    });
  });
});
