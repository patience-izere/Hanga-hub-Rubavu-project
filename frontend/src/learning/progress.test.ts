import { describe, expect, it } from "vitest";

import type { Assignment, AttemptDetail, CompetencyResult } from "../api/learning";
import { attemptPassed, competencyProfile, dueState, groupAssignments } from "./progress";

const NOW = new Date("2026-06-15T09:00:00Z");

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 1,
    due_at: null,
    attempt_limit: 3,
    attempt_history: [],
    latest_attempt: null,
    lesson: { title: "Battery" },
    ...overrides,
  } as unknown as Assignment;
}

function completedAttempt() {
  return { id: 9, status: "completed" } as Assignment["attempt_history"][number];
}

describe("dueState", () => {
  it("marks work past its due date as overdue", () => {
    expect(dueState(assignment({ due_at: "2026-06-10T09:00:00Z" }), NOW)).toBe("overdue");
  });

  it("marks work inside the next week as due soon", () => {
    expect(dueState(assignment({ due_at: "2026-06-18T09:00:00Z" }), NOW)).toBe("due-soon");
  });

  it("leaves work further out as scheduled", () => {
    expect(dueState(assignment({ due_at: "2026-07-20T09:00:00Z" }), NOW)).toBe("scheduled");
  });

  it("never marks a completed assignment overdue, since finishing late still counts", () => {
    const done = assignment({
      due_at: "2026-06-10T09:00:00Z",
      attempt_history: [completedAttempt()],
    });
    expect(dueState(done, NOW)).toBe("none");
  });

  it("has no state without a due date", () => {
    expect(dueState(assignment(), NOW)).toBe("none");
  });
});

describe("groupAssignments", () => {
  it("splits into due soon, assigned and completed, soonest first", () => {
    const groups = groupAssignments(
      [
        assignment({ id: 1, due_at: "2026-07-20T09:00:00Z" }),
        assignment({ id: 2, due_at: "2026-06-18T09:00:00Z" }),
        assignment({ id: 3, due_at: "2026-06-10T09:00:00Z" }),
        assignment({ id: 4, attempt_history: [completedAttempt()] }),
      ],
      NOW,
    );

    expect(groups.map((group) => group.key)).toEqual(["due-soon", "assigned", "completed"]);
    // Overdue (3) precedes merely due-soon (2).
    expect(groups[0].assignments.map((item) => item.id)).toEqual([3, 2]);
    expect(groups[1].assignments.map((item) => item.id)).toEqual([1]);
    expect(groups[2].assignments.map((item) => item.id)).toEqual([4]);
  });

  it("omits groups that would be empty", () => {
    const groups = groupAssignments([assignment({ id: 1 })], NOW);
    expect(groups.map((group) => group.key)).toEqual(["assigned"]);
  });
});

describe("attemptPassed", () => {
  it("trusts the server outcome over the score", () => {
    expect(attemptPassed({ outcome: "mastered", score: "40.00" })).toBe(true);
    expect(attemptPassed({ outcome: "passed", score: "40.00" })).toBe(true);
    expect(attemptPassed({ outcome: "failed", score: "99.00" })).toBe(false);
  });

  it("is undecided while the outcome is pending or under review", () => {
    expect(attemptPassed({ outcome: "pending", score: "80.00" })).toBeNull();
    expect(attemptPassed({ outcome: "requires_review", score: "80.00" })).toBeNull();
  });

  it("uses the scenario pass threshold rather than a hardcoded 100", () => {
    const scenario = { grading_policy: { pass_threshold: 80 } };
    // 85% is a pass at this policy even though it is not a perfect score.
    expect(attemptPassed({ outcome: "unknown", score: "85.00", scenario })).toBe(true);
    expect(attemptPassed({ outcome: "unknown", score: "75.00", scenario })).toBe(false);
  });

  it("is undecided when there is no score or no policy to judge against", () => {
    expect(attemptPassed({ outcome: "unknown", score: null })).toBeNull();
    expect(attemptPassed({ outcome: "unknown", score: "90.00" })).toBeNull();
  });
});

describe("competencyProfile", () => {
  function result(code: string, state: CompetencyResult["mastery_state"]): CompetencyResult {
    return {
      competency_code: code,
      mastery_state: state,
      mastery_percentage: "50.00",
      mastery_threshold: 80,
    } as CompetencyResult;
  }

  function attempt(startedAt: string, results: CompetencyResult[]): AttemptDetail {
    return { started_at: startedAt, competency_results: results } as AttemptDetail;
  }

  it("keeps the most recent result for each competency", () => {
    const profile = competencyProfile([
      attempt("2026-06-01T09:00:00Z", [result("AUTO-01", "not_demonstrated")]),
      attempt("2026-06-10T09:00:00Z", [result("AUTO-01", "mastered")]),
    ]);

    expect(profile).toHaveLength(1);
    expect(profile[0].mastery_state).toBe("mastered");
  });

  it("merges competencies across different attempts, sorted by code", () => {
    const profile = competencyProfile([
      attempt("2026-06-10T09:00:00Z", [result("AUTO-02", "developing")]),
      attempt("2026-06-01T09:00:00Z", [result("AUTO-01", "mastered")]),
    ]);

    expect(profile.map((item) => item.competency_code)).toEqual(["AUTO-01", "AUTO-02"]);
  });

  it("is empty when no attempt has results", () => {
    expect(competencyProfile([attempt("2026-06-01T09:00:00Z", [])])).toEqual([]);
  });
});
