import { expect, test } from "@playwright/test";
import { registerApiStubs } from "./fixtures/apiStubs.ts";
import { registerFirebaseAuthStub } from "./fixtures/firebaseAuthStub.ts";
import { registerFirestoreStub } from "./fixtures/firestoreStub.ts";

// Fase 10: se e2e/search.spec.ts for hvorfor dette `beforeEach`-kallet er
// eneste endring i denne filen (kobler inn page.route-stubbing av
// OMDb/MOTN, selve testen er uendret fra fase 7).
// DB-migrering issue B/C: se e2e/fixtures/firebaseAuthStub.ts og
// e2e/fixtures/firestoreStub.ts — alle sider kaller nå AuthContext og
// WatchlistContext (Firestore-hydrering/write-through) ved mount.
test.beforeEach(async ({ page }) => {
  await registerApiStubs(page);
  await registerFirebaseAuthStub(page);
  await registerFirestoreStub(page);
});

// Watchlist kjører mot en stubbet OMDb (se e2e/fixtures/apiStubs.ts) og
// persisterer både til ekte `localStorage` i nettleseren og til den
// stubbede, statefulle Firestore-"databasen" i
// e2e/fixtures/firestoreStub.ts (DB-migrering issue C) — persistens over en
// sideoppdatering er nettopp det enhetstester ikke fanger, og hovedgrunnen
// til at denne E2E-testen er verdt det. Siden Firestore-stubben er
// stateful, beviser `page.reload()`-steget under at Firestore-hydreringen
// (ikke bare `localStorage`) faktisk gjenoppretter riktig tilstand.
test.describe("Watchlist", () => {
  test("legg til fra søkeresultat, tittelen vises under «Planlagt», bytt status til «Sett», og statusen overlever page.reload()", async ({
    page,
  }) => {
    await page.goto("./");

    await page.getByLabel("Søk etter film eller serie").fill("matrix");
    await page.getByRole("button", { name: "Søk" }).click();

    await expect(page.getByRole("link", { name: /The Matrix/ })).toBeVisible();
    await page.getByRole("button", { name: "Legg til i watchlist" }).click();

    // Søkeresultat-kortet viser handlingene for en tittel som allerede er i
    // watchlisten (status + fjern), ikke lenger "Legg til"-knappen.
    await expect(page.getByText("I watchlisten – Planlagt")).toBeVisible();

    await page.getByRole("link", { name: "Watchlist", exact: true }).click();
    await expect(page).toHaveURL(/\/mylist$/);

    // "Planlagt" er standardfanen, og tittelen skal ligge der.
    await expect(
      page.getByRole("tab", { name: "Planlagt (1)" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("The Matrix")).toBeVisible();

    await page.getByRole("button", { name: "Merk som sett" }).click();

    await expect(page.getByRole("tab", { name: "Planlagt (0)" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Sett (1)" })).toBeVisible();

    await page.reload();

    // Status er beholdt etter reload (persistert i localStorage): tittelen
    // ligger fortsatt under "Sett", ikke tilbake under "Planlagt".
    await expect(page.getByRole("tab", { name: "Planlagt (0)" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Sett (1)" })).toBeVisible();

    await page.getByRole("tab", { name: "Sett (1)" }).click();
    await expect(page.getByText("The Matrix")).toBeVisible();
  });
});
