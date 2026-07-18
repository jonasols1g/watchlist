import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const onAuthStateChangedMock = vi.fn();
const signInAnonymouslyMock = vi.fn();

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args: unknown[]): unknown =>
    onAuthStateChangedMock(...args) as unknown,
  signInAnonymously: (...args: unknown[]): unknown =>
    signInAnonymouslyMock(...args) as unknown,
}));

vi.mock("../services/auth/firebaseClient", () => ({
  auth: {},
}));

// Importeres etter mockene over, slik at AuthContext sine
// `firebase/auth`-kall går mot testdoblene, ikke ekte Firebase.
const { AuthProvider, useAuth } = await import("./AuthContext");

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

type AuthStateCallback = (user: { uid: string } | null) => void;

/** Henter `nextOrObserver`-callbacken sendt til `onAuthStateChanged` i siste kall. */
function latestAuthStateCallback(): AuthStateCallback {
  const calls = onAuthStateChangedMock.mock.calls;
  const lastCall = calls[calls.length - 1];
  if (!lastCall) {
    throw new Error("onAuthStateChanged er ikke kalt ennå");
  }
  return lastCall[1] as AuthStateCallback;
}

describe("AuthContext", () => {
  afterEach(() => {
    onAuthStateChangedMock.mockReset();
    signInAnonymouslyMock.mockReset();
  });

  it("starter i 'loading' med userId null", () => {
    onAuthStateChangedMock.mockReturnValue(vi.fn());
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.status).toBe("loading");
    expect(result.current.userId).toBeNull();
  });

  it("kaller signInAnonymously når det ikke finnes noen bruker fra før", () => {
    onAuthStateChangedMock.mockReturnValue(vi.fn());
    signInAnonymouslyMock.mockResolvedValue(undefined);
    renderHook(() => useAuth(), { wrapper });

    act(() => {
      latestAuthStateCallback()(null);
    });

    expect(signInAnonymouslyMock).toHaveBeenCalledWith({});
  });

  it("blir 'ready' med userId satt til uid når signInAnonymously trigger en ny onAuthStateChanged-hendelse", async () => {
    onAuthStateChangedMock.mockReturnValue(vi.fn());
    signInAnonymouslyMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      latestAuthStateCallback()(null);
    });
    await waitFor(() => expect(signInAnonymouslyMock).toHaveBeenCalled());

    act(() => {
      latestAuthStateCallback()({ uid: "anon-uid-1" });
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.userId).toBe("anon-uid-1");
  });

  it("gjenoppretter en eksisterende sesjon direkte uten å kalle signInAnonymously (overlever reload)", () => {
    onAuthStateChangedMock.mockReturnValue(vi.fn());
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      latestAuthStateCallback()({ uid: "anon-uid-existing" });
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.userId).toBe("anon-uid-existing");
    expect(signInAnonymouslyMock).not.toHaveBeenCalled();
  });

  it("setter status til 'error' når signInAnonymously feiler", async () => {
    onAuthStateChangedMock.mockReturnValue(vi.fn());
    signInAnonymouslyMock.mockRejectedValue(new Error("nettverksfeil"));
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      latestAuthStateCallback()(null);
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.userId).toBeNull();
  });

  it("setter status til 'error' når onAuthStateChanged selv rapporterer en feil", () => {
    let errorCallback: ((error: unknown) => void) | undefined;
    onAuthStateChangedMock.mockImplementation(
      (_auth: unknown, _next: unknown, error: (error: unknown) => void) => {
        errorCallback = error;
        return vi.fn();
      },
    );
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      errorCallback?.(new Error("lyttefeil"));
    });

    expect(result.current.status).toBe("error");
  });

  it("kaster en tydelig feil når hooken brukes utenfor en provider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth må brukes innenfor en AuthProvider",
    );
  });
});
