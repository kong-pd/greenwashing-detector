// e2e/playwright.config.js
//
// Browser-level end-to-end tests for GreenCheck.
//
// `webServer` boots the REAL production topology — no mocked fetch, no
// TestClient shortcuts:
//
//   Chromium → Vite frontend (:5173) → web-service (:8000) → analysis-service (:8001)
//
// Determinism strategy (why these tests never flake and never spend a cent):
//   USE_MOCK=true        → analyzer layer 1 short-circuits before any AI call
//   SERPER_API_KEY=""    → scraper returns scraping_not_found with ZERO network
//                          (exercises the FR-04 manual-input journey for real)
//   SUPABASE_URL=:59999  → nothing listens there; the explicit 0.5s DB timeout
//                          forces the NFR-09 in-memory relay to carry results
//                          even when the OS drops rather than rejects the call
//   frontend cache       → the five demo companies exercise the zero-API path
//
// In other words: the same degradation ladder the app ships for resilience is
// what makes its E2E suite hermetic. Every fallback layer asserted here is a
// production feature, not test scaffolding.

import { defineConfig, devices } from "@playwright/test";

// setup-python exposes `python` on Windows and `python3` on Linux/macOS.
// PYTHON_EXECUTABLE lets Windows developers bypass .bat/shim launchers whose
// child process Playwright cannot reliably stop after the suite completes.
const PYTHON = process.env.PYTHON_EXECUTABLE ||
  (process.platform === "win32" ? "python" : "python3");
const NODE = process.execPath;
const BROWSER_CHANNEL = process.env.PLAYWRIGHT_CHANNEL;
const quote = (value) => `"${String(value).replaceAll('"', '\\"')}"`;

// JWT-shaped but cryptographically meaningless — supabase-py validates the
// *shape* of the anon key at client init, so a bare "placeholder" string
// would crash create_client before our connection-refused trick kicks in.
const FAKE_SUPABASE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJyb2xlIjoiYW5vbiIsImlzcyI6ImUyZS1wbGFjZWhvbGRlciJ9." +
  "e2e-signature-placeholder";

// Shared by both Python services. Merged over process.env by Playwright,
// and load_dotenv() never overrides existing env vars — so a developer's
// real .env with live keys can sit in the repo without leaking into E2E.
const PY_ENV = {
  USE_MOCK: "true",
  SUPABASE_URL: "http://127.0.0.1:59999", // closed port → instant ConnectError
  SUPABASE_ANON_KEY: FAKE_SUPABASE_JWT,
  SERPER_API_KEY: "",   // empty → scraper skips search entirely (zero network)
  GUARDIAN_API_KEY: "", // empty → enricher skips Guardian     (zero network)
  GEMINI_API_KEY: "",
  GROQ_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  ANALYSIS_SERVICE_URL: "http://127.0.0.1:8001",
  CACHE_TTL_HOURS: "24",
  SUPABASE_TIMEOUT_SECONDS: "0.5",
};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // the three shared servers hold cross-test state (relay FIFO)
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  // The loading screen animates a fixed ~6.4s pipeline before it will hand
  // off to the report, and live polls tick every 3s — so per-assertion
  // budgets need headroom above Playwright's 5s default.
  timeout: 60_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{
    name: BROWSER_CHANNEL || "chromium",
    use: {
      ...devices["Desktop Chrome"],
      ...(BROWSER_CHANNEL ? { channel: BROWSER_CHANNEL } : {}),
    },
  }],

  // Local Windows runners can own the processes externally to avoid shell/
  // shim shutdown issues. CI and the default command still use this topology.
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVERS ? [] : [
    {
      command: `${quote(PYTHON)} -m uvicorn main:app --port 8000`,
      cwd: "../backend",
      url: "http://127.0.0.1:8000/health",
      env: PY_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `${quote(PYTHON)} -m uvicorn main:app --port 8001`,
      cwd: "../analysis",
      url: "http://127.0.0.1:8001/health",
      env: PY_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // --host 127.0.0.1: Vite's default `localhost` bind can resolve to
      // IPv6 (::1) on CI runners while the health check below probes IPv4 —
      // the check then never passes and webServer times out at 60s.
      command: `${quote(NODE)} node_modules/vite/bin/vite.js --port 5173 --strictPort --host 127.0.0.1`,
      cwd: "../frontend",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
