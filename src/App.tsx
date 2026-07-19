import type { ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Footer } from "./components/layout/Footer";
import { NavBar } from "./components/layout/NavBar";
import { WatchlistSaveErrorBanner } from "./components/watchlist/WatchlistSaveErrorBanner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { MediaProviderProvider } from "./context/MediaProviderContext";
import { WatchlistProvider } from "./context/WatchlistContext";
import { FeedbackPage } from "./routes/FeedbackPage";
import { HomePage } from "./routes/HomePage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { TitleDetailPage } from "./routes/TitleDetailPage";
import { WatchlistPage } from "./routes/WatchlistPage";
import { mediaProvider } from "./services/media";
import { watchlistStorage } from "./services/storage";

/**
 * Kobler `userId` fra `AuthContext` (den anonyme Firebase-sesjonen) inn i
 * `WatchlistProvider` (DB-migrering issue C). En liten mellomkomponent er
 * nødvendig siden `useAuth()` bare kan brukes innenfor `AuthProvider`, som
 * må ligge utenfor `WatchlistProvider` i treet (se
 * docs/plans/watchlist-database-migrering.md#identitet-authcontext).
 */
function AuthenticatedWatchlistProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  return (
    <WatchlistProvider storage={watchlistStorage} userId={userId}>
      {children}
    </WatchlistProvider>
  );
}

export function App() {
  return (
    <MediaProviderProvider provider={mediaProvider}>
      <AuthProvider>
        <AuthenticatedWatchlistProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            {/*
              NavBar er en fast bunn-fanebar (78px, se
              docs/design.md#visuelt-tema-cinefind-fase-11) — `pb-[94px]`
              holder sideinnholdet unna den på alle sider.
            */}
            <main className="mx-auto min-h-screen max-w-5xl p-4 pb-[94px]">
              <WatchlistSaveErrorBanner />
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/mylist" element={<WatchlistPage />} />
                <Route path="/title/:id" element={<TitleDetailPage />} />
                {/*
                  Bevisst skjult (issue #40) — ingen lenke i NavBar/Footer,
                  nås kun via direkte URL. Se
                  docs/plans/feedback-innsending-og-automatisk-oppfolging.md#del-a.
                */}
                <Route path="/feedback" element={<FeedbackPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
              <Footer />
            </main>
            <NavBar />
          </BrowserRouter>
        </AuthenticatedWatchlistProvider>
      </AuthProvider>
    </MediaProviderProvider>
  );
}
