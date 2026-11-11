import { apiFetch, ensureCsrf, rememberSignedInUser, type User } from "./client";
import type { Assignment, SimulationScenario } from "./learning";

// --- Signing up and joining -------------------------------------------------------------------

export type ClassPreview = { className: string; schoolName: string };

export function previewClass(code: string): Promise<ClassPreview> {
  return apiFetch<ClassPreview>(`/api/v1/auth/class/${encodeURIComponent(code)}/`);
}

export async function joinClass(
  code: string,
  input: { firstName: string; lastName: string; pin: string; phone?: string },
): Promise<{ signInName: string; user: User }> {
  await ensureCsrf();
  const response = await apiFetch<{ signInName: string; user: User }>(
    `/api/v1/auth/class/${encodeURIComponent(code)}/`,
    { method: "POST", body: JSON.stringify(input) },
  );
  rememberSignedInUser(response.user);
  return response;
}

export async function registerOpen(input: {
  firstName: string;
  lastName: string;
  signInName: string;
  password: string;
}): Promise<User> {
  await ensureCsrf();
  const response = await apiFetch<{ user: User }>("/api/v1/auth/register/", {
    method: "POST",
    body: JSON.stringify(input),
  });
  rememberSignedInUser(response.user);
  return response.user;
}

export function getOpenStatus(): Promise<{ openRegistration: boolean }> {
  return apiFetch<{ openRegistration: boolean }>("/api/v1/open/status/");
}

export type SchoolRegistrationInput = {
  organisationName: string;
  kind: "school" | "workshop" | "hub";
  district: string;
  contactName: string;
  email: string;
  phone: string;
  message: string;
};

export async function requestSchoolRegistration(input: SchoolRegistrationInput) {
  await ensureCsrf();
  return apiFetch<{ detail: string }>("/api/v1/schools/register/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Open catalogue and the visitor demo ------------------------------------------------------

export type CatalogueLesson = {
  lessonId: number;
  title: string;
  summary: string;
  estimatedMinutes: number;
  language: string;
  trade: string;
  courseTitle: string;
  provider: string;
  stepCount: number;
  assignmentId: number | null;
};

export async function getCatalogue(): Promise<CatalogueLesson[]> {
  return (await apiFetch<{ lessons: CatalogueLesson[] }>("/api/v1/catalogue/")).lessons;
}

export async function enrollInLesson(lessonId: number): Promise<number> {
  await ensureCsrf();
  const response = await apiFetch<{ assignmentId: number }>(
    `/api/v1/catalogue/${lessonId}/enroll/`,
    { method: "POST" },
  );
  return response.assignmentId;
}

export type DemoLesson = { lesson: Assignment["lesson"]; scenario: SimulationScenario };

export function getDemoLesson(): Promise<DemoLesson> {
  return apiFetch<DemoLesson>("/api/v1/demo/");
}

// --- Certificates -----------------------------------------------------------------------------

export type Certificate = {
  level: "self_study" | "simulation_passed" | "instructor_confirmed";
  levelTitle: string;
  statement: string;
  learnerName: string;
  lessonTitle: string;
  courseTitle: string;
  trade: string;
  organisation: string;
  score: string | null;
  completedAt: string;
  reviewerName: string;
  scenarioVersion: number;
};

export function getCertificate(
  attemptId: number,
): Promise<Certificate & { code: string; verifyUrl: string }> {
  return apiFetch(`/api/v1/attempts/${attemptId}/certificate/`);
}

export function verifyCertificate(code: string): Promise<Certificate & { valid: true }> {
  return apiFetch(`/api/v1/certificates/verify/${encodeURIComponent(code)}/`);
}

// --- Class access, for instructors ------------------------------------------------------------

export type ClassLearner = { id: number; name: string; signInName: string; usesPin: boolean };
export type ClassAccess = {
  id: number;
  name: string;
  schoolName: string;
  joinCode: string;
  isActive: boolean;
  learners: ClassLearner[];
};
export type SignInSlip = { name: string; signInName: string; pin: string };

export async function getClassAccess(): Promise<ClassAccess[]> {
  return (await apiFetch<{ classes: ClassAccess[] }>("/api/v1/classes/access/")).classes;
}

export async function setClassJoinCode(classId: number, enabled: boolean): Promise<ClassAccess> {
  await ensureCsrf();
  return apiFetch<ClassAccess>(`/api/v1/classes/${classId}/join-code/`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export async function createClassLearners(
  classId: number,
  names: string[],
): Promise<{ slips: SignInSlip[]; class: ClassAccess }> {
  await ensureCsrf();
  return apiFetch(`/api/v1/classes/${classId}/learners/`, {
    method: "POST",
    body: JSON.stringify({ names }),
  });
}

export async function resetLearnerPin(learnerId: number): Promise<SignInSlip> {
  await ensureCsrf();
  const response = await apiFetch<{ name: string; signInName: string; pin: string }>(
    `/api/v1/classes/learners/${learnerId}/reset-pin/`,
    { method: "POST" },
  );
  return response;
}

// --- Live class board -------------------------------------------------------------------------

export type LiveTeam = {
  number: number;
  rank: number;
  size: number;
  finished: number;
  progressPercent: number;
  safetyErrors: number;
  mistakes: number;
  averageSeconds: number | null;
  members: Array<{
    id: number;
    name: string;
    started: boolean;
    finished: boolean;
    stepsCompleted: number;
    totalSteps: number;
    mistakes: number;
    safetyErrors: number;
    seconds: number | null;
  }>;
};

export type LiveBoard = {
  className: string;
  lessonTitle: string;
  joinCode: string;
  teams: LiveTeam[];
  started: number;
  finished: number;
  learners: number;
  serverTime: string;
};

export function getLiveBoard(params: {
  cohort: number;
  lesson: number;
  teams: number;
  since?: string;
}): Promise<LiveBoard> {
  const query = new URLSearchParams({
    cohort: String(params.cohort),
    lesson: String(params.lesson),
    teams: String(params.teams),
  });
  if (params.since) query.set("since", params.since);
  return apiFetch<LiveBoard>(`/api/v1/instructor/live/?${query}`);
}
