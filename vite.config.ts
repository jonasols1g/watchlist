import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defaultExclude, defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  base: "/watchlist/",
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setupTests.ts"],
    // Playwright-spec-ene i e2e/ matcher også `*.spec.ts` — uten denne
    // ekskluderingen forsøker Vitest å kjøre dem og feiler kryptisk.
    exclude: [...defaultExclude, "e2e/**"],
  },
});
