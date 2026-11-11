import { apiFetch, ensureCsrf } from "./client";

export type PlatformSchool = {
  id: number;
  name: string;
  code: string;
  kind: "school" | "workshop" | "hub";
  kindLabel: string;
  isActive: boolean;
  isOpen: boolean;
  researchEnabled: boolean;
  memberCount: number;
  adminCount: number;
  createdAt: string;
};

export type RegistrationRequest = {
  id: number;
  organisationName: string;
  kind: PlatformSchool["kind"];
  kindLabel: string;
  district: string;
  contactName: string;
  email: string;
  phone: string;
  message: string;
  status: "pending" | "approved" | "declined";
  createdAt: string;
};

export type PlatformOverview = {
  schools: PlatformSchool[];
  requests: RegistrationRequest[];
  emailConfigured: boolean;
};

export type RegistrationDecision = {
  request: RegistrationRequest;
  school?: PlatformSchool | null;
  acceptUrl?: string;
  emailSent?: boolean;
};

export function getPlatformOverview(): Promise<PlatformOverview> {
  return apiFetch<PlatformOverview>("/api/v1/platform/schools/");
}

export async function createPlatformSchool(values: {
  name: string;
  kind: PlatformSchool["kind"];
  joinAsAdministrator: boolean;
}): Promise<PlatformSchool> {
  await ensureCsrf();
  return apiFetch<PlatformSchool>("/api/v1/platform/schools/", {
    method: "POST",
    body: JSON.stringify(values),
  });
}

export async function decideRegistration(
  id: number,
  decision: "approve" | "decline",
): Promise<RegistrationDecision> {
  await ensureCsrf();
  return apiFetch<RegistrationDecision>(`/api/v1/platform/registrations/${id}/${decision}/`, {
    method: "POST",
  });
}

export type ContactMessage = {
  id: number;
  name: string;
  email: string;
  organisation: string;
  topic: string;
  topicLabel: string;
  message: string;
  handled: boolean;
  createdAt: string;
};

export function listContactMessages(): Promise<ContactMessage[]> {
  return apiFetch<ContactMessage[]>("/api/v1/contact/");
}

export async function setContactHandled(id: number, handled: boolean): Promise<ContactMessage> {
  await ensureCsrf();
  return apiFetch<ContactMessage>(`/api/v1/contact/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ handled }),
  });
}

export async function updatePlatformSchool(
  id: number,
  changes: Partial<{
    name: string;
    kind: PlatformSchool["kind"];
    isActive: boolean;
    researchEnabled: boolean;
  }>,
): Promise<PlatformSchool> {
  await ensureCsrf();
  return apiFetch<PlatformSchool>(`/api/v1/platform/schools/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export async function deletePlatformSchool(id: number): Promise<void> {
  await ensureCsrf();
  await apiFetch(`/api/v1/platform/schools/${id}/`, { method: "DELETE" });
}

export async function deleteContactMessage(id: number): Promise<void> {
  await ensureCsrf();
  await apiFetch(`/api/v1/contact/${id}/`, { method: "DELETE" });
}
