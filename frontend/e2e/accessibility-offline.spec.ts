import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const unauthenticated = {
  status: 401,
  contentType: "application/json",
  body: JSON.stringify({ detail: "Authentication required." }),
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/me/", (route) => route.fulfill(unauthenticated));
});

test("public learning information has no serious automated accessibility violations", async ({
  page,
}) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: /Built around the gap/ })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});

test("the public learning hero remains visually stable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop baseline has the canonical snapshot.");
  await page.goto("/about");
  const hero = page.locator(".public-hero");
  await expect(hero).toBeVisible();
  await expect(hero).toHaveScreenshot("about-learning-hero.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.05,
  });
});

test("public learning remains readable through portrait and landscape changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about");
  const heading = page.getByRole("heading", { name: /Technical confidence starts/ });
  await expect(heading).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(heading).toBeVisible();
  await expect(page.locator("main")).not.toHaveCSS("overflow-x", "scroll");
});

test("the keyboard skip link transfers focus to main content", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: /Technical confidence starts/ })).toBeVisible();
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("the loaded application shell keeps client routes usable during an outage", async ({
  context,
  page,
}) => {
  await page.goto("/about");
  await context.setOffline(true);
  await page.getByRole("link", { name: "Support centre", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Get back to the workshop safely." }),
  ).toBeVisible();
});
