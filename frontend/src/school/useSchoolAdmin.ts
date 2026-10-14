import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createSchoolCohort,
  createSchoolInvitation,
  getSchoolAudit,
  getSchoolOverview,
  listSchoolCohorts,
  listSchoolInvitations,
  listSchoolMembers,
  revokeSchoolInvitation,
  setSchoolMemberActive,
  updateSchoolCohort,
  updateSchoolMember,
  type SchoolMember,
} from "@/api/school";

const membersKey = ["school", "members"] as const;
const invitationsKey = ["school", "invitations"] as const;

export function useSchoolMembers() {
  return useQuery({ queryKey: membersKey, queryFn: listSchoolMembers });
}

export function useSchoolInvitations() {
  return useQuery({ queryKey: invitationsKey, queryFn: listSchoolInvitations });
}

export function useCreateSchoolInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      email,
      role,
      schoolId,
    }: {
      email: string;
      role: SchoolMember["role"];
      schoolId?: number;
    }) => createSchoolInvitation(email, role, schoolId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey }),
  });
}

export function useSetSchoolMemberActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      setSchoolMemberActive(id, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey }),
  });
}

export function useSchoolOverview() {
  return useQuery({ queryKey: ["school", "overview"], queryFn: getSchoolOverview });
}

export function useUpdateSchoolMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: number; role?: SchoolMember["role"] }) =>
      updateSchoolMember(id, changes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: membersKey });
      void queryClient.invalidateQueries({ queryKey: ["school", "overview"] });
    },
  });
}

/** The audit trail, newest first, loading older pages on request. */
export function useSchoolAudit(eventType: string) {
  return useInfiniteQuery({
    queryKey: ["school", "audit", eventType],
    queryFn: ({ pageParam }) =>
      getSchoolAudit({ eventType: eventType || undefined, before: pageParam ?? undefined }),
    initialPageParam: null as number | null,
    getNextPageParam: (page) => page.nextBefore,
  });
}

const cohortsKey = ["school", "cohorts"] as const;

export function useSchoolCohorts() {
  return useQuery({ queryKey: cohortsKey, queryFn: listSchoolCohorts });
}

function useInvalidateCohorts() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: cohortsKey });
    void queryClient.invalidateQueries({ queryKey: ["school", "overview"] });
    void queryClient.invalidateQueries({ queryKey: ["learning", "instructor"] });
  };
}

export function useCreateSchoolCohort() {
  return useMutation({ mutationFn: createSchoolCohort, onSuccess: useInvalidateCohorts() });
}

export function useUpdateSchoolCohort() {
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: number } & Parameters<typeof updateSchoolCohort>[1]) =>
      updateSchoolCohort(id, changes),
    onSuccess: useInvalidateCohorts(),
  });
}

export function useRevokeSchoolInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeSchoolInvitation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invitationsKey });
      void queryClient.invalidateQueries({ queryKey: ["school", "overview"] });
    },
  });
}
