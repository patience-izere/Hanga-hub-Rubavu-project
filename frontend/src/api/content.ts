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

export async function updateAuthoredScenario(
  id: number,
  input: Pick<AuthoredScenario, "title" | "definition">,
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
