import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMockFeedbackStorage } from "../test/mocks/createMockFeedbackStorage";
import { FeedbackPage } from "./FeedbackPage";

// `FeedbackPage` importerer den app-brede `feedbackStorage`-sammensetnings-
// roten (`services/storage`) som default for `storage`-propen — den kjeden
// initialiserer ekte Firebase-klienter på modulnivå
// (`services/auth/firebaseClient.ts`, `getAuth(firebaseApp)`), som kaster
// synkront uten ekte `VITE_FIREBASE_*` i miljøet (som i CI/Vitest). Denne
// testfila injiserer alltid en eksplisitt `storage`-prop (`createMockFeedbackStorage`),
// så defaulten brukes aldri reelt — modulen mockes likevel bort for at
// import-kjeden ikke skal krasje, samme mønster som `App.test.tsx`.
vi.mock("../services/storage", () => ({ feedbackStorage: {} }));

describe("FeedbackPage", () => {
  it("submit-knappen er disabled uten tekst og score", () => {
    render(<FeedbackPage storage={createMockFeedbackStorage()} />);

    expect(screen.getByRole("button", { name: "Send inn" })).toBeDisabled();
  });

  it("viser tydelige valideringshint for manglende tekst og manglende score", () => {
    render(<FeedbackPage storage={createMockFeedbackStorage()} />);

    expect(
      screen.getByText("Skriv en tilbakemelding før du sender inn."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Velg en score fra 1 til 5."),
    ).toBeInTheDocument();
  });

  it("submit-knappen forblir disabled når kun tekst er fylt ut", async () => {
    const user = userEvent.setup();
    render(<FeedbackPage storage={createMockFeedbackStorage()} />);

    await user.type(
      screen.getByLabelText("Tilbakemelding"),
      "Dette er en tilbakemelding",
    );

    expect(screen.getByRole("button", { name: "Send inn" })).toBeDisabled();
    expect(
      screen.getByText("Velg en score fra 1 til 5."),
    ).toBeInTheDocument();
  });

  it("submit-knappen forblir disabled når kun score er valgt", async () => {
    const user = userEvent.setup();
    render(<FeedbackPage storage={createMockFeedbackStorage()} />);

    await user.click(screen.getByRole("radio", { name: "5 av 5" }));

    expect(screen.getByRole("button", { name: "Send inn" })).toBeDisabled();
    expect(
      screen.getByText("Skriv en tilbakemelding før du sender inn."),
    ).toBeInTheDocument();
  });

  it("sender inn trimmet tekst + score, viser bekreftelse og nullstiller skjemaet", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const storage = createMockFeedbackStorage({ submit });
    const user = userEvent.setup();
    render(<FeedbackPage storage={storage} />);

    await user.type(
      screen.getByLabelText("Tilbakemelding"),
      "  Veldig bra app!  ",
    );
    await user.click(screen.getByRole("radio", { name: "5 av 5" }));

    const submitButton = screen.getByRole("button", { name: "Send inn" });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(submit).toHaveBeenCalledExactlyOnceWith({
      text: "Veldig bra app!",
      score: 5,
    });
    expect(
      await screen.findByText("Takk for tilbakemeldingen!"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Tilbakemelding")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send inn" })).toBeDisabled();
  });

  it("viser feilbanner når innsending feiler, og lar brukeren lukke den", async () => {
    const storage = createMockFeedbackStorage({
      submit: vi.fn().mockRejectedValue(new Error("network")),
    });
    const user = userEvent.setup();
    render(<FeedbackPage storage={storage} />);

    await user.type(screen.getByLabelText("Tilbakemelding"), "Feiler");
    await user.click(screen.getByRole("radio", { name: "2 av 5" }));
    await user.click(screen.getByRole("button", { name: "Send inn" }));

    expect(
      await screen.findByText("Tilbakemeldingen ble ikke sendt inn."),
    ).toBeInTheDocument();
    // Skjemaet nullstilles IKKE ved feil, slik at brukeren ikke mister det de skrev.
    expect(screen.getByLabelText("Tilbakemelding")).toHaveValue("Feiler");

    await user.click(screen.getByRole("button", { name: "Lukk" }));

    expect(
      screen.queryByText("Tilbakemeldingen ble ikke sendt inn."),
    ).not.toBeInTheDocument();
  });
});
