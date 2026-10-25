import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL || new URL(baseURL).protocol !== "https:") {
  throw new Error(
    "Smoke suite requires an explicit HTTPS staging E2E_BASE_URL",
  );
}
export default defineConfig({
  testDir: "./e2e/smoke",
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/smoke", open: "never" }],
  ],
  use: { baseURL, screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
