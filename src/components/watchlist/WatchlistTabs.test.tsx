import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WatchlistTabs } from "./WatchlistTabs";

describe("WatchlistTabs", () => {
  it("viser begge faner med antall, og markerer aktiv fane", () => {
    render(
      <WatchlistTabs
        active="planned"
        onChange={() => {
          // no-op
        }}
        plannedCount={3}
        watchedCount={1}
      />,
    );

    const plannedTab = screen.getByRole("tab", { name: "Planlagt (3)" });
    const watchedTab = screen.getByRole("tab", { name: "Sett (1)" });

    expect(plannedTab).toHaveAttribute("aria-selected", "true");
    expect(watchedTab).toHaveAttribute("aria-selected", "false");
  });

  it("kaller onChange med riktig status ved klikk på en fane", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <WatchlistTabs
        active="planned"
        onChange={onChange}
        plannedCount={0}
        watchedCount={0}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Sett (0)" }));

    expect(onChange).toHaveBeenCalledWith("watched");
  });
});
