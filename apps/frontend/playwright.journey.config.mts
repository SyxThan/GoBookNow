import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBrowserEnvironment } from "../backend/dist-browser/test/browser/environment.js";

loadBrowserEnvironment();
const frontend = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  testDir: "./e2e/journey",
  testMatch: "**/*.e2e.spec.ts",
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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
    {
      command: `pnpm start --hostname 127.0.0.1 --port ${new URL(process.env.E2E_BASE_URL!).port}`,
      cwd: frontend,
      url: `${process.env.E2E_BASE_URL}/register`,
      env: { NODE_ENV: "production" },
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
