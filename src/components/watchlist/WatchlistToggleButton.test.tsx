import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { WatchlistProvider } from "../../context/WatchlistContext";
import { createMediaSummary } from "../../test/fixtures/media.fixtures";
import { WatchlistToggleButton } from "./WatchlistToggleButton";

function renderButton(media = createMediaSummary({ id: "mock-movie-1" })) {
  return render(
    <WatchlistProvider>
      <WatchlistToggleButton media={media} />
    </WatchlistProvider>,
  );
}

describe("WatchlistToggleButton", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("viser 'Legg til i watchlist' når tittelen ikke er i watchlisten", () => {
    renderButton();
    expect(
      screen.getByRole("button", { name: "Legg til i watchlist" }),
    ).toBeInTheDocument();
  });

  it("legger til tittelen som 'Planlagt' ved klikk, og viser status + handlinger deretter", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(
      screen.getByRole("button", { name: "Legg til i watchlist" }),
    );

    expect(screen.getByText(/Planlagt/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Merk som sett" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fjern fra watchlist" }),
    ).toBeInTheDocument();
  });

  it("bytter status fra planlagt til sett", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(
      screen.getByRole("button", { name: "Legg til i watchlist" }),
    );
    await user.click(screen.getByRole("button", { name: "Merk som sett" }));

    expect(screen.getByText(/Sett/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Merk som planlagt" }),
    ).toBeInTheDocument();
  });

  it("fjerner tittelen fra watchlisten og går tilbake til 'Legg til'-knappen", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(
      screen.getByRole("button", { name: "Legg til i watchlist" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Fjern fra watchlist" }),
    );

    expect(
      screen.getByRole("button", { name: "Legg til i watchlist" }),
    ).toBeInTheDocument();
  });
});
