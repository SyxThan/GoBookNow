import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/visual",
  outputDir: "test-results/visual-runs",
  fullyParallel: false,
  workers: 2,
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
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "laptop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
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
      ? [
          [".", "3200", "CUSTOMER_PORT"],
          ["../vendor-portal", "3202", "VENDOR_PORT"],
          ["../admin-console", "3203", "ADMIN_PORT"],
        ].map(([cwd, port, variable]) => ({
          command: "pnpm start",
          env: {
            NODE_ENV: "production",
            HOSTNAME: "127.0.0.1",
            [variable]: port,
          },
          cwd,
          url: `http://127.0.0.1:${port}/login`,
          reuseExistingServer: false,
          timeout: 60_000,
        }))
      : undefined,
});
