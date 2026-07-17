import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { MediaProviderProvider } from "../context/MediaProviderContext";
import { WatchlistProvider } from "../context/WatchlistContext";
import type { MediaProvider } from "../services/media/MediaProvider";
import { createMockMediaProvider } from "./mocks/createMockMediaProvider";

export interface RenderWithProvidersOptions extends Omit<
  RenderOptions,
  "wrapper"
> {
  provider?: MediaProvider;
  route?: string;
}

/**
 * Render-helper som kobler på context-providerne komponenter/sider typisk
 * trenger i tester: `MediaProviderProvider` (med en testdobbel som
 * standard), `WatchlistProvider` (persisterer mot jsdoms `localStorage`,
 * ryddet mellom tester i `setupTests.ts`) og `MemoryRouter` (for
 * komponenter som lenker/navigerer). Se mappestrukturen i
 * docs/architecture.md.
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    provider = createMockMediaProvider(),
    route = "/",
    ...options
  }: RenderWithProvidersOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MediaProviderProvider provider={provider}>
        <WatchlistProvider>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </WatchlistProvider>
      </MediaProviderProvider>
    );
  }

  return { provider, ...render(ui, { wrapper: Wrapper, ...options }) };
}
