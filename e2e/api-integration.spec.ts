import { expect, test } from "@playwright/test";
import {
  NO_RT_SCORE_ID,
  registerApiStubs,
  registerOmdbRateLimitStub,
  THE_MATRIX_ID,
} from "./fixtures/apiStubs.ts";
import { registerFirebaseAuthStub } from "./fixtures/firebaseAuthStub.ts";

// Dekker fase 10s egne E2E-krav (docs/dev-tasks.md): scenarioer som er
// spesifikke for den ekte OMDb-/MOTN-integrasjonen, og som derfor ikke
// fantes i fase 5/7/9s spec-er. Se e2e/fixtures/apiStubs.ts for
// stub-dataene.
test.describe("Ekte API-integrasjon (stubbet)", () => {
  // DB-migrering issue B: se e2e/fixtures/firebaseAuthStub.ts — uten denne
  // ville hver test gjort et ekte Firebase Anonymous Auth-kall.
  test.beforeEach(async ({ page }) => {
    await registerFirebaseAuthStub(page);
  });

  test("detaljside med MOTN-404 rendres komplett på OMDb-data, med tom strømme-tilstand", async ({
    page,
  }) => {
    await registerApiStubs(page);

    await page.goto(`./title/${THE_MATRIX_ID}`);

    await expect(
      page.getByRole("heading", { name: "The Matrix" }),
    ).toBeVisible();
    await expect(page.getByText("8.7/10")).toBeVisible();
    await expect(
      page.getByText("Ingen strømmetjenester funnet for din region"),
    ).toBeVisible();
  });

  test("detaljside uten Rotten Tomatoes-score viser «Ikke tilgjengelig»", async ({
    page,
  }) => {
    await registerApiStubs(page);

    await page.goto(`./title/${NO_RT_SCORE_ID}`);

    await expect(page.getByRole("heading", { name: "Solaris" })).toBeVisible();
    await expect(page.getByText("Ikke tilgjengelig")).toBeVisible();
  });

  test("OMDb 429 viser rate-limit-feilmelding med «prøv igjen»-handling", async ({
    page,
  }) => {
    await registerOmdbRateLimitStub(page);

    await page.goto("./");
    await page.getByLabel("Søk etter film eller serie").fill("matrix");
    await page.getByRole("button", { name: "Søk" }).click();

    await expect(
      page.getByText("For mange forespørsler — vent litt og prøv igjen"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Prøv igjen" }),
    ).toBeVisible();
  });
});
