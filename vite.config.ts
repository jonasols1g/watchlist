import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defaultExclude, defineConfig, type Plugin } from "vitest/config";

// Content-Security-Policy som <meta http-equiv>, injisert kun ved build
// (GitHub Pages støtter ikke egendefinerte HTTP-headere, se
// docs/architecture.md#robusthet-og-sikkerhet). `apply: "build"` sikrer at
// dette ikke kjører i dev-modus, der Vites dev-server injiserer CSS via
// inline <style>-tagger for HMR (live-reload) — noe `style-src 'self'`
// uten `unsafe-inline` ville blokkert. Fase 1-9 gjør ingen ekte
// nettverkskall og laster ingen eksterne ressurser (MockMediaProvider er
// lokal, plakat-URL-ene i mock-dataene er ikke ekte); CSP-en er derfor
// låst til 'self'. Fase 10 utvider connect-src/img-src med OMDb-/
// MOTN-domenene når CompositeMediaProvider tas i bruk.
//
// Fase 11 (CineFind-temaet) laster Space Grotesk/Manrope fra Google Fonts:
// stilarket ligger på fonts.googleapis.com (style-src), selve fontfilene
// lastes derfra videre fra fonts.gstatic.com (font-src).
//
// Fase 10 (ekte API-integrasjon) legger til domenene for OMDb og MOTN i
// connect-src (selve API-kallene) og img-src (plakater/logoer) — se
// docs/architecture.md#robusthet-og-sikkerhet. OMDbs plakat-URL-er peker på
// Amazons bilde-CDN (m.media-amazon.com), ikke på omdbapi.com; MOTN-domenet
// trengs kun for strømmetjenestenes logoer.
//
// DB-migrering issue A (se docs/plans/watchlist-database-migrering.md)
// legger til Firebase-domenene i connect-src: Firestore
// (firestore.googleapis.com) og Anonymous Auth
// (identitytoolkit.googleapis.com for innlogging,
// securetoken.googleapis.com for token-fornyelse). `firebaseClient.ts` er
// ikke i bruk fra noe sted i produksjonskoden ennå (kommer i issue B/C),
// så disse domenene gir ingen ekte trafikk før da.
function cspMetaTagPlugin(): Plugin {
  return {
    name: "csp-meta-tag",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content:
              "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://m.media-amazon.com https://media.movieofthenight.com; connect-src 'self' https://www.omdbapi.com https://api.movieofthenight.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; base-uri 'self'; form-action 'self'",
          },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: "/streamie/",
  plugins: [react(), tailwindcss(), cspMetaTagPlugin()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setupTests.ts"],
    // Playwright-spec-ene i e2e/ matcher også `*.spec.ts` — uten denne
    // ekskluderingen forsøker Vitest å kjøre dem og feiler kryptisk.
    exclude: [...defaultExclude, "e2e/**"],
  },
});
