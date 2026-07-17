import { createContext, useContext, type ReactNode } from "react";
import type { MediaProvider } from "../services/media/MediaProvider";

const MediaProviderContext = createContext<MediaProvider | null>(null);

export interface MediaProviderProviderProps {
  provider: MediaProvider;
  children: ReactNode;
}

/**
 * Injiserer den konfigurerte `MediaProvider`-instansen app-bredt. Et
 * Context (fremfor et modul-singleton) gjør det trivielt å injisere en
 * testdobbel (`createMockMediaProvider()`) i komponenttester uten skjøre
 * modul-mocks. Se `services/media/index.ts` for sammensetningsroten.
 */
export function MediaProviderProvider({
  provider,
  children,
}: MediaProviderProviderProps) {
  return (
    <MediaProviderContext.Provider value={provider}>
      {children}
    </MediaProviderContext.Provider>
  );
}

export function useMediaProvider(): MediaProvider {
  const provider = useContext(MediaProviderContext);
  if (provider === null) {
    throw new Error(
      "useMediaProvider må brukes innenfor en MediaProviderProvider",
    );
  }
  return provider;
}
