import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchBar } from "./SearchBar";

describe("SearchBar", () => {
  it("kaller onSubmit med trimmet query ved klikk på søkeknappen", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SearchBar onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText("Søk etter film eller serie"),
      "  the matrix  ",
    );
    await user.click(screen.getByRole("button", { name: "Søk" }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("the matrix");
  });

  it("kaller onSubmit ved Enter i feltet", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SearchBar onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText("Søk etter film eller serie"),
      "severance{Enter}",
    );

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("severance");
  });

  it("søker ikke mens man skriver — kun ved submit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SearchBar onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText("Søk etter film eller serie"),
      "matrix",
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("kaller ikke onSubmit for et tomt/blankt søk", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SearchBar onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Søk etter film eller serie"), "   ");
    await user.click(screen.getByRole("button", { name: "Søk" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([{ centered: true }, { centered: false }])(
    "plasserer søkeknappen og trailingAction fast nederst i viewporten, rett over NavBar, uansett centered=$centered (issue #28)",
    ({ centered }) => {
      render(
        <SearchBar
          onSubmit={vi.fn()}
          centered={centered}
          trailingAction={<button type="button">Mikrofon</button>}
        />,
      );

      const button = screen.getByRole("button", { name: "Søk" });
      const trailingAction = screen.getByRole("button", { name: "Mikrofon" });
      const buttonRow = button.parentElement;
      const fixedContainer = buttonRow?.parentElement;

      // Både søkeknappen og trailingAction (mikrofonknappen) skal ligge i
      // samme faste bunn-rad — se docs/design.md#søkeflyt-tekst-og-tale.
      expect(buttonRow).toContainElement(trailingAction);
      expect(fixedContainer?.className).toContain("fixed");
      expect(fixedContainer?.className).toContain("bottom-[78px]");
    },
  );
});
