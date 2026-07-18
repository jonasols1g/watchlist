import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

// `App.tsx` importerer det app-brede, sammensatte `mediaProvider`-
// singletonet direkte fra `services/media` (fase 10: `CompositeMediaProvider`
// mot ekte OMDb/MOTN-kall). Denne modultesten skal aldri gjøre ekte
// nettverkskall, så modulen mockes til en enkel testdobbel med samme
// fixture-data (`mock-movie-1` → "The Matrix") som resten av fase 1–9s
// tester forventer — se docs/dev-tasks.md fase 10 (all testing bruker
// mockede/stubbede kall, aldri ekte API-er).
vi.mock("./services/media", () => ({
  mediaProvider: {
    id: "mock",
    search: vi.fn().mockResolvedValue([]),
    getDetails: vi.fn().mockResolvedValue({
      id: "mock-movie-1",
      mediaType: "movie",
      title: "The Matrix",
      releaseYear: 1999,
      posterUrl: "https://images.example.com/posters/the-matrix.jpg",
      providerId: "mock",
      overview:
        "A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.",
      genres: ["Action", "Sci-Fi"],
      ratings: { imdbScore: 8.7, rottenTomatoesScore: 83 },
      streaming: null,
      runtimeMinutes: 136,
    }),
  },
}));

// `App` wrappes med `AuthProvider` (DB-migrering issue B), som importerer
// `./services/auth/firebaseClient` og kaller `onAuthStateChanged`/
// `signInAnonymously` fra `firebase/auth`. `firebaseClient.ts` initialiserer
// ekte Firebase-klienter på modulnivå (`getAuth(firebaseApp)`) — uten
// `VITE_FIREBASE_*` satt (som i CI, se .github/workflows/ci.yml) kaster
// dette `auth/invalid-api-key` og feller hele testfila. Denne modultesten
// skal aldri gjøre ekte Firebase-kall, så begge modulene mockes til enkle
// testdobler, tilsvarende mønsteret i AuthContext.test.tsx.
// `firestore: {}` trengs også (DB-migrering issue C):
// `services/storage/index.ts` sin sammensetningsrot importerer `firestore`
// fra samme modul for å konstruere `FirestoreWatchlistStorage` — den
// instansen brukes aldri reelt her siden `onAuthStateChanged` under aldri
// trigger callbacken (userId forblir `null`), men modulen må fortsatt
// eksportere noe importerbart.
vi.mock("./services/auth/firebaseClient", () => ({ auth: {}, firestore: {} }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: () => () => {},
  signInAnonymously: () => Promise.resolve(),
}));

describe("App", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("viser hjemsiden på /", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Søk" })).toBeInTheDocument();
  });

  it("navigerer til watchlist-siden via NavBar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: "Watchlist" }));

    expect(
      screen.getByRole("heading", { name: "Watchlist" }),
    ).toBeInTheDocument();
  });

  it("navigerer tilbake til hjemsiden via NavBar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: "Watchlist" }));
    // NavBar-fanen til "/" heter "Søk" i CineFind-temaet (fase 11), ikke
    // "Hjem" — se docs/design-spec/screenshots/.
    await user.click(screen.getByRole("link", { name: "Søk" }));

    expect(screen.getByRole("heading", { name: "Søk" })).toBeInTheDocument();
  });

  it("viser detaljside med tittel fra MediaProvider på /title/:id", async () => {
    window.history.pushState({}, "", "/title/mock-movie-1");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "The Matrix" }),
    ).toBeInTheDocument();
  });

  it("viser 404-siden for ukjente ruter og lenker tilbake til hjem", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/ukjent-rute");
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Siden finnes ikke" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Gå til forsiden" }));

    expect(screen.getByRole("heading", { name: "Søk" })).toBeInTheDocument();
  });
});
