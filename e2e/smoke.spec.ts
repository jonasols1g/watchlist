import { expect, test } from "@playwright/test";

// Triviell røyktest: verifiserer at produksjonsbygget serveres under
// /watchlist/-understien og at appen faktisk rendrer.
test("appen laster under /watchlist/-understien", async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("link", { name: "Watchlist – gå til forsiden" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Søk" })).toBeVisible();
});
