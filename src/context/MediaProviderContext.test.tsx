import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockMediaProvider } from "../test/mocks/createMockMediaProvider";
import {
  MediaProviderProvider,
  useMediaProvider,
} from "./MediaProviderContext";

describe("MediaProviderContext", () => {
  it("gir tilgang til provideren som er satt opp", () => {
    const provider = createMockMediaProvider();
    const { result } = renderHook(() => useMediaProvider(), {
      wrapper: ({ children }) => (
        <MediaProviderProvider provider={provider}>
          {children}
        </MediaProviderProvider>
      ),
    });

    expect(result.current).toBe(provider);
  });

  it("kaster ved bruk utenfor en MediaProviderProvider", () => {
    expect(() => renderHook(() => useMediaProvider())).toThrow(
      "useMediaProvider må brukes innenfor en MediaProviderProvider",
    );
  });
});
