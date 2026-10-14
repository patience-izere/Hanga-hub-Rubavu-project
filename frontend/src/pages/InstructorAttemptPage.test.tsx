import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InstructorAttemptPage } from "./InstructorAttemptPage";

afterEach(() => vi.unstubAllGlobals());

const review = {
  id: 9,
  learner: { id: 3, name: "Aline", email: "aline@example.com" },
  lesson: { id: 1, title: "Battery inspection", courseTitle: "Auto", trade: "Automobile" },
  status: "requires_review",
  outcome: "requires_review",
  score: "85.00",
  review_decision: "",
  has_published_feedback: false,
  scenario_version: 1,
  grading_policy_code: "standard",
  grading_policy_version: 1,
  completed_steps: 2,
  total_steps: 2,
  incorrect_actions: 1,
  safety_errors: 1,
  due_at: null,
  is_overdue: false,
  is_blocked: false,
  started_at: "2026-10-01T08:00:00Z",
  completed_at: "2026-10-01T08:10:00Z",
  updated_at: "2026-10-01T08:10:00Z",
  procedure_steps: [],
  events: [],
  step_results: [],
  competency_results: [],
  feedback: [],
  recommendations: [],
  pass_threshold: 70,
  review_note: "",
  reviewed_by_name: "",
  reviewed_at: null,
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("InstructorAttemptPage", () => {
  it("lets an instructor sign off an attempt held for review", async () => {
    const posted: unknown[] = [];
    let current: Record<string, unknown> = review;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/auth/csrf/")) return json({ detail: "ok" });
        if (url.endsWith("/instructor/attempts/9/review/")) {
          posted.push(JSON.parse(String(init?.body)));
          current = {
            ...review,
            status: "completed",
            outcome: "passed",
            review_decision: "not_yet_competent",
            review_note: "Restart from eye protection.",
            reviewed_by_name: "Instructor",
          };
          return json(current);
        }
        return json(current);
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/teach/attempts/9"]}>
          <Routes>
            <Route path="/teach/attempts/:attemptId" element={<InstructorAttemptPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Sign off this attempt" })).toBeVisible();
    expect(screen.getByText(/counts with its score of 85% \(pass mark 70%\)/)).toBeVisible();
    fireEvent.click(screen.getByLabelText(/Not yet competent/));
    fireEvent.change(screen.getByLabelText("Reason for your decision"), {
      target: { value: "Restart from eye protection." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign off" }));

    expect(await screen.findByRole("heading", { name: "Not yet competent" })).toBeVisible();
    expect(posted).toEqual([
      { decision: "not_yet_competent", note: "Restart from eye protection." },
    ]);
    expect(screen.queryByRole("heading", { name: "Sign off this attempt" })).toBeNull();
  });
});
