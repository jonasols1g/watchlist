import { expect, test } from "@playwright/test";

// Verifiserer at hver rute fungerer når den lastes direkte (dyplenke) og ved
// refresh — ikke bare når man navigerer dit via klikk inne i appen. Dette er
// den mest verdifulle E2E-testen i prosjektet (se docs/dev-tasks.md fase 9):
// GitHub Pages har ingen rewrite-støtte, så build-steget kopierer
// dist/index.html til dist/404.html som SPA-fallback. Direkte-lasting og
// refresh er nettopp scenarioet der en manglende/feil fallback først slår ut
// — det oppstår aldri i `npm run dev` eller ved vanlig in-app-navigasjon, kun
// i det bygde produksjonsoppsettet (`vite preview` med `base: '/watchlist/'`,
// som denne testen — som resten av E2E-suiten — kjører mot).
test.describe("Dyplenker og refresh", () => {
  test("/ lastet direkte og etter refresh viser søkesiden", async ({
    page,
  }) => {
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "Søk" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Søk" })).toBeVisible();
  });

  test("/mylist lastet direkte og etter refresh viser watchlist-siden", async ({
    page,
  }) => {
    await page.goto("./mylist");
    await expect(
      page.getByRole("heading", { name: "Watchlist" }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Watchlist" }),
    ).toBeVisible();
  });

  test("/title/:id lastet direkte og etter refresh viser detaljsiden", async ({
    page,
  }) => {
    await page.goto("./title/mock-movie-1");
    await expect(
      page.getByRole("heading", { name: "The Matrix" }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "The Matrix" }),
    ).toBeVisible();
  });

  test("en ukjent rute lastet direkte og etter refresh viser 404-siden", async ({
    page,
  }) => {
    await page.goto("./dette-finnes-ikke");
    await expect(
      page.getByRole("heading", { name: "Siden finnes ikke" }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Siden finnes ikke" }),
    ).toBeVisible();
  });
});
