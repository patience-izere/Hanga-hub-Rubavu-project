import { apiFetch, ensureCsrf } from "./client";

export type RendererMode = "accessible_2d" | "desktop_3d" | "marker_ar" | "markerless_ar";

export type CapabilityProfile = {
  secureContext: boolean;
  camera: boolean;
  webgl: boolean;
  immersiveAr: boolean;
  hitTest: boolean;
  markerDetector: boolean;
  online: boolean;
  connection?: string;
  deviceMemoryGb?: number;
  storageQuotaMb?: number;
  storageAvailableMb?: number;
  deviceTier: "immersive-ar" | "camera-ar" | "desktop-3d" | "fallback-only";
  inputMode: "touch" | "pointer";
  reducedMotion: boolean;
};

export type Competency = {
  id: number;
  code: string;
  title: string;
  description: string;
  curriculum_reference: string;
  level: number;
  evidence_rules: unknown[];
  mastery_criteria: string[];
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
  acceptable_actions: Array<{
    action_code: string;
    label: string;
    is_primary: boolean;
    tolerance: {
      code: string;
      measurement: string;
      minimum_value: string;
      maximum_value: string;
      unit: string;
    } | null;
  }>;
  hints: Array<{ code: string; order: number; text: string; points_penalty: number }>;
  tolerances: Array<{
    code: string;
    measurement: string;
    minimum_value: string;
    maximum_value: string;
    unit: string;
  }>;
  tools: Array<{ code: string; name: string; description: string }>;
  hazards: Array<{
    code: string;
    title: string;
    description: string;
    mitigation: string;
    severity: "low" | "medium" | "high" | "critical";
  }>;
  feedback_rules: Record<string, string>;
  competency_codes: string[];
};

export type Attempt = {
  id: number;
  status: "in_progress" | "completed" | "requires_review" | "abandoned";
  outcome: "pending" | "passed" | "failed" | "requires_review" | "mastered";
  score: string | null;
  scenario_version: number;
  grading_policy_code: string;
  grading_policy_version: number;
  resume_state: {
    completedSteps?: string[];
    currentStep?: string | null;
  };
  renderer_mode: RendererMode;
  learning_mode: "guided" | "independent";
  capability_profile: Partial<CapabilityProfile>;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
};

export type SimulationScenario = {
  id: number;
  version: number;
  title: string;
  grading_policy: {
    code: string;
    version: number;
    algorithm: string;
    base_score: number;
    pass_threshold: number;
    incorrect_action_penalty: number;
    safety_critical_penalty: number;
    requires_review_on_safety_error: boolean;
  };
  asset_package: {
    code: string;
    version: number;
    name: string;
    manifest: Record<string, unknown>;
    sha256: string;
    total_byte_size: number;
    files: Array<{
      path: string;
      url: string;
      mime_type: string;
      byte_size: number;
      sha256: string;
      role: string;
      license_spdx: string;
      source_attribution: string;
      metadata: Record<string, unknown>;
    }>;
  } | null;
  renderer_config: {
    marker_ar?: {
      enabled?: boolean;
      targetType?: string;
      targetValue?: string;
      manualControlledRigFallback?: boolean;
    };
    markerless_ar?: Record<string, unknown>;
    accessible_2d?: Record<string, unknown>;
    desktop_3d?: Record<string, unknown>;
  };
};

export type Assignment = {
  id: number;
  available_at: string | null;
  due_at: string | null;
  attempt_limit: number;
  instructions: string;
  created_at: string;
  latest_attempt: Attempt | null;
  attempt_history: Attempt[];
  scenario: SimulationScenario;
  lesson: {
    id: number;
    title: string;
    slug: string;
    summary: string;
    objectives: string[];
    safety_notes: string[];
    estimated_minutes: number;
    language: "en" | "rw" | "en-rw";
    content_version: number;
    course_title: string;
    trade: string;
    program: string | null;
    module: string | null;
    competencies: Competency[];
    prerequisites: Array<{ id: number; title: string; slug: string }>;
    procedure_steps: ProcedureStep[];
  };
};

export type AttemptEvent = {
  event_id: string;
  sequence: number;
  event_type: string;
  schema_version: number;
  activity_id: string;
  renderer_mode: RendererMode;
  payload: Record<string, unknown>;
  occurred_at: string;
  client_occurred_at: string | null;
  received_at: string;
};

export type InstructorFeedback = {
  id: number;
  author_name: string;
  observation: string;
  feedback: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdaptiveRecommendation = {
  id: number;
  rule_version: string;
  kind: "continue" | "remediate" | "retry" | "instructor_review" | "complete";
  input_snapshot: Record<string, unknown>;
  rationale: string;
  confidence: string;
  override_kind: "continue" | "remediate" | "retry" | "instructor_review" | "complete" | null;
  override_reason: string;
  overridden_by_name: string;
  created_at: string;
};

export type KnowledgeCheckSubmission = {
  id: number;
  answers: Array<{ questionCode: string; response: boolean }>;
  score: string | null;
  submitted_at: string;
};

export type AttemptDetail = Attempt & {
  assignment: Assignment;
  events: AttemptEvent[];
  step_results: StepResult[];
  competency_results: CompetencyResult[];
  feedback: InstructorFeedback[];
  recommendation: AdaptiveRecommendation | null;
};

export type StepResult = {
  step_code: string;
  outcome: "passed" | "failed" | "requires_review";
  attempts_count: number;
  hints_used: number;
  duration_seconds: number;
  achieved_points: string;
  available_points: string;
  tolerance_passed: boolean | null;
  safety_violations: number;
  evidence_sequences: number[];
  completed_at: string;
};

export type CompetencyResult = {
  competency_code: string;
  achieved_points: string;
  available_points: string;
  mastery_percentage: string;
  mastery_threshold: number;
  mastery_state: "not_demonstrated" | "developing" | "mastered" | "requires_review";
  evidence: Array<{
    stepCode: string;
    stepResultId: number;
    eventSequences: number[];
  }>;
  created_at: string;
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

export function getAssignmentKnowledgeCheck(id: number): Promise<KnowledgeCheckSubmission | null> {
  return apiFetch<KnowledgeCheckSubmission | null>(`/api/v1/assignments/${id}/knowledge-check/`);
}

export async function saveAssignmentKnowledgeCheck(
  id: number,
  answers: KnowledgeCheckSubmission["answers"],
): Promise<KnowledgeCheckSubmission> {
  await ensureCsrf();
  return apiFetch<KnowledgeCheckSubmission>(`/api/v1/assignments/${id}/knowledge-check/`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

export async function requestAttemptHint(attemptId: number, hintCode?: string) {
  await ensureCsrf();
  return apiFetch<{ hint: ProcedureStep["hints"][number]; attempt: Attempt }>(
    `/api/v1/attempts/${attemptId}/hints/`,
    {
      method: "POST",
      body: JSON.stringify(hintCode ? { hintCode } : {}),
    },
  );
}

export async function getAttempt(id: number): Promise<AttemptDetail> {
  return apiFetch<AttemptDetail>(`/api/v1/attempts/${id}/`);
}

export async function recordAttemptAction(
  id: number,
  action: string,
  metadata: Record<string, unknown> = {},
  eventId: string = crypto.randomUUID(),
): Promise<ActionResult> {
  await ensureCsrf();
  return apiFetch<ActionResult>(`/api/v1/attempts/${id}/actions/`, {
    method: "POST",
    body: JSON.stringify({ action, metadata, eventId }),
  });
}

export async function selectAttemptRenderer(
  id: number,
  mode: RendererMode,
  capabilityProfile: CapabilityProfile,
  learningMode?: "guided" | "independent",
): Promise<Attempt> {
  await ensureCsrf();
  return apiFetch<Attempt>(`/api/v1/attempts/${id}/renderer/`, {
    method: "POST",
    body: JSON.stringify({ mode, capabilityProfile, learningMode }),
  });
}

export type TelemetryEventInput = {
  eventId: string;
  eventType:
    | "renderer_selected"
    | "device_capability"
    | "ar_session_started"
    | "ar_session_ended"
    | "ar_permission_denied"
    | "ar_marker_found"
    | "ar_marker_lost"
    | "ar_marker_mismatch"
    | "ar_tracking_recovered"
    | "ar_placement_confirmed"
    | "ar_fallback_used"
    | "asset_load_completed"
    | "asset_load_failed"
    | "performance_sample"
    | "sync_state_changed";
  rendererMode: RendererMode;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export async function ingestAttemptEvents(
  id: number,
  events: TelemetryEventInput[],
): Promise<AttemptEvent[]> {
  await ensureCsrf();
  return apiFetch<AttemptEvent[]>(`/api/v1/attempts/${id}/events/batch/`, {
    method: "POST",
    body: JSON.stringify({ events }),
  });
}

export type AttemptSyncAudit = {
  audit_id: string;
  client_event_ids: string[];
  server_event_ids: string[];
  missing_event_ids: string[];
  pending_count: number;
  passed: boolean;
  client_created_at: string;
  audited_at: string;
};

export async function reconcileAttemptSync(
  id: number,
  eventIds: string[],
  pendingCount: number,
): Promise<AttemptSyncAudit> {
  await ensureCsrf();
  return apiFetch<AttemptSyncAudit>(`/api/v1/attempts/${id}/sync-audit/`, {
    method: "POST",
    body: JSON.stringify({
      eventIds,
      pendingCount,
      clientCreatedAt: new Date().toISOString(),
    }),
  });
}

export function getAttemptRecommendation(id: number): Promise<AdaptiveRecommendation> {
  return apiFetch<AdaptiveRecommendation>(`/api/v1/attempts/${id}/recommendation/`);
}

export async function completeAttempt(id: number): Promise<AttemptDetail> {
  await ensureCsrf();
  const response = await apiFetch<{ attempt: AttemptDetail }>(`/api/v1/attempts/${id}/complete/`, {
    method: "POST",
  });
  return response.attempt;
}

export async function abandonAttempt(id: number): Promise<AttemptDetail> {
  await ensureCsrf();
  const response = await apiFetch<{ attempt: AttemptDetail }>(`/api/v1/attempts/${id}/abandon/`, {
    method: "POST",
  });
  return response.attempt;
}
