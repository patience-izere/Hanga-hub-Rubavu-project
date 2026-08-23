import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const startedAt = "2026-08-22T08:00:00Z";

const procedureSteps = [
  {
    id: 11,
    order: 1,
    code: "confirm-ppe",
    title: "Confirm protective equipment",
    instruction: "Confirm eye protection before approaching the training rig.",
    action_code: "confirm_ppe",
    feedback: "Protective equipment confirmed.",
    safety_critical: true,
    points: 10,
    metadata: {},
    acceptable_actions: [
      { action_code: "confirm_ppe", label: "Confirm PPE", is_primary: true, tolerance: null },
    ],
    hints: [],
    tolerances: [],
    tools: [],
    hazards: [
      {
        code: "eye-protection",
        title: "Eye protection required",
        description: "Wear approved eye protection.",
        mitigation: "Stop until eye protection is confirmed.",
        severity: "high",
      },
    ],
    feedback_rules: {},
    competency_codes: ["AUTO-SAFE-01"],
  },
  {
    id: 12,
    order: 2,
    code: "inspect-terminals",
    title: "Inspect the terminals",
    instruction: "Inspect both battery terminals for damage or contamination.",
    action_code: "inspect_terminals",
    feedback: "Terminal inspection recorded.",
    safety_critical: false,
    points: 10,
    metadata: {},
    acceptable_actions: [
      {
        action_code: "inspect_terminals",
        label: "Inspect terminals",
        is_primary: true,
        tolerance: null,
      },
    ],
    hints: [],
    tolerances: [],
    tools: [],
    hazards: [],
    feedback_rules: {},
    competency_codes: ["AUTO-DIAG-01"],
  },
];

const attemptSummary = {
  id: 42,
  status: "in_progress",
  outcome: "pending",
  score: null,
  scenario_version: 3,
  grading_policy_code: "battery-safe-v1",
  grading_policy_version: 1,
  resume_state: { completedSteps: [], currentStep: "confirm-ppe" },
  renderer_mode: "accessible_2d",
  learning_mode: "guided",
  capability_profile: { secureContext: true },
  started_at: startedAt,
  completed_at: null,
  updated_at: startedAt,
};

const assignment = {
  id: 7,
  available_at: null,
  due_at: null,
  attempt_limit: 3,
  instructions: "Use only the approved de-energized training rig.",
  created_at: startedAt,
  latest_attempt: attemptSummary,
  attempt_history: [attemptSummary],
  scenario: {
    id: 5,
    version: 3,
    title: "Battery inspection WebAR",
    grading_policy: {
      code: "battery-safe-v1",
      version: 1,
      algorithm: "ordered_steps_v1",
      base_score: 100,
      pass_threshold: 70,
      incorrect_action_penalty: 5,
      safety_critical_penalty: 20,
      requires_review_on_safety_error: true,
    },
    asset_package: null,
    renderer_config: {
      marker_ar: { enabled: true, targetType: "qr", targetValue: "OPEDU-BATTERY-V3" },
      markerless_ar: {},
      accessible_2d: {},
      desktop_3d: {},
    },
  },
  lesson: {
    id: 9,
    title: "Battery Inspection and Diagnosis",
    slug: "battery-inspection",
    summary: "Inspect a controlled battery training rig safely.",
    objectives: ["Apply the approved inspection sequence."],
    safety_notes: ["Use only a de-energized, instructor-approved rig."],
    estimated_minutes: 20,
    language: "en",
    content_version: 3,
    course_title: "Automotive Electrical Foundations",
    trade: "Automobile Technology",
    program: null,
    module: null,
    competencies: [],
    prerequisites: [],
    procedure_steps: procedureSteps,
  },
};

const attemptDetail = {
  ...attemptSummary,
  assignment,
  events: [],
  step_results: [],
  competency_results: [],
  feedback: [],
  recommendation: null,
};

type AcceptedAction = {
  eventId: string;
  action: string;
  metadata: Record<string, unknown>;
};

async function mockLearningApi(page: Page, acceptedActions: AcceptedAction[] = []) {
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill(
      json({
        user: {
          id: 17,
          email: "learner@opedu.local",
          username: "learner@opedu.local",
          firstName: "Offline",
          lastName: "Learner",
          organization: "Rubavu Demo Technical School",
          isStaff: false,
          roles: ["learner"],
        },
      }),
    ),
  );
  await page.route("**/api/v1/auth/csrf/", (route) =>
    route.fulfill(json({ detail: "CSRF cookie set." })),
  );
  await page.route("**/api/v1/assignments/7/knowledge-check/", (route) =>
    route.fulfill(
      json({
        id: 4,
        answers: [],
        score: "100.00",
        submitted_at: startedAt,
      }),
    ),
  );
  await page.route("**/api/v1/assignments/7/", (route) => route.fulfill(json(assignment)));
  await page.route("**/api/v1/attempts/42/", (route) => route.fulfill(json(attemptDetail)));
  await page.route("**/api/v1/attempts/42/renderer/", async (route) => {
    const body = route.request().postDataJSON() as {
      rendererMode?: typeof attemptSummary.renderer_mode;
      learningMode?: typeof attemptSummary.learning_mode;
      capabilityProfile?: Record<string, unknown>;
    };
    await route.fulfill(
      json({
        ...attemptSummary,
        renderer_mode: body.rendererMode ?? attemptSummary.renderer_mode,
        learning_mode: body.learningMode ?? attemptSummary.learning_mode,
        capability_profile: body.capabilityProfile ?? attemptSummary.capability_profile,
      }),
    );
  });
  await page.route("**/api/v1/attempts/42/events/batch/", (route) => route.fulfill(json([])));
  await page.route("**/api/v1/attempts/42/sync-audit/", async (route) => {
    const body = route.request().postDataJSON() as {
      eventIds: string[];
      pendingCount: number;
      clientCreatedAt: string;
    };
    await route.fulfill(
      json(
        {
          audit_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          client_event_ids: body.eventIds,
          server_event_ids: body.eventIds,
          missing_event_ids: [],
          pending_count: body.pendingCount,
          passed: body.pendingCount === 0,
          client_created_at: body.clientCreatedAt,
          audited_at: new Date().toISOString(),
        },
        201,
      ),
    );
  });
  await page.route("**/api/v1/attempts/42/actions/", async (route) => {
    const body = route.request().postDataJSON() as AcceptedAction;
    acceptedActions.push(body);
    const completedSteps = acceptedActions.map((_item, index) => procedureSteps[index].code);
    const currentStep = procedureSteps[acceptedActions.length] ?? null;
    await route.fulfill(
      json({
        correct: true,
        message: "Evidence accepted.",
        currentStep,
        isReadyToComplete: currentStep === null,
        attempt: {
          ...attemptSummary,
          resume_state: { completedSteps, currentStep: currentStep?.code ?? null },
        },
      }),
    );
  });
  await page.route("**/api/v1/attempts/42/complete/", (route) =>
    route.fulfill(
      json({
        attempt: {
          ...attemptDetail,
          status: "completed",
          outcome: "mastered",
          score: "100.00",
          completed_at: "2026-08-22T08:20:00Z",
          resume_state: {
            completedSteps: procedureSteps.map((step) => step.code),
            currentStep: null,
          },
        },
      }),
    ),
  );
}

async function openAttempt(page: Page) {
  await page.goto("/attempts/42");
  await expect(page.getByRole("heading", { name: assignment.lesson.title })).toBeVisible();
}

async function installFakeCamera(page: Page, mode: "available" | "denied") {
  await page.addInitScript((cameraMode) => {
    const canvas = document.createElement("canvas");
    const stream = canvas.captureStream(5);
    Object.defineProperty(window, "__opeduTestCameraStream", { value: stream });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (cameraMode === "denied") {
            throw new DOMException("Permission denied", "NotAllowedError");
          }
          return stream;
        },
      },
    });
    HTMLMediaElement.prototype.play = async () => undefined;
  }, mode);
}

function mobileOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== "mobile-chromium", "This is a mobile-browser gate.");
}

async function setApplicationOffline(page: Page, offline: boolean) {
  await page.evaluate((isOffline) => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: !isOffline,
    });
    window.dispatchEvent(new Event(isOffline ? "offline" : "online"));
  }, offline);
}

test("a downloaded lesson completes through a full outage and replays every action once", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The canonical offline replay runs on desktop.");
  const acceptedActions: AcceptedAction[] = [];
  await mockLearningApi(page, acceptedActions);

  await page.goto("/assignments/7");
  await expect(page.getByRole("heading", { name: assignment.lesson.title })).toBeVisible();
  await page.getByRole("button", { name: "Prepare for offline use" }).click();
  await expect(page.getByText("3 files saved for offline use.")).toBeVisible();
  await page.getByRole("link", { name: "Open simulation" }).click();
  // The simulation route lazy-loads the Three.js chunk; allow for parallel CI worker contention.
  await expect(page.getByLabel("0 of 2 steps complete")).toBeVisible({ timeout: 15_000 });
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/attempts/42/renderer/")),
    page.getByRole("button", { name: /^Accessible 2D/ }).click(),
  ]);

  const rejectedBackendRequests: string[] = [];
  const rejectBackend = (route: Route) => {
    rejectedBackendRequests.push(route.request().url());
    return route.abort("internetdisconnected");
  };
  await page.route("**/api/v1/**", rejectBackend);
  await setApplicationOffline(page, true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(page.locator(".sync-banner")).toContainText("Offline");
  await page.getByRole("button", { name: /Confirm protective equipment/ }).click();
  await expect(page.getByLabel("1 of 2 steps complete")).toBeVisible();
  expect(rejectedBackendRequests).toEqual([]);
  await page.getByRole("button", { name: /Inspect the terminals/ }).click();
  await expect(page.getByLabel("2 of 2 steps complete")).toBeVisible();
  await expect(page.locator(".sync-banner")).toContainText("2 evidence item(s) pending");
  await expect(
    page.getByRole("button", { name: "Synchronize evidence before scoring" }),
  ).toBeDisabled();

  await page.unroute("**/api/v1/**", rejectBackend);
  await setApplicationOffline(page, false);
  await expect(page.locator(".sync-banner")).toContainText("Online");
  await expect(page.locator(".sync-banner")).toContainText("Evidence synchronized");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(250);

  expect(acceptedActions).toHaveLength(2);
  expect(new Set(acceptedActions.map((item) => item.eventId)).size).toBe(2);
  expect(acceptedActions.map((item) => item.action)).toEqual(["confirm_ppe", "inspect_terminals"]);
  for (const item of acceptedActions) {
    expect(item.metadata).toEqual(
      expect.objectContaining({
        scenarioVersion: 3,
        rendererMode: "accessible_2d",
        synchronizedFromOutbox: true,
      }),
    );
  }

  await page.getByRole("button", { name: "Complete and view result" }).click();
  await expect(page.getByText("Attempt complete")).toBeVisible();
  await expect(page.getByLabel("Score 100.00 percent")).toBeVisible();
  expect(acceptedActions).toHaveLength(2);
});

test("mobile Camera AR survives orientation change and camera interruption without losing progress", async ({
  page,
}, testInfo) => {
  mobileOnly(testInfo);
  await installFakeCamera(page, "available");
  await mockLearningApi(page);
  await openAttempt(page);

  await page.getByRole("button", { name: /^Camera AR/ }).click();
  await page.getByRole("checkbox", { name: /I confirm the rig is de-energized/ }).check();
  await page.getByRole("button", { name: "Enable camera and enter AR" }).click();
  await expect(page.getByText("Find the training marker")).toBeVisible();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByText("Find the training marker")).toBeVisible();
  await expect(page.getByLabel("0 of 2 steps complete")).toBeVisible();
  await page.evaluate(() => {
    const stream = (window as typeof window & { __opeduTestCameraStream: MediaStream })
      .__opeduTestCameraStream;
    stream.getVideoTracks()[0].dispatchEvent(new Event("ended"));
  });

  await expect(page.getByRole("alert")).toContainText("camera was interrupted");
  await expect(page.getByLabel("0 of 2 steps complete")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Accessible 2D/ })).toBeEnabled();
});

test("mobile camera denial exposes an equivalent fallback and retains the attempt", async ({
  page,
}, testInfo) => {
  mobileOnly(testInfo);
  await installFakeCamera(page, "denied");
  await mockLearningApi(page);
  await openAttempt(page);

  await page.getByRole("button", { name: /^Camera AR/ }).click();
  await page.getByRole("checkbox", { name: /I confirm the rig is de-energized/ }).check();
  await page.getByRole("button", { name: "Enable camera and enter AR" }).click();
  await expect(page.getByRole("alert")).toContainText("Camera permission was denied");
  await page.getByRole("button", { name: /^Accessible 2D/ }).click();

  await expect(page.getByRole("region", { name: "Accessible lesson" })).toBeVisible();
  await expect(page.getByLabel("0 of 2 steps complete")).toBeVisible();
});
