import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("viser hjemsiden på /", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Søk" })).toBeInTheDocument();
  });

  it("navigerer til watchlist-siden via NavBar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: "Watchlist" }));

    expect(
      screen.getByRole("heading", { name: "Watchlist" }),
    ).toBeInTheDocument();
  });

  it("navigerer tilbake til hjemsiden via NavBar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: "Watchlist" }));
    await user.click(screen.getByRole("link", { name: "Hjem" }));

    expect(screen.getByRole("heading", { name: "Søk" })).toBeInTheDocument();
  });

  it("viser detaljplassholder med id på /title/:id", () => {
    window.history.pushState({}, "", "/title/mock-movie-1");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Tittel" })).toBeInTheDocument();
    expect(screen.getByText("mock-movie-1")).toBeInTheDocument();
  });

  it("viser 404-siden for ukjente ruter og lenker tilbake til hjem", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/ukjent-rute");
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Siden finnes ikke" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Gå til forsiden" }));

    expect(screen.getByRole("heading", { name: "Søk" })).toBeInTheDocument();
  });
});
