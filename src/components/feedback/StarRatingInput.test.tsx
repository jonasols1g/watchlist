import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StarRatingInput } from "./StarRatingInput";

describe("StarRatingInput", () => {
  it("rendrer fem radioknapper med riktig aria-checked-status", () => {
    render(<StarRatingInput value={3} onChange={vi.fn()} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(radios[2]).toHaveAttribute("aria-checked", "true");
    expect(radios[0]).toHaveAttribute("aria-checked", "false");
    expect(radios[4]).toHaveAttribute("aria-checked", "false");
  });

  it("ingen knapp er valgt når value er null", () => {
    render(<StarRatingInput value={null} onChange={vi.fn()} />);

    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveAttribute("aria-checked", "false");
    }
  });

  it("kaller onChange med valgt score ved klikk", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StarRatingInput value={null} onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "4 av 5" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(4);
  });

  it("er en radiogroup med aria-label 'Score'", () => {
    render(<StarRatingInput value={null} onChange={vi.fn()} />);

    expect(screen.getByRole("radiogroup", { name: "Score" })).toBeInTheDocument();
  });
});
