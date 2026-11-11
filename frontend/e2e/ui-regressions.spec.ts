import { expect, test } from "@playwright/test";

// Regression checks for the issues in docs/qa/2026-11-11-production-qa.md.

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"user":null}' }),
  );
});

test("a footer link opens the next page at the top (N-1)", async ({ page }) => {
  await page.goto("/about");
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.locator("footer").getByRole("link", { name: "Contact" }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("the public menu marks the current page (N-2)", async ({ page }) => {
  await page.goto("/features");
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", {
      name: "Features",
    }),
  ).toHaveAttribute("aria-current", "page");
});

test("phones get a menu button for the public pages (N-3)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const about = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", {
    name: "About",
  });
  await expect(about).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(about).toBeVisible();
  await about.click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("an unknown address shows a page-not-found page (N-4)", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByRole("heading", { name: /can.t find that page/i })).toBeVisible();
  await expect(page).toHaveURL(/this-page-does-not-exist$/);
});

test("the sign-in password can be shown and hidden (A-3)", async ({ page }) => {
  await page.goto("/login");
  const field = page.locator("#password");
  await field.fill("secret-words");
  await expect(field).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: /Show password/ }).click();
  await expect(field).toHaveAttribute("type", "text");
});

test("the address is Kigali and there is no 'Open class' label (U-5, U-6)", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.locator("body")).not.toContainText("Rubavu");
  await expect(page.locator("footer")).toContainText("Kigali");
  await expect(page.locator("header")).not.toContainText("Open class");
});

test("languages are named, not shown as codes (U-7)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Language").first().locator("option")).toContainText([
    "English",
    "Kinyarwanda",
    "Français",
    "Kiswahili",
  ]);
});

test("page titles stay at a readable size (U-1)", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/about");
    const size = await page
      .locator("h1")
      .first()
      .evaluate((heading) => parseFloat(getComputedStyle(heading).fontSize));
    expect(size).toBeLessThanOrEqual(width > 800 ? 56 : 36);
  }
});

test("the contact form sends the message to OPedu (F-5)", async ({ page }) => {
  let sent: Record<string, string> | null = null;
  await page.route("**/api/v1/auth/csrf/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"detail":"ok"}' }),
  );
  await page.route("**/api/v1/contact/", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Thank you. Your message reached the OPedu team." }),
    });
  });
  await page.goto("/contact");
  await page.getByLabel("Name").fill("Aline");
  await page.getByLabel("Email").fill("aline@example.com");
  await page.getByLabel("Message").fill("We would like a pilot.");
  await page.getByRole("button", { name: /Send message/ }).click();
  await expect(page.getByRole("status")).toContainText("reached the OPedu team");
  expect(sent).toMatchObject({ name: "Aline", email: "aline@example.com" });
});

test("being signed out does not log a failed request (Q-1)", async ({ page }) => {
  const failures: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  expect(failures).toEqual([]);
});
