import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("rendrer appoverskriften", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Watchlist" }),
    ).toBeInTheDocument();
  });
});
