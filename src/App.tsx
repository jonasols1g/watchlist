import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Footer } from "./components/layout/Footer";
import { NavBar } from "./components/layout/NavBar";
import { WatchlistSaveErrorBanner } from "./components/watchlist/WatchlistSaveErrorBanner";
import { AuthProvider } from "./context/AuthContext";
import { MediaProviderProvider } from "./context/MediaProviderContext";
import { WatchlistProvider } from "./context/WatchlistContext";
import { HomePage } from "./routes/HomePage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { TitleDetailPage } from "./routes/TitleDetailPage";
import { WatchlistPage } from "./routes/WatchlistPage";
import { mediaProvider } from "./services/media";

export function App() {
  return (
    <MediaProviderProvider provider={mediaProvider}>
      <AuthProvider>
        <WatchlistProvider>
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
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
              <Footer />
            </main>
            <NavBar />
          </BrowserRouter>
        </WatchlistProvider>
      </AuthProvider>
    </MediaProviderProvider>
  );
}
