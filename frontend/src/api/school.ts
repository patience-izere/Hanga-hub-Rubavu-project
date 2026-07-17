import { apiFetch, ensureCsrf } from "./client";

export type SchoolMember = {
  id: number;
  school: { id: number; name: string; code: string };
  user: { id: number; name: string; email: string };
  role: "admin" | "instructor" | "learner" | "content_author";
  is_active: boolean;
  created_at: string;
};

export type SchoolInvitation = {
  id: number;
  school: { id: number; name: string; code: string };
  email: string;
  role: SchoolMember["role"];
  expires_at: string;
  accepted_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type InvitationPreview = {
  schoolName: string;
  email: string;
  role: string;
  expiresAt: string;
};

export function listSchoolMembers(): Promise<SchoolMember[]> {
  return apiFetch<SchoolMember[]>("/api/v1/school/members/");
}

export function listSchoolInvitations(): Promise<SchoolInvitation[]> {
  return apiFetch<SchoolInvitation[]>("/api/v1/school/invitations/");
}

export async function createSchoolInvitation(email: string, role: SchoolMember["role"]) {
  await ensureCsrf();
  return apiFetch<{ invitation: SchoolInvitation; acceptUrl: string }>(
    "/api/v1/school/invitations/",
    { method: "POST", body: JSON.stringify({ email, role }) },
  );
}

export async function setSchoolMemberActive(id: number, isActive: boolean) {
  await ensureCsrf();
  return apiFetch<SchoolMember>(`/api/v1/school/members/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export function getInvitationPreview(token: string): Promise<InvitationPreview> {
  return apiFetch<InvitationPreview>(`/api/v1/school/invitations/accept/${token}/`);
}

export async function acceptInvitation(
  token: string,
  details: { firstName: string; lastName: string; password: string },
) {
  await ensureCsrf();
  return apiFetch<{ detail: string }>(`/api/v1/school/invitations/accept/${token}/`, {
    method: "POST",
    body: JSON.stringify(details),
  });
}
