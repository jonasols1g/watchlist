import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// `test.globals` er ikke slått på (se vite.config.ts) — testfilene importerer
// `afterEach` osv. eksplisitt fra "vitest". Da finner ikke Testing Librarys
// egen auto-cleanup (som sjekker `typeof afterEach === "function"` på
// modulnivå) en global `afterEach`, og komponenter fra tidligere tester blir
// stående i DOM-treet. Rydd derfor eksplisitt her, felles for alle tester.
afterEach(() => {
  cleanup();
});
