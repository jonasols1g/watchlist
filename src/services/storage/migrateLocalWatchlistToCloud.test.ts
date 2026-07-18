import { afterEach, describe, expect, it, vi } from "vitest";
import { createWatchlistItem } from "../../test/fixtures/watchlist.fixtures";
import { createMockWatchlistStorage } from "../../test/mocks/createMockWatchlistStorage";
import { migrateLocalWatchlistToCloud } from "./migrateLocalWatchlistToCloud";
import {
  loadWatchlistFromStorage,
  saveWatchlistToStorage,
} from "./watchlistStorage";

describe("migrateLocalWatchlistToCloud", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("gjør ingenting når den lokale watchlisten er tom, men setter likevel migreringsflagget (engangs-sjekk, ikke gjentatt hvert app-load)", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const storage = createMockWatchlistStorage({ upsert });

    const outcome = await migrateLocalWatchlistToCloud("user-1", storage);

    expect(outcome).toEqual({ items: [], succeeded: false });
    expect(upsert).not.toHaveBeenCalled();

    // En senere lokal tilføyelse (gjennom normal `applyAction`-bruk, ikke
    // denne funksjonen) skal ikke plukkes opp av et nytt migreringsforsøk —
    // flagget er allerede satt fra det (trivielle) første, tomme sjekket.
    saveWatchlistToStorage([createWatchlistItem({ mediaId: "tt0000009" })]);
    const laterOutcome = await migrateLocalWatchlistToCloud("user-1", storage);

    expect(laterOutcome).toEqual({ items: [], succeeded: false });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("migrerer alle lokale elementer til Firestore og setter migreringsflagget", async () => {
    const itemA = createWatchlistItem({ mediaId: "tt0000001" });
    const itemB = createWatchlistItem({ mediaId: "tt0000002" });
    saveWatchlistToStorage([itemA, itemB]);

    const upsert = vi.fn().mockResolvedValue(undefined);
    const storage = createMockWatchlistStorage({ upsert });

    const outcome = await migrateLocalWatchlistToCloud("user-1", storage);

    expect(outcome).toEqual({ items: [itemA, itemB], succeeded: true });
    expect(upsert).toHaveBeenCalledWith("user-1", itemA);
    expect(upsert).toHaveBeenCalledWith("user-1", itemB);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("hindrer duplisering ved gjentatt kjøring — migreringsflagget stopper en ny opplasting", async () => {
    const item = createWatchlistItem();
    saveWatchlistToStorage([item]);

    const upsert = vi.fn().mockResolvedValue(undefined);
    const storage = createMockWatchlistStorage({ upsert });

    const firstRun = await migrateLocalWatchlistToCloud("user-1", storage);
    expect(firstRun).toEqual({ items: [item], succeeded: true });
    expect(upsert).toHaveBeenCalledTimes(1);

    const secondRun = await migrateLocalWatchlistToCloud("user-1", storage);

    expect(secondRun).toEqual({ items: [], succeeded: false });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("setter ikke migreringsflagget når opplastingen feiler, slik at neste app-load prøver på nytt", async () => {
    const item = createWatchlistItem();
    saveWatchlistToStorage([item]);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failingUpsert = vi.fn().mockRejectedValue(new Error("nettverksfeil"));
    const failingStorage = createMockWatchlistStorage({
      upsert: failingUpsert,
    });

    const failedOutcome = await migrateLocalWatchlistToCloud(
      "user-1",
      failingStorage,
    );

    // Elementene som ble forsøkt, returneres likevel (for visning i UI-et),
    // men `succeeded` er `false` og flagget er ikke satt.
    expect(failedOutcome).toEqual({ items: [item], succeeded: false });
    expect(errorSpy).toHaveBeenCalled();

    // Et nytt migreringsforsøk (neste app-load) leser derfor de samme
    // lokale elementene på nytt i stedet for å hoppe over dem.
    const retryUpsert = vi.fn().mockResolvedValue(undefined);
    const retryStorage = createMockWatchlistStorage({ upsert: retryUpsert });
    const retriedOutcome = await migrateLocalWatchlistToCloud(
      "user-1",
      retryStorage,
    );

    expect(retriedOutcome).toEqual({ items: [item], succeeded: true });
    expect(retryUpsert).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it("lokale data forblir i localStorage uansett utfall (slettes aldri før bekreftet migrering)", async () => {
    const item = createWatchlistItem();
    saveWatchlistToStorage([item]);
    const storage = createMockWatchlistStorage();

    await migrateLocalWatchlistToCloud("user-1", storage);

    expect(loadWatchlistFromStorage()).toEqual([item]);
  });
});
