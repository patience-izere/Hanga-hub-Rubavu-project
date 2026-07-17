import { expect, test, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function authenticated(page: Page, roles: string[]) {
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill(
      json({
        user: {
          id: 1,
          email: "admin@opedu.local",
          username: "admin@opedu.local",
          firstName: "Demo",
          lastName: "Administrator",
          organization: "Rubavu Demo Technical School",
          isStaff: true,
          roles,
        },
      }),
    ),
  );
}

test("signed-out users can reach password recovery", async ({ page }) => {
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill(json({ detail: "Authentication required." }, 401)),
  );
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
});

test("controlled onboarding and support are public React routes", async ({ page }) => {
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill(json({ detail: "Authentication required." }, 401)),
  );
  await page.goto("/onboarding");
  await expect(
    page.getByRole("heading", { name: "Join your school's learning space." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Support", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Get back to the workshop safely." }),
  ).toBeVisible();
});

test("a learner can sign in, reach a protected route, and sign out", async ({ page }) => {
  const learner = {
    id: 7,
    email: "learner@opedu.local",
    username: "learner@opedu.local",
    firstName: "Demo",
    lastName: "Learner",
    organization: "Rubavu Demo Technical School",
    isStaff: false,
    roles: ["learner"],
  };
  let signedOut = false;
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill(json({ detail: "Authentication required." }, 401)),
  );
  await page.route("**/api/v1/auth/csrf/", (route) =>
    route.fulfill(json({ detail: "CSRF cookie set." })),
  );
  await page.route("**/api/v1/auth/login/", async (route) => {
    const credentials = route.request().postDataJSON();
    expect(credentials).toEqual({
      email: "learner@opedu.local",
      password: "learning-pass-123",
    });
    await route.fulfill(json({ user: learner }));
  });
  await page.route("**/api/v1/auth/logout/", async (route) => {
    signedOut = true;
    await route.fulfill(json({ detail: "Signed out." }));
  });
  await page.route("**/api/v1/assignments/", (route) =>
    route.fulfill(json({ count: 0, next: null, previous: null, results: [] })),
  );

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill("learner@opedu.local");
  await page.getByLabel("Password").fill("learning-pass-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Good to see you, Demo/ })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(signedOut).toBe(true);
});

test("school administrators can open membership management", async ({ page }) => {
  await authenticated(page, ["admin"]);
  await page.route("**/api/v1/instructor/overview/", (route) =>
    route.fulfill(
      json({
        metrics: {
          learners: 1,
          assignments: 1,
          attempts: 0,
          completedAttempts: 0,
          inProgressAttempts: 0,
          safetyErrors: 0,
        },
        attempts: [],
      }),
    ),
  );
  await page.route("**/api/v1/school/members/", (route) => route.fulfill(json([])));
  await page.route("**/api/v1/school/invitations/", (route) => route.fulfill(json([])));
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Manage school access" }).click();
  await expect(page.getByRole("heading", { name: "People and access." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invite a person" })).toBeVisible();
});

test("learners cannot open the school administration route", async ({ page }) => {
  await authenticated(page, ["learner"]);
  await page.route("**/api/v1/assignments/", (route) =>
    route.fulfill(json({ count: 0, next: null, previous: null, results: [] })),
  );
  await page.goto("/school/admin");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Good to see you/ })).toBeVisible();
});

test("an instructor sees a safe error when cross-school evidence is forbidden", async ({
  page,
}) => {
  await authenticated(page, ["instructor"]);
  await page.route("**/api/v1/instructor/overview/", (route) =>
    route.fulfill(
      json({
        metrics: {
          learners: 1,
          assignments: 1,
          attempts: 1,
          completedAttempts: 0,
          inProgressAttempts: 1,
          safetyErrors: 0,
        },
        attempts: [
          {
            id: 91,
            learner: { id: 22, name: "Other Learner", email: "other@example.com" },
            lesson: { id: 4, title: "Battery diagnosis", trade: "Automotive" },
            status: "in_progress",
            score: null,
            completed_steps: 1,
            total_steps: 4,
            incorrect_actions: 0,
            safety_errors: 0,
          },
        ],
      }),
    ),
  );
  await page.route("**/api/v1/instructor/attempts/91/", (route) =>
    route.fulfill(json({ detail: "Attempt not found." }, 404)),
  );

  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Review evidence" }).click();
  await expect(page.getByRole("alert")).toHaveText("Attempt evidence is unavailable.");
});
