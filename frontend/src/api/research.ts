import { apiFetch, ensureCsrf } from "./client";

export type ResearchSurveyResponse = {
  id: number;
  participant_code: string;
  instrument: "tam" | "sus" | "pre_test" | "post_test" | "transfer" | "interview";
  responses: Record<string, number | string | boolean>;
  consent_version: string;
  scenario_version: string;
  submitted_at: string;
};

export type ResearchConsentPolicy = {
  version: string;
  retention_days: number;
  status: "draft" | "approved";
  privacy_path: string;
};

export function getResearchConsentPolicy(): Promise<ResearchConsentPolicy> {
  return apiFetch<ResearchConsentPolicy>("/api/v1/research/consent-policy/");
}

export async function submitResearchSurvey(input: {
  instrument: ResearchSurveyResponse["instrument"];
  responses: ResearchSurveyResponse["responses"];
  consent_version: string;
  consent_accepted: true;
  scenario_version?: string;
}): Promise<ResearchSurveyResponse> {
  await ensureCsrf();
  return apiFetch<ResearchSurveyResponse>("/api/v1/research/surveys/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function withdrawResearchResponses(): Promise<void> {
  await ensureCsrf();
  await apiFetch("/api/v1/research/surveys/", { method: "DELETE" });
}
