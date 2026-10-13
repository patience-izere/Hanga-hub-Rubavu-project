import { apiFetch, ensureCsrf } from "./client";

export type AuthoredScenario = {
  id: number;
  lesson: number;
  version: number;
  title: string;
  definition: Record<string, unknown>;
  grading_policy: number;
  asset_package: number | null;
  status: "draft" | "review" | "approved" | "published" | "retired";
  authoredBy: number | null;
  reviewedBy: number | null;
  reviewNotes: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  publicationChecks: { ready: boolean; errors: string[] };
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type ScenarioPage = { results: AuthoredScenario[] } | AuthoredScenario[];

export type AuthoredAssetPackage = {
  id: number;
  course: number;
  code: string;
  version: number;
  name: string;
  manifest: Record<string, unknown>;
  sha256: string;
  total_byte_size: number;
  status: "draft" | "published" | "retired";
  files: Array<{
    id: number;
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
};

type AssetPackagePage = { results: AuthoredAssetPackage[] } | AuthoredAssetPackage[];

export async function listAuthoredScenarios(): Promise<AuthoredScenario[]> {
  const response = await apiFetch<ScenarioPage>("/api/v1/content/scenarios/?ordering=-updated_at");
  return Array.isArray(response) ? response : response.results;
}

export async function getAuthoredScenario(id: number): Promise<AuthoredScenario> {
  return apiFetch<AuthoredScenario>(`/api/v1/content/scenarios/${id}/`);
}

export async function updateAuthoredScenario(
  id: number,
  input: Partial<
    Pick<AuthoredScenario, "title" | "definition" | "grading_policy" | "asset_package">
  >,
) {
  await ensureCsrf();
  return apiFetch<AuthoredScenario>(`/api/v1/content/scenarios/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function cloneAuthoredScenario(id: number) {
  await ensureCsrf();
  return apiFetch<AuthoredScenario>(`/api/v1/content/scenarios/${id}/clone-draft/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function publishAuthoredScenario(id: number) {
  await ensureCsrf();
  return apiFetch<AuthoredScenario>(`/api/v1/content/scenarios/${id}/publish/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function transitionAuthoredScenario(
  id: number,
  action: "submit" | "approve" | "return_to_draft" | "retire",
  reviewNotes = "",
) {
  await ensureCsrf();
  return apiFetch<AuthoredScenario>(`/api/v1/content/scenarios/${id}/transition/`, {
    method: "POST",
    body: JSON.stringify({ action, reviewNotes }),
  });
}

export async function listAuthoredAssetPackages() {
  const response = await apiFetch<AssetPackagePage>(
    "/api/v1/content/asset-packages/?ordering=-updated_at",
  );
  return Array.isArray(response) ? response : response.results;
}

export async function uploadAuthoredAsset(
  packageId: number,
  input: {
    file: File;
    role: string;
    licenseSpdx: string;
    sourceAttribution: string;
    altText: string;
    transcript: string;
  },
) {
  await ensureCsrf();
  const body = new FormData();
  body.set("file", input.file);
  body.set("role", input.role);
  body.set("licenseSpdx", input.licenseSpdx);
  body.set("sourceAttribution", input.sourceAttribution);
  body.set("altText", input.altText);
  body.set("transcript", input.transcript);
  return apiFetch<AuthoredAssetPackage>(`/api/v1/content/asset-packages/${packageId}/files/`, {
    method: "POST",
    body,
  });
}

export async function publishAuthoredAssetPackage(packageId: number) {
  await ensureCsrf();
  return apiFetch<AuthoredAssetPackage>(`/api/v1/content/asset-packages/${packageId}/publish/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type CompetencyOption = {
  id: number;
  code: string;
  title: string;
  description: string;
  masteryThreshold: number;
};

export type ModuleOption = {
  id: number;
  code: string;
  title: string;
  description: string;
  order: number;
};

export type AuthoringCourse = {
  id: number;
  school: number | null;
  schoolName: string;
  title: string;
  slug: string;
  trade: string;
  description: string;
  modules: ModuleOption[];
  competencies: CompetencyOption[];
  lessonCount: number;
};

export type LessonStatus = "draft" | "review" | "approved" | "published" | "retired";

export type AuthoringLesson = {
  id: number;
  course: number;
  courseTitle: string;
  module: number | null;
  title: string;
  slug: string;
  summary: string;
  objectives: string[];
  safetyNotes: string[];
  estimatedMinutes: number;
  language: "en" | "rw" | "en-rw";
  competencies: number[];
  status: LessonStatus;
  contentVersion: number;
  authoredBy: number | null;
  authorName: string;
  reviewNotes: string;
  submittedAt: string | null;
  publishedAt: string | null;
  scenarios: Array<{
    id: number;
    version: number;
    title: string;
    status: AuthoredScenario["status"];
    updated_at: string;
  }>;
  updated_at: string;
};

export type LessonInput = Pick<
  AuthoringLesson,
  | "course"
  | "module"
  | "title"
  | "summary"
  | "objectives"
  | "safetyNotes"
  | "estimatedMinutes"
  | "language"
  | "competencies"
>;

export type GradingPolicyOption = {
  id: number;
  code: string;
  version: number;
  name: string;
  passThreshold: number;
};

type Paged<T> = { results: T[] } | T[];

function rows<T>(response: Paged<T>): T[] {
  return Array.isArray(response) ? response : response.results;
}

async function send<T>(path: string, method: string, body: unknown): Promise<T> {
  await ensureCsrf();
  return apiFetch<T>(path, { method, body: JSON.stringify(body) });
}

export async function listAuthoringCourses(): Promise<AuthoringCourse[]> {
  return rows(await apiFetch<Paged<AuthoringCourse>>("/api/v1/content/courses/"));
}

export function createAuthoringCourse(input: {
  title: string;
  trade: string;
  description: string;
}) {
  return send<AuthoringCourse>("/api/v1/content/courses/", "POST", input);
}

export function addCourseCompetency(
  courseId: number,
  input: { code: string; title: string; description: string },
) {
  return send<CompetencyOption>(`/api/v1/content/courses/${courseId}/competencies/`, "POST", input);
}

export function addCourseModule(courseId: number, input: { title: string; description: string }) {
  return send<ModuleOption>(`/api/v1/content/courses/${courseId}/modules/`, "POST", input);
}

export async function listAuthoringLessons(): Promise<AuthoringLesson[]> {
  return rows(await apiFetch<Paged<AuthoringLesson>>("/api/v1/content/lessons/?page_size=200"));
}

export function getAuthoringLesson(id: number) {
  return apiFetch<AuthoringLesson>(`/api/v1/content/lessons/${id}/`);
}

export function createAuthoringLesson(input: LessonInput) {
  return send<AuthoringLesson>("/api/v1/content/lessons/", "POST", input);
}

export function updateAuthoringLesson(id: number, input: Partial<LessonInput>) {
  return send<AuthoringLesson>(`/api/v1/content/lessons/${id}/`, "PATCH", input);
}

export type LessonTransition = "submit" | "approve" | "publish" | "return_to_draft" | "retire";

export function transitionAuthoringLesson(id: number, action: LessonTransition, reviewNotes = "") {
  return send<AuthoringLesson>(`/api/v1/content/lessons/${id}/transition/`, "POST", {
    action,
    reviewNotes,
  });
}

export function createLessonScenario(lessonId: number, gradingPolicy?: number) {
  return send<AuthoredScenario>(
    `/api/v1/content/lessons/${lessonId}/scenarios/`,
    "POST",
    gradingPolicy ? { gradingPolicy } : {},
  );
}

export function listGradingPolicies() {
  return apiFetch<GradingPolicyOption[]>("/api/v1/content/grading-policies/");
}
