import { expect, test } from "@playwright/test";
import { registerApiStubs } from "./fixtures/apiStubs.ts";
import { registerFirebaseAuthStub } from "./fixtures/firebaseAuthStub.ts";

// Fase 10: appen kjører nå mot `CompositeMediaProvider` (ekte OMDb-/MOTN-kall)
// i stedet for `MockMediaProvider`. Dette `beforeEach`-kallet er eneste
// endring i denne filen — det kobler inn `page.route`-stubbing (se
// e2e/fixtures/apiStubs.ts) slik at testene aldri gjør ekte nettverkskall.
// Selve testene under er uendret fra fase 5.
// DB-migrering issue B: se e2e/fixtures/firebaseAuthStub.ts — alle sider
// kaller nå AuthContext ved mount, uavhengig av rute.
test.beforeEach(async ({ page }) => {
  await registerApiStubs(page);
  await registerFirebaseAuthStub(page);
});

// Søk kjører mot en stubbet OMDb (se e2e/fixtures/apiStubs.ts) — ingen ekte
// nettverkskall (se docs/dev-tasks.md fase 10).
test.describe("Søk", () => {
  test("søk gir resultater, og klikk på et kort navigerer til detaljsiden", async ({
    page,
  }) => {
    await page.goto("./");

    await page.getByLabel("Søk etter film eller serie").fill("matrix");
    await page.getByRole("button", { name: "Søk" }).click();

    const card = page.getByRole("link", { name: /The Matrix/ });
    await expect(card).toBeVisible();

    await card.click();

    await expect(page).toHaveURL(/\/title\/mock-movie-1$/);
  });

  test("søk uten treff viser tom-tilstand", async ({ page }) => {
    await page.goto("./");

    await page
      .getByLabel("Søk etter film eller serie")
      .fill("finnes-ikke-i-katalogen");
    await page.getByRole("button", { name: "Søk" }).click();

    await expect(
      page.getByText("Ingen treff. Prøv et annet søk."),
    ).toBeVisible();
  });
});
