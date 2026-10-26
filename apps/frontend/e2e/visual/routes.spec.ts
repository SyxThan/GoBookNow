import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installVisualFixtures, routes } from "./fixtures";

for (const [name, path, heading] of routes) {
  test(`${name}: layout, Vietnamese font, accessibility and screenshot`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (!name.endsWith("not-found") && message.type() === "error")
        errors.push(message.text());
    });
    await installVisualFixtures(page);
    await page.clock.install({ time: new Date("2099-10-25T12:00:00Z") });
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: heading, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Đang tải nội dung" }),
    ).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    // Wait for client data, including the account-dependent workspace shell.
    await expect
      .poll(() => page.locator("main").innerText())
      .not.toMatch(/^Đang tải/);
    await page.waitForTimeout(450);
    expect(errors).toEqual([]);
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      font: getComputedStyle(document.body).fontFamily,
      fontReady: document.fonts.check(
        '400 16px "Be Vietnam Pro"',
        "Tiếng Việt: Ắ Ề Ỗ Ự đ ỹ",
      ),
    }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.font).toContain("Be Vietnam Pro");
    expect(geometry.fontReady).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      accessibility.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      mask: [page.locator("[data-countdown]")],
    });
    await page.screenshot({
      path: `test-results/redesign/review/${testInfo.project.name}/${name}.png`,
      fullPage: true,
    });
  });
}
