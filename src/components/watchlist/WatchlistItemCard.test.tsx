import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  WatchlistProvider,
  useWatchlist,
} from "../../context/WatchlistContext";
import { createMediaSummary } from "../../test/fixtures/media.fixtures";
import { createWatchlistItem } from "../../test/fixtures/watchlist.fixtures";
import type { WatchlistItem } from "../../types/watchlist";
import { DATA_KEY_PREFIX } from "../../utils/storageKeys";
import { WatchlistItemCard } from "./WatchlistItemCard";

const WATCHLIST_KEY = `${DATA_KEY_PREFIX}items`;

/** Rendrer watchlisten fra context (ikke bare fra en fast prop), slik at en
 * fjerning faktisk lar kortet forsvinne fra DOM-treet i testene under. */
function Harness() {
  const { items } = useWatchlist();
  return (
    <>
      {items.map((item) => (
        <WatchlistItemCard key={item.mediaId} item={item} />
      ))}
    </>
  );
}

function renderCard(item: WatchlistItem = createWatchlistItem()) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify([item]));
  return render(
    <WatchlistProvider>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </WatchlistProvider>,
  );
}

describe("WatchlistItemCard", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("viser tittel, år og lenke til detaljsiden", () => {
    const item = createWatchlistItem({
      mediaId: "mock-movie-1",
      media: createMediaSummary({
        id: "mock-movie-1",
        title: "The Matrix",
        releaseYear: 1999,
      }),
    });

    renderCard(item);

    expect(screen.getByText("The Matrix")).toBeInTheDocument();
    expect(screen.getByText("1999")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/title/mock-movie-1",
    );
  });

  it("viser 'Merk som sett' for en planlagt tittel", () => {
    renderCard(createWatchlistItem({ status: "planned" }));
    expect(
      screen.getByRole("button", { name: "Merk som sett" }),
    ).toBeInTheDocument();
  });

  it("viser 'Merk som planlagt' for en sett tittel", () => {
    renderCard(
      createWatchlistItem({
        status: "watched",
        watchedAt: "2026-07-01T00:00:00.000Z",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Merk som planlagt" }),
    ).toBeInTheDocument();
  });

  it("bytter status ved klikk på statusknappen", async () => {
    const user = userEvent.setup();
    renderCard(createWatchlistItem({ status: "planned" }));

    await user.click(screen.getByRole("button", { name: "Merk som sett" }));

    expect(
      screen.getByRole("button", { name: "Merk som planlagt" }),
    ).toBeInTheDocument();
  });

  it("fjerner tittelen fra watchlisten ved klikk på 'Fjern'", async () => {
    const user = userEvent.setup();
    renderCard(
      createWatchlistItem({
        media: createMediaSummary({ id: "mock-movie-1", title: "The Matrix" }),
      }),
    );

    await user.click(screen.getByRole("button", { name: "Fjern" }));

    expect(screen.queryByText("The Matrix")).not.toBeInTheDocument();
  });
});
