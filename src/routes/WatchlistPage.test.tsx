import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/testUtils";
import type { WatchlistItem } from "../types/watchlist";
import { DATA_KEY_PREFIX } from "../utils/storageKeys";
import { WatchlistPage } from "./WatchlistPage";

const WATCHLIST_KEY = `${DATA_KEY_PREFIX}items`;

function seedWatchlist(items: WatchlistItem[]) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
}

function plannedItem(id: string, title: string): WatchlistItem {
  return {
    mediaId: id,
    media: {
      id,
      mediaType: "movie",
      title,
      releaseYear: 1999,
      posterUrl: null,
    },
    status: "planned",
    addedAt: "2026-07-01T00:00:00.000Z",
  };
}

function watchedItem(id: string, title: string): WatchlistItem {
  return {
    mediaId: id,
    media: {
      id,
      mediaType: "series",
      title,
      releaseYear: 2002,
      posterUrl: null,
    },
    status: "watched",
    addedAt: "2026-07-01T00:00:00.000Z",
    watchedAt: "2026-07-05T00:00:00.000Z",
  };
}

describe("WatchlistPage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("viser tom-tilstand for 'Planlagt' når watchlisten er tom", () => {
    renderWithProviders(<WatchlistPage />);

    expect(
      screen.getByText("Du har ikke lagt til noe du planlegger å se ennå."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Søk etter titler" }),
    ).toBeInTheDocument();
  });

  it("viser planlagte titler under 'Planlagt'-fanen som standard", () => {
    seedWatchlist([
      plannedItem("mock-movie-1", "The Matrix"),
      watchedItem("mock-series-1", "The Wire"),
    ]);

    renderWithProviders(<WatchlistPage />);

    expect(screen.getByText("The Matrix")).toBeInTheDocument();
    expect(screen.queryByText("The Wire")).not.toBeInTheDocument();
  });

  it("bytter til 'Sett'-fanen og viser sette titler, med tom-tilstand når den fanen er tom", async () => {
    const user = userEvent.setup();
    seedWatchlist([plannedItem("mock-movie-1", "The Matrix")]);

    renderWithProviders(<WatchlistPage />);

    await user.click(screen.getByRole("tab", { name: "Sett (0)" }));

    expect(
      screen.getByText("Du har ikke merket noe som sett ennå."),
    ).toBeInTheDocument();
    expect(screen.queryByText("The Matrix")).not.toBeInTheDocument();
  });

  it("viser fane-tellere som reflekterer antall planlagte og sette titler", () => {
    seedWatchlist([
      plannedItem("mock-movie-1", "The Matrix"),
      plannedItem("mock-movie-2", "Oppenheimer"),
      watchedItem("mock-series-1", "The Wire"),
    ]);

    renderWithProviders(<WatchlistPage />);

    expect(
      screen.getByRole("tab", { name: "Planlagt (2)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sett (1)" })).toBeInTheDocument();
  });
});
