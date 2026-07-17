import { LocalStorageCacheStore } from "../cache/LocalStorageCacheStore";
import { CachingMediaProvider } from "./CachingMediaProvider";
import type { MediaProvider } from "./MediaProvider";
import { MockMediaProvider } from "./providers/MockMediaProvider";

/**
 * Sammensetningsrot for `MediaProvider`. Fase 1–9 kjører mot
 * `MockMediaProvider`; fase 10 bytter kun ut `realProvider` med
 * `CompositeMediaProvider(omdb, motn)` — resten av appen ser aldri
 * forskjell, siden alt går gjennom `MediaProvider`-interfacet.
 */
const realProvider: MediaProvider = new MockMediaProvider();

export const mediaProvider: MediaProvider = new CachingMediaProvider(
  realProvider,
  new LocalStorageCacheStore(),
  { searchTtlMs: 48 * 60 * 60 * 1000, detailsTtlMs: 24 * 60 * 60 * 1000 },
);
