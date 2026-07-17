import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WatchlistProvider } from "../../context/WatchlistContext";
import { createMediaSummary } from "../../test/fixtures/media.fixtures";
import { SearchResultsGrid } from "./SearchResultsGrid";

describe("SearchResultsGrid", () => {
  it("viser ett kort per treff", () => {
    const results = [
      createMediaSummary({ id: "mock-movie-1", title: "The Matrix" }),
      createMediaSummary({ id: "mock-movie-2", title: "Solaris" }),
    ];

    render(
      <WatchlistProvider>
        <MemoryRouter>
          <SearchResultsGrid results={results} />
        </MemoryRouter>
      </WatchlistProvider>,
    );

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("The Matrix")).toBeInTheDocument();
    expect(screen.getByText("Solaris")).toBeInTheDocument();
  });

  it("viser en tom liste uten treff", () => {
    render(
      <WatchlistProvider>
        <MemoryRouter>
          <SearchResultsGrid results={[]} />
        </MemoryRouter>
      </WatchlistProvider>,
    );

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
