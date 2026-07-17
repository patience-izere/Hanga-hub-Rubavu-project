import { apiFetch, ensureCsrf } from "./client";

export type Competency = {
  id: number;
  code: string;
  title: string;
  description: string;
  mastery_threshold: number;
};

export type ProcedureStep = {
  id: number;
  order: number;
  code: string;
  title: string;
  instruction: string;
  action_code: string;
  feedback: string;
  safety_critical: boolean;
  points: number;
  metadata: Record<string, unknown>;
};

export type Attempt = {
  id: number;
  status: "in_progress" | "completed" | "requires_review";
  score: string | null;
  resume_state: {
    completedSteps?: string[];
    currentStep?: string | null;
  };
  started_at: string;
  completed_at: string | null;
  updated_at: string;
};

export type Assignment = {
  id: number;
  due_at: string | null;
  created_at: string;
  latest_attempt: Attempt | null;
  lesson: {
    id: number;
    title: string;
    slug: string;
    summary: string;
    objectives: string[];
    safety_notes: string[];
    estimated_minutes: number;
    course_title: string;
    trade: string;
    program: string | null;
    module: string | null;
    competencies: Competency[];
    procedure_steps: ProcedureStep[];
  };
};

export type AttemptEvent = {
  sequence: number;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
};

export type AttemptDetail = Attempt & {
  assignment: Assignment;
  events: AttemptEvent[];
};

export type ActionResult = {
  correct: boolean;
  message: string;
  currentStep: ProcedureStep | null;
  isReadyToComplete: boolean;
  attempt: Attempt;
};

type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export async function listAssignments(): Promise<Assignment[]> {
  const response = await apiFetch<PaginatedResponse<Assignment>>("/api/v1/assignments/");
  return response.results;
}

export async function getAssignment(id: number): Promise<Assignment> {
  return apiFetch<Assignment>(`/api/v1/assignments/${id}/`);
}

export async function startAssignment(id: number): Promise<Attempt> {
  await ensureCsrf();
  const response = await apiFetch<{ attempt: Attempt }>(`/api/v1/assignments/${id}/start/`, {
    method: "POST",
  });
  return response.attempt;
}

export async function getAttempt(id: number): Promise<AttemptDetail> {
  return apiFetch<AttemptDetail>(`/api/v1/attempts/${id}/`);
}

export async function recordAttemptAction(
  id: number,
  action: string,
  metadata: Record<string, unknown> = {},
): Promise<ActionResult> {
  await ensureCsrf();
  return apiFetch<ActionResult>(`/api/v1/attempts/${id}/actions/`, {
    method: "POST",
    body: JSON.stringify({ action, metadata }),
  });
}

export async function completeAttempt(id: number): Promise<AttemptDetail> {
  await ensureCsrf();
  const response = await apiFetch<{ attempt: AttemptDetail }>(`/api/v1/attempts/${id}/complete/`, {
    method: "POST",
  });
  return response.attempt;
}
