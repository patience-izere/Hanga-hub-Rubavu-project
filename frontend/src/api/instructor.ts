import { apiFetch } from "./client";
import type { components } from "./generated/schema";
import type { AttemptEvent } from "./learning";

type GeneratedEvidence = components["schemas"]["InstructorAttemptEvidence"];
type AttemptStatus = "in_progress" | "completed" | "requires_review";

export type InstructorAttemptEvidence = Omit<GeneratedEvidence, "status"> & {
  status: AttemptStatus;
};
export type InstructorOverview = Omit<components["schemas"]["InstructorOverview"], "attempts"> & {
  attempts: InstructorAttemptEvidence[];
};
export type InstructorAttemptReview = Omit<
  components["schemas"]["InstructorAttemptReview"],
  "status" | "events"
> & {
  status: AttemptStatus;
  events: AttemptEvent[];
};

export function getInstructorOverview(): Promise<InstructorOverview> {
  return apiFetch<InstructorOverview>("/api/v1/instructor/overview/");
}

export function getInstructorAttempt(id: number): Promise<InstructorAttemptReview> {
  return apiFetch<InstructorAttemptReview>(`/api/v1/instructor/attempts/${id}/`);
}
