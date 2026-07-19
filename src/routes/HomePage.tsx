import { EmptyState } from "../components/common/EmptyState";
import { ErrorMessage } from "../components/common/ErrorMessage";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { PosterWallBackground } from "../components/search/PosterWallBackground";
import { SearchBar } from "../components/search/SearchBar";
import { SearchResultsGrid } from "../components/search/SearchResultsGrid";
import { VoiceSearchButton } from "../components/search/VoiceSearchButton";
import { useMediaSearch } from "../hooks/useMediaSearch";

/**
 * Tekstsøk og talesøk (fase 8) går gjennom nøyaktig samme kodepath: begge
 * ender i dette `handleSearch(query)`-kallet (se
 * docs/design.md#søkeflyt-tekst-og-tale).
 *
 * Layout (se docs/design-spec/screenshots/01-sok.png og
 * 02-sokeresultater.png): før noe søk er utført sentreres CineFind-wordmarken
 * og søkefeltet vertikalt i en egen sone. Så snart et søk er utført (uansett
 * utfall) vises feltet i normal, topp-ankret rekkefølge over resultatene —
 * nøyaktig samme `useMediaSearch`-tilstand som før, kun ulik visuell
 * plassering avhengig av `status`. Søkeknappen og mikrofonknappen
 * (`SearchBar`s `trailingAction`) er derimot alltid fast plassert nederst i
 * viewporten, rett over `NavBar`, uavhengig av `centered`/`status` (se
 * SearchBar.tsx) — `pb-28` under holder resultatgridet unna den raden,
 * samme mønster/verdi som brukes for CTA-en i TitleDetailPage.tsx.
 *
 * `<h1>`-en er `sr-only`: skjermbildet viser ingen synlig "Søk"-tekst på
 * selve siden (kun CineFind-wordmarken og fanenavnet i bunn-navigasjonen) —
 * en skjult, semantisk korrekt sidetittel bevarer likevel a11y-strukturen og
 * treffes fortsatt av eksisterende tester (`getByRole("heading", { name:
 * "Søk" })` i App.test.tsx og e2e/deep-links.spec.ts).
 */
export function HomePage() {
  const { status, results, errorCode, search, retry } = useMediaSearch();
  const isIdle = status === "idle";

  function handleSearch(query: string) {
    search(query);
  }

  return (
    <>
      {isIdle && <PosterWallBackground />}

      <div
        className={`flex flex-col pb-28 ${isIdle ? "relative z-10 min-h-[65vh]" : ""}`}
      >
        <h1 className="sr-only">Søk</h1>

        <SearchBar
          onSubmit={handleSearch}
          centered={isIdle}
          heading={
            isIdle ? (
              <p
                aria-hidden="true"
                className="font-heading text-brand-gradient text-[26px] font-bold"
              >
                Streamie
              </p>
            ) : undefined
          }
          trailingAction={<VoiceSearchButton onResult={handleSearch} />}
        />

        <div className="mt-6">
          {status === "loading" && <LoadingSpinner label="Søker …" />}

          {status === "error" && errorCode !== null && (
            <ErrorMessage code={errorCode} onRetry={retry} />
          )}

          {status === "success" && results.length === 0 && (
            <EmptyState message="Ingen treff. Prøv et annet søk." />
          )}

          {status === "success" && results.length > 0 && (
            <>
              <p className="text-text-muted mb-4 text-sm">
                {results.length} treff
              </p>
              <SearchResultsGrid results={results} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
