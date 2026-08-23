import { apiFetch, ensureCsrf } from "./client";

export type PilotStatus = "draft" | "frozen" | "collecting" | "closed" | "reviewed";
export type PilotInstrument =
  | "pre_test"
  | "post_test"
  | "transfer"
  | "sus"
  | "tam"
  | "learner_interview"
  | "instructor_interview"
  | "instructor_workload";

export type PilotStudy = {
  id: number;
  school: number;
  code: string;
  title: string;
  scenario: number;
  cohort: number;
  protocol_version: string;
  consent_version: string;
  instruments: Record<string, { version: string }>;
  supported_devices: Array<Record<string, unknown>>;
  analysis_plan: Record<string, unknown>;
  thresholds: Record<string, number>;
  protocol_snapshot: Record<string, unknown>;
  status: PilotStatus;
  frozen_at: string | null;
  collection_started_at: string | null;
  collection_closed_at: string | null;
  created_at: string;
  updated_at: string;
  freezeErrors: string[];
  collectionErrors: string[];
};

export type PilotOptions = {
  schools: Array<{ id: number; name: string }>;
  cohorts: Array<{
    id: number;
    schoolId: number;
    name: string;
    code: string;
    learnerCount: number;
  }>;
  scenarios: Array<{
    id: number;
    schoolId: number;
    title: string;
    lessonTitle: string;
    version: number;
    assetPackage: string | null;
  }>;
};

export type PilotGate = {
  status: "pass" | "fail" | "insufficient";
  value: unknown;
  reason: string;
};
export type PilotReport = {
  studyId: number;
  protocolVersion: string;
  status: PilotStatus;
  expectedParticipants: number;
  observedParticipants: number;
  instrumentCounts: Record<string, number>;
  missingByInstrument: Record<string, number>;
  learning: Record<string, number | number[] | null>;
  transfer: Record<string, number | null>;
  acceptance: {
    susN: number;
    susMedian: number | null;
    susMean: number | null;
    susAlpha: number | null;
    tam: Record<string, { mean: number | null; alpha: number | null }>;
  };
  rendererParity: Record<string, unknown>;
  recognition: Record<string, number | null>;
  byDeviceTier: Record<string, Record<string, unknown>>;
  operations: Record<string, number | boolean | null>;
  qualitativeThemes: Record<string, number>;
  incidents: Record<string, number>;
  excludedRecords: { count: number; reasons: string[] };
  gates: Record<string, PilotGate>;
  overallGate: "pass" | "fail" | "insufficient";
  limitations: string[];
};

type Paginated<T> = { count: number; results: T[] };

export function getPilotStudies(): Promise<Paginated<PilotStudy>> {
  return apiFetch("/api/v1/research/pilots/?ordering=-created_at");
}

export function getPilotStudy(id: number): Promise<PilotStudy> {
  return apiFetch(`/api/v1/research/pilots/${id}/`);
}

export function getPilotOptions(): Promise<PilotOptions> {
  return apiFetch("/api/v1/research/pilots/options/");
}

export async function createPilotStudy(
  input: Omit<
    PilotStudy,
    | "id"
    | "status"
    | "protocol_snapshot"
    | "frozen_at"
    | "collection_started_at"
    | "collection_closed_at"
    | "created_at"
    | "updated_at"
    | "freezeErrors"
    | "collectionErrors"
  >,
): Promise<PilotStudy> {
  await ensureCsrf();
  return apiFetch("/api/v1/research/pilots/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function transitionPilot(
  id: number,
  action: "freeze" | "start" | "close",
): Promise<PilotStudy> {
  await ensureCsrf();
  return apiFetch(`/api/v1/research/pilots/${id}/transition/`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function getPilotReport(id: number): Promise<PilotReport> {
  return apiFetch(`/api/v1/research/pilots/${id}/report/`);
}

export async function recordPilotApproval(
  id: number,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await ensureCsrf();
  return apiFetch(`/api/v1/research/pilots/${id}/approvals/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function recordPilotRehearsal(
  id: number,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await ensureCsrf();
  return apiFetch(`/api/v1/research/pilots/${id}/rehearsals/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function recordPilotObservation(
  id: number,
  input: {
    instrument: PilotInstrument;
    responses: Record<string, unknown>;
    consent_accepted?: boolean;
    learner_id?: number;
    collected_at?: string;
  },
): Promise<Record<string, unknown>> {
  await ensureCsrf();
  return apiFetch(`/api/v1/research/pilots/${id}/observations/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function recordPilotIncident(
  id: number,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await ensureCsrf();
  return apiFetch(`/api/v1/research/pilots/${id}/incidents/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function recordPilotReview(
  id: number,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await ensureCsrf();
  return apiFetch(`/api/v1/research/pilots/${id}/review/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
