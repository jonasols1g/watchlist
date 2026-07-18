import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WatchlistStorage } from "../services/storage/WatchlistRemoteStorage";
import {
  loadWatchlistFromStorage,
  saveWatchlistToStorage,
} from "../services/storage/watchlistStorage";
import { createMediaSummary } from "../test/fixtures/media.fixtures";
import { createWatchlistItem } from "../test/fixtures/watchlist.fixtures";
import { createMockWatchlistStorage } from "../test/mocks/createMockWatchlistStorage";
import type { WatchlistItem } from "../types/watchlist";
import { WatchlistProvider, useWatchlist } from "./WatchlistContext";

/**
 * `userId={null}` — Firestore-synk er bevisst utenfor bildet i disse
 * hjelperne (dekkes av «Firestore-hydrering»- og «skriving mot
 * Firestore»-suitene under). `WatchlistContext` hopper over enhver
 * `WatchlistStorage`-bruk når `userId` er `null` (se
 * `WatchlistContext.tsx`), så disse testene isolerer ren
 * `localStorage`-atferd, uendret siden før DB-migreringen.
 */
function wrapper({ children }: { children: ReactNode }) {
  return (
    <WatchlistProvider storage={createMockWatchlistStorage()} userId={null}>
      {children}
    </WatchlistProvider>
  );
}

/** Deferred promise — gir kontroll over nøyaktig når en mock-storage-promise løses, for å teste `isLoading`-overganger. */
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function wrapperWithStorage(storage: WatchlistStorage, userId: string | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <WatchlistProvider storage={storage} userId={userId}>
        {children}
      </WatchlistProvider>
    );
  };
}

/**
 * `Storage`-stubbe med en total byte-kvote akkurat stor nok for en tom
 * watchlist (`"[]"`), men ikke mer — simulerer en enhet der lagringsplassen
 * er full uten noen cache-entries å rydde. `detectLocalStorage`s
 * probe-skriving (en annen, kortlevd nøkkel) påvirkes ikke, siden den
 * fjernes igjen umiddelbart.
 */
function createNearFullWatchlistStorage(): Storage {
  const entries = new Map<string, string>();
  const maxTotalLength = "[]".length;

  function totalLength(): number {
    let total = 0;
    for (const value of entries.values()) {
      total += value.length;
    }
    return total;
  }

  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      const previousLength = entries.get(key)?.length ?? 0;
      const projectedTotal = totalLength() - previousLength + value.length;
      if (projectedTotal > maxTotalLength) {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  };
}

describe("WatchlistContext — lokal skriveputt (userId null)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("starter tom når ingenting er lagret", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    expect(result.current.items).toEqual([]);
  });

  it("kaster en tydelig feil når hooken brukes utenfor en provider", () => {
    expect(() => renderHook(() => useWatchlist())).toThrow(
      "useWatchlist må brukes innenfor en WatchlistProvider",
    );
  });

  it("addToWatchlist legger til tittelen som 'planned'", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    const media = createMediaSummary({ id: "mock-movie-1" });

    act(() => {
      result.current.addToWatchlist(media);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      mediaId: "mock-movie-1",
      media,
      status: "planned",
    });
    expect(result.current.isInWatchlist("mock-movie-1")).toBe(true);
    expect(result.current.getStatus("mock-movie-1")).toBe("planned");
  });

  it("addToWatchlist er idempotent — legger ikke til samme tittel to ganger", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    const media = createMediaSummary({ id: "mock-movie-1" });

    act(() => {
      result.current.addToWatchlist(media);
      result.current.addToWatchlist(media);
    });

    expect(result.current.items).toHaveLength(1);
  });

  it("setStatus bytter status og setter watchedAt kun ved 'watched'", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    const media = createMediaSummary({ id: "mock-movie-1" });

    act(() => {
      result.current.addToWatchlist(media);
    });
    act(() => {
      result.current.setStatus("mock-movie-1", "watched");
    });

    expect(result.current.getStatus("mock-movie-1")).toBe("watched");
    expect(result.current.items[0]?.watchedAt).toBeDefined();

    act(() => {
      result.current.setStatus("mock-movie-1", "planned");
    });

    expect(result.current.getStatus("mock-movie-1")).toBe("planned");
    expect(result.current.items[0]?.watchedAt).toBeUndefined();
  });

  it("removeFromWatchlist fjerner tittelen", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    const media = createMediaSummary({ id: "mock-movie-1" });

    act(() => {
      result.current.addToWatchlist(media);
    });
    act(() => {
      result.current.removeFromWatchlist("mock-movie-1");
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.isInWatchlist("mock-movie-1")).toBe(false);
  });

  it("persisterer endringer til localStorage — en ny provider-instans leser dem tilbake", () => {
    const media = createMediaSummary({ id: "mock-movie-1" });
    const { result, unmount } = renderHook(() => useWatchlist(), { wrapper });

    act(() => {
      result.current.addToWatchlist(media);
    });
    unmount();

    const { result: reloaded } = renderHook(() => useWatchlist(), {
      wrapper,
    });
    expect(reloaded.current.items).toHaveLength(1);
    expect(reloaded.current.items[0]?.mediaId).toBe("mock-movie-1");
  });

  it("kaller aldri WatchlistStorage når userId er null", () => {
    const load = vi.fn().mockResolvedValue([]);
    const upsert = vi.fn().mockResolvedValue(undefined);
    const storage = createMockWatchlistStorage({ load, upsert });
    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, null),
    });

    act(() => {
      result.current.addToWatchlist(createMediaSummary({ id: "mock-movie-1" }));
    });

    expect(load).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("WatchlistContext — lagringsfeil (lokal)", () => {
  // `watchlistStorage` detekterer `localStorage` kun én gang og cacher den
  // (se watchlistStorage.ts) — stubben må derfor være på plass *før*
  // `WatchlistContext` (og dermed `watchlistStorage`) importeres på nytt via
  // `vi.resetModules()`, ellers gjenbrukes en tidligere tests cachede
  // instans.
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    localStorage.clear();
  });

  it("setter saveError når lagring feiler selv etter cache-opprydding, og kan avvises", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createNearFullWatchlistStorage());
    const {
      WatchlistProvider: FreshWatchlistProvider,
      useWatchlist: useFreshWatchlist,
    } = await import("./WatchlistContext");
    const { createMockWatchlistStorage: createFreshMockStorage } =
      await import("../test/mocks/createMockWatchlistStorage");

    function freshWrapper({ children }: { children: ReactNode }) {
      return (
        <FreshWatchlistProvider
          storage={createFreshMockStorage()}
          userId={null}
        >
          {children}
        </FreshWatchlistProvider>
      );
    }

    const { result } = renderHook(() => useFreshWatchlist(), {
      wrapper: freshWrapper,
    });

    expect(result.current.saveError).toBe(false);

    act(() => {
      result.current.addToWatchlist(createMediaSummary({ id: "mock-movie-1" }));
    });

    expect(result.current.saveError).toBe(true);

    act(() => {
      result.current.dismissSaveError();
    });

    expect(result.current.saveError).toBe(false);
  });
});

describe("WatchlistContext — Firestore-hydrering", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("isLoading er true inntil den første Firestore-hentingen er fullført, og items erstattes med det hentede resultatet", async () => {
    const deferred = createDeferred<ReturnType<typeof createWatchlistItem>[]>();
    // Navngitt lokal variabel (ikke `storage.load`) — asserte på en
    // egen-bundet `vi.fn()`-referanse direkte unngår
    // `@typescript-eslint/unbound-method`, samme mønster som
    // `createMockMediaProvider`-baserte tester (se f.eks.
    // `hooks/useMediaSearch.test.tsx`).
    const load = vi.fn().mockReturnValue(deferred.promise);
    const storage = createMockWatchlistStorage({ load });

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });

    expect(result.current.isLoading).toBe(true);
    expect(load).toHaveBeenCalledWith("user-1");

    const remoteItem = createWatchlistItem({ mediaId: "remote-1" });
    await act(async () => {
      deferred.resolve([remoteItem]);
      await deferred.promise;
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([remoteItem]);
  });

  it("isLoading blir false selv om den første hentingen feiler, og setter saveError", async () => {
    const load = vi.fn().mockRejectedValue(new Error("nettverksfeil"));
    const storage = createMockWatchlistStorage({ load });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.saveError).toBe(true);

    errorSpy.mockRestore();
  });

  it("henter på nytt ved 'online'-hendelsen, uten å sette isLoading tilbake til true", async () => {
    const load = vi.fn().mockResolvedValue([]);
    const storage = createMockWatchlistStorage({ load });

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(load).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(result.current.isLoading).toBe(false);
  });

  // Reviewer-funn på PR #23: den initiale hentingen overskrev ubetinget
  // lokal state når den resolverte, uavhengig av handlinger brukeren gjorde
  // mens hentingen var underveis — en addToWatchlist rett etter mount kunne
  // dermed synes å forsvinne idet et eldre/tomt hentingsresultat landet.
  it("bevarer en handling gjort mens den første Firestore-hentingen er underveis, i stedet for å bli overskrevet av hentingsresultatet", async () => {
    const deferredLoad = createDeferred<WatchlistItem[]>();
    const load = vi.fn().mockReturnValue(deferredLoad.promise);
    const upsert = vi.fn().mockResolvedValue(undefined);
    const storage = createMockWatchlistStorage({ load, upsert });

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });

    expect(result.current.isLoading).toBe(true);

    // Brukeren rekker å legge til en tittel mens den initiale hentingen
    // fortsatt er underveis (optimistisk oppdatering skjer umiddelbart,
    // uavhengig av hydrering).
    act(() => {
      result.current.addToWatchlist(createMediaSummary({ id: "mock-movie-1" }));
    });
    expect(result.current.isInWatchlist("mock-movie-1")).toBe(true);

    // Hentingen resolver med et datasett som *ikke* inneholder tittelen
    // (f.eks. fordi Firestore-skrivingen ikke hadde rukket å committes da
    // lesingen startet) — den skal likevel ikke forsvinne fra UI-et.
    await act(async () => {
      deferredLoad.resolve([]);
      await deferredLoad.promise;
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isInWatchlist("mock-movie-1")).toBe(true);
    expect(result.current.items).toHaveLength(1);
  });

  it("bevarer en handling utført under en påfølgende 'online'-gjenhenting på samme måte", async () => {
    const load = vi.fn().mockResolvedValue([]);
    const upsert = vi.fn().mockResolvedValue(undefined);
    const storage = createMockWatchlistStorage({ load, upsert });

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const deferredReload = createDeferred<WatchlistItem[]>();
    load.mockReturnValueOnce(deferredReload.promise);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));

    act(() => {
      result.current.addToWatchlist(createMediaSummary({ id: "mock-movie-2" }));
    });
    expect(result.current.isInWatchlist("mock-movie-2")).toBe(true);

    await act(async () => {
      deferredReload.resolve([]);
      await deferredReload.promise;
    });

    expect(result.current.isInWatchlist("mock-movie-2")).toBe(true);
  });

  // Dypere variant av samme race: en handling gjort under en pågående
  // henting, hvis EGEN Firestore-skriving feiler (rulles tilbake) *før*
  // hentingen selv rekker å resolve — hentingen skal ikke "gjøre om"
  // handlingen igjen når den senere spiller av den (nå ugyldige) køen.
  it("gjør ikke om en handling som allerede er rullet tilbake, når hentingen den ble utført under senere resolver", async () => {
    const deferredLoad = createDeferred<WatchlistItem[]>();
    const load = vi.fn().mockReturnValue(deferredLoad.promise);
    const upsert = vi.fn().mockRejectedValue(new Error("nettverksfeil"));
    const storage = createMockWatchlistStorage({ load, upsert });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });

    act(() => {
      result.current.addToWatchlist(createMediaSummary({ id: "mock-movie-1" }));
    });
    expect(result.current.isInWatchlist("mock-movie-1")).toBe(true);

    // Handlingens egen skriving feiler og rulles tilbake — *mens* den
    // initiale hentingen fortsatt er underveis.
    await waitFor(() =>
      expect(result.current.isInWatchlist("mock-movie-1")).toBe(false),
    );

    // Hentingen resolverer først etterpå.
    await act(async () => {
      deferredLoad.resolve([]);
      await deferredLoad.promise;
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Tittelen skal forbli borte — ikke gjenoppstå fra den avspilte køen.
    expect(result.current.isInWatchlist("mock-movie-1")).toBe(false);

    errorSpy.mockRestore();
  });
});

// DB-migrering issue D — se
// docs/plans/watchlist-database-migrering.md#migrering-av-eksisterende-
// localstorage-data. `migrateLocalWatchlistToCloud` (services/storage) er
// selv enhetstestet i detalj (tomt/ikke-tomt utgangspunkt, flagget som
// hindrer duplisering, feilet opplasting); disse testene dekker i stedet
// selve *koblingen* inn i `WatchlistContext`s hydreringsflyt.
describe("WatchlistContext — migrering av lokal watchlist til Firestore ved oppstart", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("migrerer en eksisterende lokal watchlist til Firestore ved første hydrering, uten at elementet forsvinner fra UI-et", async () => {
    const localItem = createWatchlistItem({ mediaId: "tt0000001" });
    saveWatchlistToStorage([localItem]);

    const load = vi.fn().mockResolvedValue([]);
    const upsert = vi.fn().mockResolvedValue(undefined);
    const storage = createMockWatchlistStorage({ load, upsert });

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(upsert).toHaveBeenCalledWith("user-1", localItem);
    expect(result.current.isInWatchlist("tt0000001")).toBe(true);
    expect(result.current.items).toEqual([localItem]);
  });

  it("gjør ingen migrering når det ikke finnes noen lokal watchlist", async () => {
    const load = vi.fn().mockResolvedValue([]);
    const upsert = vi.fn().mockResolvedValue(undefined);
    const storage = createMockWatchlistStorage({ load, upsert });

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(upsert).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });

  it("migrerer ikke på nytt ved en påfølgende app-load — migreringsflagget hindrer duplisering", async () => {
    const localItem = createWatchlistItem({ mediaId: "tt0000001" });
    saveWatchlistToStorage([localItem]);

    const firstLoad = vi.fn().mockResolvedValue([]);
    const firstUpsert = vi.fn().mockResolvedValue(undefined);
    const firstStorage = createMockWatchlistStorage({
      load: firstLoad,
      upsert: firstUpsert,
    });

    const { result: firstResult, unmount } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(firstStorage, "user-1"),
    });
    await waitFor(() => expect(firstResult.current.isLoading).toBe(false));
    expect(firstUpsert).toHaveBeenCalledTimes(1);
    unmount();

    // Simulerer neste app-load: en ny provider-instans (fersk `storage`),
    // der Firestore nå faktisk inneholder elementet fra forrige migrering.
    const secondLoad = vi.fn().mockResolvedValue([localItem]);
    const secondUpsert = vi.fn().mockResolvedValue(undefined);
    const secondStorage = createMockWatchlistStorage({
      load: secondLoad,
      upsert: secondUpsert,
    });

    const { result: secondResult } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(secondStorage, "user-1"),
    });
    await waitFor(() => expect(secondResult.current.isLoading).toBe(false));

    expect(secondUpsert).not.toHaveBeenCalled();
    expect(secondResult.current.items).toEqual([localItem]);
  });

  it("setter ikke migreringsflagget når opplastingen feiler — items viser likevel de lokale elementene, og saveError settes", async () => {
    const localItem = createWatchlistItem({ mediaId: "tt0000001" });
    saveWatchlistToStorage([localItem]);

    const load = vi.fn().mockResolvedValue([]);
    const upsert = vi.fn().mockRejectedValue(new Error("nettverksfeil"));
    const storage = createMockWatchlistStorage({ load, upsert });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.saveError).toBe(true);
    expect(result.current.items).toEqual([localItem]);
    // Lokale data er urørt — flagget er ikke satt, så et senere app-load
    // (en ny provider-instans) prøver migreringen på nytt.
    expect(loadWatchlistFromStorage()).toEqual([localItem]);

    errorSpy.mockRestore();
  });
});

describe("WatchlistContext — skriving mot Firestore (userId satt)", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("addToWatchlist kaller storage.upsert med riktig userId/element", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const storage = createMockWatchlistStorage({ upsert });
    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const media = createMediaSummary({ id: "mock-movie-1" });
    act(() => {
      result.current.addToWatchlist(media);
    });

    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ mediaId: "mock-movie-1", status: "planned" }),
      ),
    );
  });

  it("removeFromWatchlist kaller storage.remove med riktig userId/mediaId", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const storage = createMockWatchlistStorage({ remove });
    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addToWatchlist(createMediaSummary({ id: "mock-movie-1" }));
    });
    act(() => {
      result.current.removeFromWatchlist("mock-movie-1");
    });

    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith("user-1", "mock-movie-1"),
    );
  });

  it("setStatus kaller storage.updateStatus med watchedAt ved 'watched', og uten ved tilbakebytte til 'planned'", async () => {
    const updateStatus = vi.fn().mockResolvedValue(undefined);
    const storage = createMockWatchlistStorage({ updateStatus });
    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addToWatchlist(createMediaSummary({ id: "mock-movie-1" }));
    });
    act(() => {
      result.current.setStatus("mock-movie-1", "watched");
    });

    await waitFor(() =>
      expect(updateStatus).toHaveBeenCalledWith(
        "user-1",
        "mock-movie-1",
        "watched",
        expect.any(String),
      ),
    );

    act(() => {
      result.current.setStatus("mock-movie-1", "planned");
    });

    await waitFor(() =>
      expect(updateStatus).toHaveBeenLastCalledWith(
        "user-1",
        "mock-movie-1",
        "planned",
        undefined,
      ),
    );
  });

  it("ruller tilbake tilstanden (og localStorage) og setter saveError når Firestore-skrivingen feiler", async () => {
    const upsert = vi.fn().mockRejectedValue(new Error("nettverksfeil"));
    const storage = createMockWatchlistStorage({ upsert });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addToWatchlist(createMediaSummary({ id: "mock-movie-1" }));
    });

    // Optimistisk: elementet er der umiddelbart, før nettverkskallet feiler.
    expect(result.current.items).toHaveLength(1);

    await waitFor(() => expect(result.current.items).toHaveLength(0));
    expect(result.current.saveError).toBe(true);
    expect(result.current.isInWatchlist("mock-movie-1")).toBe(false);

    errorSpy.mockRestore();
  });

  // Reviewer-funn på PR #23: rollback brukte et globalt snapshot tatt ved
  // kalltidspunktet for den feilende handlingen, som slettet enhver senere,
  // uavhengig, vellykket handling fra visningen (f.eks. legg til A, deretter
  // legg til B rett etter — feiler As skriving etter at B allerede har
  // lykkes, forsvant B også).
  it("ruller kun tilbake den feilende handlingens egen effekt — en senere, uavhengig, vellykket handling forblir", async () => {
    const deferredA = createDeferred<void>();
    const upsert = vi.fn((_uid: string, item: { mediaId: string }) =>
      item.mediaId === "mock-movie-A" ? deferredA.promise : Promise.resolve(),
    );
    const storage = createMockWatchlistStorage({ upsert });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A legges til først — skrivingen henger (deferredA er ikke løst ennå).
    act(() => {
      result.current.addToWatchlist(createMediaSummary({ id: "mock-movie-A" }));
    });

    // B legges til rett etter — dens skriving lykkes uavhengig av A.
    await act(async () => {
      result.current.addToWatchlist(createMediaSummary({ id: "mock-movie-B" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isInWatchlist("mock-movie-A")).toBe(true);
    expect(result.current.isInWatchlist("mock-movie-B")).toBe(true);

    // As skriving feiler *etter* at B allerede har lykkes.
    await act(async () => {
      deferredA.reject(new Error("nettverksfeil"));
      await deferredA.promise.catch(() => undefined);
    });

    await waitFor(() =>
      expect(result.current.isInWatchlist("mock-movie-A")).toBe(false),
    );
    // B skal forbli upåvirket av As rollback.
    expect(result.current.isInWatchlist("mock-movie-B")).toBe(true);
    expect(result.current.saveError).toBe(true);

    errorSpy.mockRestore();
  });

  it("ruller ikke tilbake et element som allerede fantes, når en idempotent (no-op) ADD feiler", async () => {
    const upsert = vi
      .fn()
      .mockResolvedValueOnce(undefined) // Første, ekte ADD lykkes.
      .mockRejectedValueOnce(new Error("nettverksfeil")); // Andre, no-op-ADD feiler.
    const storage = createMockWatchlistStorage({ upsert });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: wrapperWithStorage(storage, "user-1"),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const media = createMediaSummary({ id: "mock-movie-1" });
    act(() => {
      result.current.addToWatchlist(media);
    });
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));

    // Legger til samme tittel på nytt — reduceren er idempotent (ingen
    // faktisk endring), men `applyAction` sender likevel skrivingen, som nå
    // feiler.
    await act(async () => {
      result.current.addToWatchlist(media);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.saveError).toBe(true));
    // Tittelen fantes fra før denne (no-op-)handlingen — rollback skal ikke
    // fjerne den.
    expect(result.current.isInWatchlist("mock-movie-1")).toBe(true);
    expect(result.current.items).toHaveLength(1);

    errorSpy.mockRestore();
  });
});
