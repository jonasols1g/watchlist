import { defineConfig, devices } from "@playwright/test";

// E2E kjører alltid mot produksjonsbygget (vite preview), aldri dev-serveren:
// `base: '/streamie/'`, `basename` og 404.html-fallbacken finnes kun i bygget app.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html"], ["github"]] : "html",
  use: {
    baseURL: "http://localhost:4173/streamie/",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4173/streamie/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
