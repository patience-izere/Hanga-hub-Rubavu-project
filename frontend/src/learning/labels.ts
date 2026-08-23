/**
 * Human-readable labels for attempt lifecycle and outcome values.
 *
 * These were duplicated across the learner and instructor dashboards with subtly different
 * fallbacks, so the same status could read differently depending on which page showed it.
 */

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  completed: "Completed",
  requires_review: "Instructor review",
  abandoned: "Ended safely",
};

const ATTEMPT_OUTCOME_LABELS: Record<string, string> = {
  pending: "Pending",
  passed: "Passed",
  failed: "Failed",
  requires_review: "Instructor review",
  mastered: "Mastered",
};

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

/** Label for an attempt that exists. Unknown values are humanized rather than guessed at. */
export function attemptStatusLabel(status: string): string {
  return ATTEMPT_STATUS_LABELS[status] ?? humanize(status);
}

/**
 * Label for an assignment's latest attempt, where `undefined` means the learner has not
 * started yet.
 */
export function assignmentStatusLabel(status: string | undefined): string {
  return status ? attemptStatusLabel(status) : "Not started";
}

export function attemptOutcomeLabel(outcome: string): string {
  return ATTEMPT_OUTCOME_LABELS[outcome] ?? humanize(outcome);
}
