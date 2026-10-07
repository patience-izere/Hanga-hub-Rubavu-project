import type { Assignment, AttemptDetail, CompetencyResult } from "../api/learning";

export type DueState = "overdue" | "due-soon" | "scheduled" | "none";

/** Work due within this window is surfaced ahead of everything else. */
const DUE_SOON_DAYS = 7;

export function isCompleted(assignment: Assignment): boolean {
  return (assignment.attempt_history ?? []).some((attempt) => attempt.status === "completed");
}

export function attemptsUsed(assignment: Assignment): number {
  return (assignment.attempt_history ?? []).length;
}

export function hasAttemptsLeft(assignment: Assignment): boolean {
  return attemptsUsed(assignment) < assignment.attempt_limit;
}

/**
 * Where an assignment sits relative to its due date.
 *
 * A completed assignment is never overdue — finishing late still counts as finished, and
 * flagging it red afterwards would be punitive rather than useful.
 */
export function dueState(assignment: Assignment, now: Date = new Date()): DueState {
  if (!assignment.due_at) return "none";
  if (isCompleted(assignment)) return "none";
  const due = new Date(assignment.due_at);
  if (due < now) return "overdue";
  const days = (due.getTime() - now.getTime()) / 86_400_000;
  return days <= DUE_SOON_DAYS ? "due-soon" : "scheduled";
}

export function formatDue(value: string | null): string {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Human phrasing for how far away a due date is, used alongside the absolute date. */
export function dueRelative(value: string | null, now: Date = new Date()): string | null {
  if (!value) return null;
  const days = Math.round((new Date(value).getTime() - now.getTime()) / 86_400_000);
  if (days < -1) return `${Math.abs(days)} days ago`;
  if (days === -1) return "Yesterday";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export type AssignmentGroup = {
  key: "due-soon" | "assigned" | "completed";
  title: string;
  description: string;
  assignments: Assignment[];
};

/**
 * Splits assignments into the three questions a learner actually has: what is urgent, what is
 * outstanding, and what is done.
 */
export function groupAssignments(
  assignments: Assignment[],
  now: Date = new Date(),
): AssignmentGroup[] {
  const completed: Assignment[] = [];
  const urgent: Assignment[] = [];
  const outstanding: Assignment[] = [];

  for (const assignment of assignments) {
    if (isCompleted(assignment)) {
      completed.push(assignment);
      continue;
    }
    const state = dueState(assignment, now);
    if (state === "overdue" || state === "due-soon") urgent.push(assignment);
    else outstanding.push(assignment);
  }

  // Soonest first within the urgent group, so the most pressing work leads.
  urgent.sort((a, b) => new Date(a.due_at ?? 0).getTime() - new Date(b.due_at ?? 0).getTime());

  return [
    {
      key: "due-soon",
      title: "Due soon",
      description: "Work that is overdue or due within the next week.",
      assignments: urgent,
    },
    {
      key: "assigned",
      title: "Assigned",
      description: "Available to start whenever you are ready.",
      assignments: outstanding,
    },
    {
      key: "completed",
      title: "Completed",
      description: "Attempts you have already submitted for assessment.",
      assignments: completed,
    },
  ].filter((group) => group.assignments.length > 0) as AssignmentGroup[];
}

/**
 * Whether an attempt met the bar, using the attempt's own server-assigned outcome and the
 * grading policy that scored it.
 *
 * Never compare the score string directly: it is a fixed-point decimal, and the pass mark is a
 * per-scenario policy value rather than a hardcoded 100.
 */
export function attemptPassed(attempt: {
  outcome?: string;
  score?: string | null;
  scenario?: { grading_policy?: { pass_threshold?: number } };
}): boolean | null {
  if (attempt.outcome === "mastered" || attempt.outcome === "passed") return true;
  if (attempt.outcome === "failed") return false;
  if (attempt.outcome === "requires_review" || attempt.outcome === "pending") return null;
  const threshold = attempt.scenario?.grading_policy?.pass_threshold;
  if (attempt.score == null || threshold == null) return null;
  return Number(attempt.score) >= threshold;
}

/** Latest state per competency across attempts, newest attempt winning. */
export function competencyProfile(attempts: AttemptDetail[]): CompetencyResult[] {
  const latest = new Map<string, CompetencyResult>();
  const newestFirst = [...attempts].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
  for (const attempt of newestFirst) {
    for (const result of attempt.competency_results ?? []) {
      if (!latest.has(result.competency_code)) latest.set(result.competency_code, result);
    }
  }
  return [...latest.values()].sort((a, b) => a.competency_code.localeCompare(b.competency_code));
}
