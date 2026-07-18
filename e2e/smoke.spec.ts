import { expect, test } from "@playwright/test";
import { registerFirebaseAuthStub } from "./fixtures/firebaseAuthStub.ts";

// Triviell røyktest: verifiserer at produksjonsbygget serveres under
// /watchlist/-understien og at appen faktisk rendrer.
// DB-migrering issue B: `AuthContext` kaller `signInAnonymously` ved mount
// på enhver side — uten denne stubben ville denne testen (som ikke bruker
// registerApiStubs) gjort et ekte Firebase-kall (se
// e2e/fixtures/firebaseAuthStub.ts for detaljer og hvorfor).
test.beforeEach(async ({ page }) => {
  await registerFirebaseAuthStub(page);
});

test("appen laster under /watchlist/-understien", async ({ page }) => {
  await page.goto("./");
  // NavBar (fase 11, CineFind-temaet) er en bunn-fanebar uten eget
  // logo-lenkeelement — "Søk"-fanen (lenke til "/") er den nærmeste
  // erstatningen for den gamle wordmark-lenken denne testen sjekket.
  await expect(page.getByRole("link", { name: "Søk" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Søk" })).toBeVisible();
});
