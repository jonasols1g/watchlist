import { describe, expect, it } from "vitest";
import { normalizeQuery } from "./normalizeQuery";

describe("normalizeQuery", () => {
  it("trimmer ledende og etterfølgende whitespace", () => {
    expect(normalizeQuery("  the matrix  ")).toBe("the matrix");
  });

  it("gjør query lowercase", () => {
    expect(normalizeQuery("The MATRIX")).toBe("the matrix");
  });

  it("kollapser all intern whitespace til enkelt mellomrom", () => {
    expect(normalizeQuery("the \t matrix\n\nreloaded")).toBe(
      "the matrix reloaded",
    );
  });

  it("er idempotent", () => {
    const once = normalizeQuery("  The  MATRIX ");
    expect(normalizeQuery(once)).toBe(once);
  });

  it("gir tom streng for query med kun whitespace", () => {
    expect(normalizeQuery("   \t\n")).toBe("");
  });
});
