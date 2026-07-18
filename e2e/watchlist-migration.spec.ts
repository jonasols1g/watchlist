import { expect, test } from "@playwright/test";
import { registerApiStubs } from "./fixtures/apiStubs.ts";
import { registerFirebaseAuthStub } from "./fixtures/firebaseAuthStub.ts";
import { registerFirestoreStub } from "./fixtures/firestoreStub.ts";

/**
 * DB-migrering issue D — se
 * docs/plans/watchlist-database-migrering.md#migrering-av-eksisterende-
 * localstorage-data.
 *
 * Nøkkelen under gjenskaper det versjonerte data-navnerommet fra
 * src/utils/storageKeys.ts (`DATA_KEY_PREFIX = "watchlist:v2:data:"`) — som
 * en literal, ikke en import fra `src/`, i tråd med den etablerte stilen i
 * denne mappen (se f.eks. mock-ID-ene i apiStubs.ts).
 */
const WATCHLIST_STORAGE_KEY = "watchlist:v2:data:items";
const MIGRATED_FLAG_KEY = "watchlist:v2:data:migratedToCloud";

const PRE_EXISTING_LOCAL_ITEM = {
  mediaId: "tt1375666",
  media: {
    id: "tt1375666",
    mediaType: "movie",
    title: "Inception",
    releaseYear: 2010,
    posterUrl: "https://images.example.com/posters/inception.jpg",
  },
  status: "planned",
  addedAt: "2026-01-01T00:00:00.000Z",
};

test.describe("Migrering av eksisterende localStorage-watchlist til Firestore", () => {
  test("en forhåndsseedet lokal watchlist migreres til Firestore ved første app-load, uten å forsvinne fra UI-et, migreringsflagget hindrer ny opplasting ved reload, og elementet er faktisk lagret server-side", async ({
    page,
    browser,
  }) => {
    // `page.addInitScript` kjører før noe av appens egen kode, på *hver*
    // navigasjon i denne `page`-instansen (inkludert `page.reload()`) —
    // simulerer en ekte bruker med en watchlist fra før denne funksjonen
    // fantes, klar i localStorage før den aller første
    // Firestore-tilkoblingen. Migreringen lar `localStorage` stå urørt (se
    // `migrateLocalWatchlistToCloud.ts`), så det er harmløst at scriptet
    // også kjører på reload-steget under — samme, allerede migrerte, verdi
    // settes bare på nytt.
    await page.addInitScript(
      ([key, value]) => {
        window.localStorage.setItem(key as string, value as string);
      },
      [WATCHLIST_STORAGE_KEY, JSON.stringify([PRE_EXISTING_LOCAL_ITEM])],
    );

    await registerApiStubs(page);
    await registerFirebaseAuthStub(page);
    const documents = await registerFirestoreStub(page);

    let commitRequestCount = 0;
    page.on("request", (request) => {
      if (request.url().includes(":commit")) {
        commitRequestCount += 1;
      }
    });

    await page.goto("./mylist");

    // Elementet vises umiddelbart fra den lokale skriveputten (ingen
    // "forsvinner så kommer tilbake"-blink) mens migreringen til Firestore
    // skjer i bakgrunnen.
    await expect(page.getByText("Inception")).toBeVisible();

    // Migreringsflagget settes kun etter en bekreftet vellykket opplasting.
    await expect
      .poll(() =>
        page.evaluate(
          (key) => window.localStorage.getItem(key),
          MIGRATED_FLAG_KEY,
        ),
      )
      .not.toBeNull();

    expect(commitRequestCount).toBe(1);

    // Reload på samme "enhet": localStorage (elementet + flagget) er urørt
    // av selve migreringen (som aldri skriver til localStorage) og
    // gjenskapes uansett av addInitScript over — migreringsflagget hindrer
    // likevel en ny opplasting. Ingen nye `:commit`-kall.
    await page.reload();
    await expect(page.getByText("Inception")).toBeVisible();
    expect(commitRequestCount).toBe(1);

    // Beviser at elementet faktisk endte i Firestore (den delte, stubbede
    // "databasen"), ikke bare i den lokale skriveputten på denne siden: en
    // helt ny BrowserContext (egen, tom localStorage/IndexedDB — modellerer
    // en annen enhet/fane) kobles mot *samme* `documents`-kart i
    // firestoreStub.ts. Uten noen lokal watchlist i det hele tatt må
    // tittelen her komme fra Firestore-hentingen alene.
    const otherContext = await browser.newContext();
    try {
      const otherPage = await otherContext.newPage();
      await registerApiStubs(otherPage);
      await registerFirebaseAuthStub(otherPage);
      await registerFirestoreStub(otherPage, documents);

      await otherPage.goto("./mylist");
      await expect(otherPage.getByText("Inception")).toBeVisible();
    } finally {
      await otherContext.close();
    }
  });
});
