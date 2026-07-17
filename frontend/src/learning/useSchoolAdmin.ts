import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createSchoolInvitation,
  listSchoolInvitations,
  listSchoolMembers,
  setSchoolMemberActive,
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
    mutationFn: ({ email, role }: { email: string; role: SchoolMember["role"] }) =>
      createSchoolInvitation(email, role),
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
