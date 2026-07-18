import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { auth } from "../services/auth/firebaseClient";

export type AuthStatus = "loading" | "ready" | "error";

export interface AuthContextValue {
  /** `null` inntil den anonyme sesjonen er klar (se docs/plans/watchlist-database-migrering.md#identitet-authcontext). */
  userId: string | null;
  status: AuthStatus;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Etablerer en usynlig, anonym Firebase-sesjon (DB-migrering, issue B — se
 * docs/plans/watchlist-database-migrering.md#identitet-authcontext). Ingen
 * UI vises noensinne i denne runden — ingen innloggingsknapp, ingen "koble
 * til enhet".
 *
 * `onAuthStateChanged` trigges umiddelbart ved mount med gjeldende
 * sesjonstilstand (fra Firebase sin lokale persistens, som overlever
 * reload). Er det ingen bruker ennå, kalles `signInAnonymously` — dette
 * trigger selv en ny `onAuthStateChanged`-hendelse med den nyopprettede
 * brukeren, så `userId`/`status` oppdateres uten noen egen `then`-gren her.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          setUserId(user.uid);
          setStatus("ready");
          return;
        }

        signInAnonymously(auth).catch((error: unknown) => {
          console.error("Kunne ikke opprette anonym Firebase-sesjon", error);
          setStatus("error");
        });
      },
      (error) => {
        console.error(
          "Feil ved lytting på Firebase-autentiseringsstatus",
          error,
        );
        setStatus("error");
      },
    );

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ userId, status }),
    [userId, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth må brukes innenfor en AuthProvider");
  }
  return context;
}
