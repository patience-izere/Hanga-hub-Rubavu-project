import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { currentUser, signIn, signOut } from "../api/client";

export const authQueryKey = ["auth", "current-user"] as const;

export function useCurrentUser() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: currentUser,
    staleTime: 60_000,
    retry: false,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),
    onSuccess: (user) => queryClient.setQueryData(authQueryKey, user),
  });
}

export function useSignOut() {
  return useMutation({
    mutationFn: signOut,
  });
}
