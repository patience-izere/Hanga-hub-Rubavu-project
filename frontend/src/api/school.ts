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
  /** Whether the invited email already has an OPedu account (sign in instead of signing up). */
  accountExists: boolean;
};

export function listSchoolMembers(): Promise<SchoolMember[]> {
  return apiFetch<SchoolMember[]>("/api/v1/school/members/");
}

export function listSchoolInvitations(): Promise<SchoolInvitation[]> {
  return apiFetch<SchoolInvitation[]>("/api/v1/school/invitations/");
}

export async function createSchoolInvitation(
  email: string,
  role: SchoolMember["role"],
  schoolId?: number,
) {
  await ensureCsrf();
  return apiFetch<{ invitation: SchoolInvitation; acceptUrl: string; emailSent: boolean }>(
    "/api/v1/school/invitations/",
    { method: "POST", body: JSON.stringify({ email, role, schoolId }) },
  );
}

export async function updateSchoolMember(
  id: number,
  changes: { isActive?: boolean; role?: SchoolMember["role"] },
) {
  await ensureCsrf();
  return apiFetch<SchoolMember>(`/api/v1/school/members/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function setSchoolMemberActive(id: number, isActive: boolean) {
  return updateSchoolMember(id, { isActive });
}

export function getInvitationPreview(token: string): Promise<InvitationPreview> {
  return apiFetch<InvitationPreview>(`/api/v1/school/invitations/accept/${token}/`);
}

export async function acceptInvitation(
  token: string,
  details: { firstName: string; lastName: string; password: string } | Record<string, never>,
) {
  await ensureCsrf();
  return apiFetch<{ detail: string }>(`/api/v1/school/invitations/accept/${token}/`, {
    method: "POST",
    body: JSON.stringify(details),
  });
}

export type AuditEvent = {
  id: number;
  eventType: string;
  actorName: string;
  schoolName: string;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type SchoolOverview = {
  schools: Array<{ id: number; name: string; code: string }>;
  membersByRole: Record<string, number>;
  pendingInvitations: number;
  expiredInvitations: number;
  suspendedMembers: number;
  cohorts: Array<{
    id: number;
    name: string;
    code: string;
    school: string;
    learnerCount: number;
  }>;
  recentAudit: AuditEvent[];
};

export function getSchoolOverview(): Promise<SchoolOverview> {
  return apiFetch<SchoolOverview>("/api/v1/school/overview/");
}

export type SchoolAuditPage = {
  events: AuditEvent[];
  eventTypes: string[];
  /** Pass as `before` to fetch the next, older page; null on the last page. */
  nextBefore: number | null;
};

export function getSchoolAudit(filters: { eventType?: string; before?: number } = {}) {
  const query = new URLSearchParams();
  if (filters.eventType) query.set("eventType", filters.eventType);
  if (filters.before) query.set("before", String(filters.before));
  const suffix = query.size ? `?${query}` : "";
  return apiFetch<SchoolAuditPage>(`/api/v1/school/audit/${suffix}`);
}

export type SchoolPerson = { id: number; name: string; email: string };

export type SchoolCohort = {
  id: number;
  name: string;
  code: string;
  academicYear: string;
  isActive: boolean;
  school: { id: number; name: string; code: string };
  programName: string;
  learners: SchoolPerson[];
};

export type SchoolCohortList = {
  cohorts: SchoolCohort[];
  programs: Array<{ id: number; name: string; schoolId: number }>;
  learners: Array<SchoolPerson & { schoolId: number }>;
};

export function listSchoolCohorts(): Promise<SchoolCohortList> {
  return apiFetch<SchoolCohortList>("/api/v1/school/cohorts/");
}

export async function createSchoolCohort(input: {
  schoolId?: number;
  name: string;
  programName: string;
  academicYear: string;
}): Promise<SchoolCohort> {
  await ensureCsrf();
  return apiFetch<SchoolCohort>("/api/v1/school/cohorts/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSchoolCohort(
  id: number,
  changes: { name?: string; academicYear?: string; isActive?: boolean; learnerIds?: number[] },
): Promise<SchoolCohort> {
  await ensureCsrf();
  return apiFetch<SchoolCohort>(`/api/v1/school/cohorts/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export async function revokeSchoolInvitation(id: number): Promise<SchoolInvitation> {
  await ensureCsrf();
  return apiFetch<SchoolInvitation>(`/api/v1/school/invitations/${id}/`, { method: "DELETE" });
}
