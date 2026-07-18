import {
  useState,
  type AriaAttributes,
  type FormEvent,
  type ReactNode,
} from "react";

export interface SearchBarProps {
  onSubmit: (query: string) => void;
  initialQuery?: string;
  /**
   * Rendres over søkefeltet i den vertikalt sentrerte sonen (f.eks.
   * CineFind-wordmarken på `HomePage`, se
   * docs/design-spec/screenshots/01-sok.png).
   */
  heading?: ReactNode;
  /**
   * Rendres ved siden av søkeknappen i knapperaden som er fast plassert
   * nederst i viewporten, rett over `NavBar` (`VoiceSearchButton`) — en
   * DOM-etterkommer av dette skjemaet, men et eget `type="button"`, så den
   * utløser aldri søke-submitten.
   */
  trailingAction?: ReactNode;
  /**
   * Sentrerer wordmark + søkefelt vertikalt i sin egen flex-sone (kun
   * tom-tilstanden, skjerm 1 i design-spec-en). Etter et søk vises feltet
   * øverst i normal, topp-ankret rekkefølge over resultatene (skjerm 2) —
   * se docs/design-spec/README.md.
   */
  centered?: boolean;
}

/**
 * Søket trigges eksplisitt ved submit (Enter eller søkeknapp) — det søkes
 * ikke mens man skriver (se docs/design.md#søkeflyt-tekst-og-tale).
 */
export function SearchBar({
  onSubmit,
  initialQuery = "",
  heading,
  trailingAction,
  centered = false,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === "") return;
    onSubmit(trimmed);
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="flex flex-1 flex-col"
    >
      <div
        className={
          centered
            ? "flex flex-1 flex-col items-center justify-center gap-8"
            : "flex flex-col gap-4"
        }
      >
        {heading}
        <label htmlFor="search-input" className="sr-only">
          Søk etter film eller serie
        </label>
        <div className="border-surface-border bg-surface flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5">
          <SearchGlyphIcon
            aria-hidden="true"
            className="text-text-muted h-5 w-5 shrink-0"
          />
          <input
            id="search-input"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Søk etter film eller serie"
            className="text-text-primary placeholder:text-text-muted w-full bg-transparent text-[15px] focus-visible:outline-none"
          />
        </div>
      </div>
      {/*
        Søkeknappen og mikrofonknappen (`trailingAction`) er fast plassert
        over bunn-fanebaren (78px, se components/layout/NavBar.tsx), med et
        nedtonende gradient bak for å skille dem fra innholdet som scroller
        under — samme mønster som CTA-en i TitleDetailPage.tsx. Raden er
        fortsatt en DOM-etterkommer av <form>, så submit (Enter i feltet
        eller klikk på "Søk") er upåvirket av at raden er posisjonert fast
        fremfor i normal dokumentflyt (se
        docs/design.md#søkeflyt-tekst-og-tale). Vises uavhengig av
        `centered`/søkestatus, iht. docs/design-spec/screenshots/01-sok.png.
      */}
      <div className="fixed inset-x-0 bottom-[78px] z-10 bg-gradient-to-t from-[oklch(0.13_0.03_60)] from-60% to-transparent pt-6">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pb-4">
          <button
            type="submit"
            className="bg-brand-gradient rounded-2xl px-4 py-3.5 text-[15px] font-bold text-slate-900 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white flex-1"
          >
            Søk
          </button>
          {trailingAction}
        </div>
      </div>
    </form>
  );
}

function SearchGlyphIcon(props: {
  className?: string;
  "aria-hidden"?: AriaAttributes["aria-hidden"];
}) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
