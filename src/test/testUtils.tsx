import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { MediaProviderProvider } from "../context/MediaProviderContext";
import { WatchlistProvider } from "../context/WatchlistContext";
import type { MediaProvider } from "../services/media/MediaProvider";
import type { WatchlistStorage } from "../services/storage/WatchlistRemoteStorage";
import { createMockMediaProvider } from "./mocks/createMockMediaProvider";
import { createMockWatchlistStorage } from "./mocks/createMockWatchlistStorage";

export interface RenderWithProvidersOptions extends Omit<
  RenderOptions,
  "wrapper"
> {
  provider?: MediaProvider;
  storage?: WatchlistStorage;
  userId?: string | null;
  route?: string;
}

/**
 * Render-helper som kobler på context-providerne komponenter/sider typisk
 * trenger i tester: `MediaProviderProvider` (med en testdobbel som
 * standard), `WatchlistProvider` (persisterer mot jsdoms `localStorage`,
 * ryddet mellom tester i `setupTests.ts`, og mot en `createMockWatchlistStorage()`-
 * testdobbel som standard — se docs/plans/watchlist-database-migrering.md
 * — ingen ekte Firebase-kall) og `MemoryRouter` (for komponenter som
 * lenker/navigerer). Se mappestrukturen i docs/architecture.md.
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    provider = createMockMediaProvider(),
    storage = createMockWatchlistStorage(),
    userId = "mock-user-id",
    route = "/",
    ...options
  }: RenderWithProvidersOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MediaProviderProvider provider={provider}>
        <WatchlistProvider storage={storage} userId={userId}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </WatchlistProvider>
      </MediaProviderProvider>
    );
  }

  return { provider, storage, ...render(ui, { wrapper: Wrapper, ...options }) };
}
