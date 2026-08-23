import { apiFetch, ensureCsrf } from "./client";
import type { components } from "./generated/schema";
import type { AdaptiveRecommendation, AttemptEvent, InstructorFeedback } from "./learning";

type GeneratedEvidence = components["schemas"]["InstructorAttemptEvidence"];
type AttemptStatus = "in_progress" | "completed" | "requires_review" | "abandoned";

export type InstructorAttemptEvidence = Omit<GeneratedEvidence, "status"> & {
  status: AttemptStatus;
};
export type InstructorOverview = Omit<components["schemas"]["InstructorOverview"], "attempts"> & {
  attempts: InstructorAttemptEvidence[];
  operationalAnalytics: {
    learning: { masteredAttempts: number; failedAttempts: number };
    recognition: {
      markerFound: number;
      markerMismatch: number;
      trackingLoss: number;
      placements: number;
    };
    deviceReliability: {
      performanceSamples: number;
      lowFrameRateSamples: number;
      assetFailures: number;
    };
    synchronization: { stateChanges: number; xapiPending: number; xapiDeadLetters: number };
    fallback: { accessibleAttempts: number; arFallbackEvents: number };
  };
};
export type InstructorAttemptReview = Omit<
  components["schemas"]["InstructorAttemptReview"],
  "status" | "events"
> & {
  status: AttemptStatus;
  events: AttemptEvent[];
};
export type InstructorAssignmentOptions = {
  learners: Array<{ id: number; name: string; email: string; school: string }>;
  cohorts: Array<{ id: number; name: string; code: string; learnerCount: number }>;
  scenarios: Array<{
    id: number;
    lessonId: number;
    lessonTitle: string;
    courseTitle: string;
    version: number;
  }>;
};

export function getInstructorOverview(): Promise<InstructorOverview> {
  return apiFetch<InstructorOverview>("/api/v1/instructor/overview/");
}

export function getInstructorAttempt(id: number): Promise<InstructorAttemptReview> {
  return apiFetch<InstructorAttemptReview>(`/api/v1/instructor/attempts/${id}/`);
}

export async function submitInstructorFeedback(
  id: number,
  input: { observation: string; feedback: string; is_published: boolean },
): Promise<InstructorFeedback> {
  await ensureCsrf();
  return apiFetch<InstructorFeedback>(`/api/v1/instructor/attempts/${id}/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function overrideAttemptRecommendation(
  id: number,
  input: {
    kind: "continue" | "remediate" | "retry" | "instructor_review" | "complete";
    reason: string;
  },
) {
  await ensureCsrf();
  return apiFetch<AdaptiveRecommendation>(`/api/v1/instructor/attempts/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getInstructorAssignmentOptions(): Promise<InstructorAssignmentOptions> {
  return apiFetch<InstructorAssignmentOptions>("/api/v1/instructor/assignments/");
}

export async function createInstructorAssignments(input: {
  scenarioId: number;
  learnerIds: number[];
  cohortIds: number[];
  availableAt: string | null;
  dueAt: string | null;
  attemptLimit: number;
  instructions: string;
}): Promise<{ assignmentIds: number[]; created: number; existing: number }> {
  await ensureCsrf();
  return apiFetch("/api/v1/instructor/assignments/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
