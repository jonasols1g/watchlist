import { BrowserRouter, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/layout/NavBar";
import { WatchlistSaveErrorBanner } from "./components/watchlist/WatchlistSaveErrorBanner";
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
      <WatchlistProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <NavBar />
          <main className="mx-auto max-w-5xl p-4">
            <WatchlistSaveErrorBanner />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/mylist" element={<WatchlistPage />} />
              <Route path="/title/:id" element={<TitleDetailPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
        </BrowserRouter>
      </WatchlistProvider>
    </MediaProviderProvider>
  );
}
