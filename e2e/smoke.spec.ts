import { expect, test } from "@playwright/test";
import { registerFirebaseAuthStub } from "./fixtures/firebaseAuthStub.ts";
import { registerFirestoreStub } from "./fixtures/firestoreStub.ts";

// Triviell røyktest: verifiserer at produksjonsbygget serveres under
// /streamie/-understien og at appen faktisk rendrer.
// DB-migrering issue B: `AuthContext` kaller `signInAnonymously` ved mount
// på enhver side — uten denne stubben ville denne testen (som ikke bruker
// registerApiStubs) gjort et ekte Firebase-kall (se
// e2e/fixtures/firebaseAuthStub.ts for detaljer og hvorfor).
// DB-migrering issue C: `WatchlistContext` henter watchlisten fra Firestore
// ved mount på samme måte, uavhengig av side (se
// e2e/fixtures/firestoreStub.ts).
test.beforeEach(async ({ page }) => {
  await registerFirebaseAuthStub(page);
  await registerFirestoreStub(page);
});

test("appen laster under /streamie/-understien", async ({ page }) => {
  await page.goto("./");
  // NavBar (fase 11, CineFind-temaet) er en bunn-fanebar uten eget
  // logo-lenkeelement — "Søk"-fanen (lenke til "/") er den nærmeste
  // erstatningen for den gamle wordmark-lenken denne testen sjekket.
  await expect(page.getByRole("link", { name: "Søk" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Søk" })).toBeVisible();
});
