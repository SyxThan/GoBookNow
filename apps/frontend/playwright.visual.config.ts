import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/visual",
  outputDir: "test-results/visual-runs",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/redesign/visual-results.json" }],
  ],
  snapshotPathTemplate: "{testDir}/baselines/{projectName}/{arg}{ext}",
  expect: {
    toHaveScreenshot: { maxDiffPixels: 100, animations: "disabled" },
  },
  use: {
    baseURL: process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:3200",
    headless: process.env.VISUAL_HEADED !== "1",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer:
    process.env.VISUAL_START_SERVER === "1"
      ? {
          command:
            "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3200",
          url: "http://127.0.0.1:3200",
          reuseExistingServer: false,
          timeout: 60_000,
        }
      : undefined,
});
