import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InstructorCompetenciesPage } from "./InstructorCompetenciesPage";

afterEach(() => vi.unstubAllGlobals());

function stubOverview(competencies: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          metrics: {
            learners: 2,
            assignments: 2,
            attempts: 2,
            completedAttempts: 2,
            inProgressAttempts: 0,
            safetyErrors: 0,
          },
          attempts: [],
          competencies,
          operationalAnalytics: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <InstructorCompetenciesPage />
    </QueryClientProvider>,
  );
}

describe("InstructorCompetenciesPage", () => {
  it("orders competencies by weakest mastery first", async () => {
    stubOverview([
      {
        code: "AUTO-SAFE-01",
        title: "Prepare the vehicle electrical system safely",
        attempts: 4,
        mastered: 4,
        developing: 0,
        notDemonstrated: 0,
        requiresReview: 0,
      },
      {
        code: "AUTO-DIAG-01",
        title: "Perform a structured battery diagnosis",
        attempts: 4,
        mastered: 1,
        developing: 2,
        notDemonstrated: 0,
        requiresReview: 1,
      },
    ]);

    renderPage();

    const rows = await screen.findAllByRole("listitem");
    // The weaker competency must come first so the teaching decision is at the top.
    expect(within(rows[0]).getByText("AUTO-DIAG-01")).toBeVisible();
    expect(within(rows[1]).getByText("AUTO-SAFE-01")).toBeVisible();
    expect(within(rows[0]).getByText("25% mastered")).toBeVisible();
    expect(within(rows[1]).getByText("100% mastered")).toBeVisible();
  });

  it("describes every band for assistive technology", async () => {
    stubOverview([
      {
        code: "AUTO-DIAG-01",
        title: "Perform a structured battery diagnosis",
        attempts: 4,
        mastered: 1,
        developing: 2,
        notDemonstrated: 0,
        requiresReview: 1,
      },
    ]);

    renderPage();

    expect(
      await screen.findByRole("img", {
        name: "1 mastered, 2 developing, 0 not demonstrated, 1 requires review",
      }),
    ).toBeVisible();
  });

  it("explains the empty state rather than rendering a bare list", async () => {
    stubOverview([]);

    renderPage();

    expect(
      await screen.findByRole("heading", { name: /no competency evidence yet/i }),
    ).toBeVisible();
  });
});
