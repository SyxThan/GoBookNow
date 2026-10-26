import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBrowserEnvironment } from "../backend/dist-browser/test/browser/environment.js";

loadBrowserEnvironment();
const frontend = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  testDir: "./e2e/journey",
  testMatch: "**/*.e2e.spec.ts",
  // Backend fixtures are already compiled by tsc. Load them as native Node
  // modules rather than applying Playwright's test-file module transform.
  build: { external: ["**/dist-browser/**"] },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: "./e2e/journey/global-setup.ts",
  outputDir: "./test-results/journey",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/journey", open: "never" }],
    ["junit", { outputFile: "test-results/journey.xml" }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    timezoneId: "Asia/Ho_Chi_Minh",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // Screenshots + trace provide diagnostics without recording QR video.
    serviceWorkers: "block",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "node dist-browser/test/browser/server.js",
      cwd: path.resolve(frontend, "../backend"),
      url: `${process.env.BACKEND_BASE_URL}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    ...[
      [frontend, process.env.E2E_BASE_URL!, "CUSTOMER_PORT"],
      [
        path.resolve(frontend, "../vendor-portal"),
        process.env.VENDOR_E2E_BASE_URL!,
        "VENDOR_PORT",
      ],
      [
        path.resolve(frontend, "../admin-console"),
        process.env.ADMIN_E2E_BASE_URL!,
        "ADMIN_PORT",
      ],
    ].map(([cwd, origin, variable]) => ({
      command: "pnpm start",
      cwd,
      url: `${origin}/login`,
      env: {
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        [variable]: new URL(origin).port,
      },
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe" as const,
      stderr: "pipe" as const,
    })),
  ],
});
