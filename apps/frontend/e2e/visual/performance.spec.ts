import { test, expect } from "@playwright/test";
import { installVisualFixtures } from "./fixtures";

test("record production browser performance with synthetic catalog", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const samples: unknown[] = [];
  for (let index = 0; index < 3; index++) {
    const context = await browser.newContext({
      viewport: testInfo.project.use.viewport,
      locale: "vi-VN",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await installVisualFixtures(page);
    await page.addInitScript(() => {
      sessionStorage.clear();
      const metrics = { lcp: 0, cls: 0 };
      (window as unknown as { __metrics: typeof metrics }).__metrics = metrics;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
        })[])
          if (!entry.hadRecentInput) metrics.cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(testInfo.project.use.baseURL!);
    await page
      .getByRole("link", {
        name: "Một buổi làm gốm, một chút bình yên",
        exact: true,
      })
      .waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    const sample = await page.evaluate(() => {
      const entries = performance.getEntriesByType(
        "resource",
      ) as PerformanceResourceTiming[];
      const sum = (filter: (resource: PerformanceResourceTiming) => boolean) =>
        entries
          .filter(filter)
          .reduce((total, resource) => total + resource.encodedBodySize, 0);
      return {
        ...(window as unknown as { __metrics: { lcp: number; cls: number } })
          .__metrics,
        navigationMs: (
          performance.getEntriesByType(
            "navigation",
          )[0] as PerformanceNavigationTiming
        ).domContentLoadedEventEnd,
        jsEncodedBytes: sum((resource) => resource.initiatorType === "script"),
        fontEncodedBytes: sum((resource) =>
          /\.woff2(?:$|\?)/.test(resource.name),
        ),
        resourceCount: entries.length,
      };
    });
    expect(sample.lcp).toBeGreaterThan(0);
    samples.push(sample);
    await context.close();
  }
  await testInfo.attach(`performance-${testInfo.project.name}.json`, {
    body: JSON.stringify(
      {
        environment:
          "Local production build, loopback, fresh browser context per sample, synthetic API catalog, no CPU/network throttle. Not Lighthouse or field CWV.",
        samples,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
