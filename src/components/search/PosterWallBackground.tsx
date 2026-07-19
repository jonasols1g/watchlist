const POSTER_COUNT = 16;

/**
 * Dekorativ «plakatvegg»-bakgrunn for forsidens tom-tilstand (`isIdle` i
 * HomePage.tsx), se docs/design-spec/README.md#screen-1 og issue #44 for
 * eksakt CSS-fasit (`.cf-bg`/`.cf-posters`/`.cf-poster`/`.cf-haze` i
 * src/index.css). Rent visuelt element uten informasjonsverdi, derfor
 * `aria-hidden="true"` på rotnoden.
 */
export function PosterWallBackground() {
  return (
    <div className="cf-bg" aria-hidden="true">
      <div className="cf-posters">
        {Array.from({ length: POSTER_COUNT }).map((_, index) => (
          <div key={index} className="cf-poster" />
        ))}
      </div>
      <div className="cf-haze" />
    </div>
  );
}
