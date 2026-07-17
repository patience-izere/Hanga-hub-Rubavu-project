import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  completeAttempt,
  getAssignment,
  getAttempt,
  listAssignments,
  recordAttemptAction,
  startAssignment,
} from "../api/learning";

export const assignmentsQueryKey = ["learning", "assignments"] as const;

export function useAssignments() {
  return useQuery({ queryKey: assignmentsQueryKey, queryFn: listAssignments });
}

export function useAssignment(id: number) {
  return useQuery({
    queryKey: [...assignmentsQueryKey, id],
    queryFn: () => getAssignment(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export function useStartAssignment(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startAssignment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignmentsQueryKey });
    },
  });
}

export function useAttempt(id: number) {
  return useQuery({
    queryKey: ["learning", "attempts", id],
    queryFn: () => getAttempt(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export function useRecordAttemptAction(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, source }: { action: string; source: "scene" | "accessible-controls" }) =>
      recordAttemptAction(id, action, { source }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["learning", "attempts", id] });
    },
  });
}

export function useCompleteAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => completeAttempt(id),
    onSuccess: (attempt) => {
      queryClient.setQueryData(["learning", "attempts", id], attempt);
      void queryClient.invalidateQueries({ queryKey: assignmentsQueryKey });
    },
  });
}
