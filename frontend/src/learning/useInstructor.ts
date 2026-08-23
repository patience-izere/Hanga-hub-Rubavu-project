import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getInstructorAttempt,
  getInstructorAssignmentOptions,
  getInstructorOverview,
  createInstructorAssignments,
  overrideAttemptRecommendation,
  submitInstructorFeedback,
} from "../api/instructor";

export const instructorOverviewKey = ["learning", "instructor", "overview"] as const;

export function useInstructorOverview() {
  return useQuery({ queryKey: instructorOverviewKey, queryFn: getInstructorOverview });
}

export function useInstructorAttempt(id: number) {
  return useQuery({
    queryKey: ["learning", "instructor", "attempts", id],
    queryFn: () => getInstructorAttempt(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export function useSubmitInstructorFeedback(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { observation: string; feedback: string; is_published: boolean }) =>
      submitInstructorFeedback(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["learning", "instructor", "attempts", id],
      });
      void queryClient.invalidateQueries({ queryKey: instructorOverviewKey });
    },
  });
}

export function useOverrideAttemptRecommendation(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof overrideAttemptRecommendation>[1]) =>
      overrideAttemptRecommendation(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["learning", "instructor", "attempts", id],
      });
    },
  });
}

export function useInstructorAssignmentOptions() {
  return useQuery({
    queryKey: ["learning", "instructor", "assignment-options"],
    queryFn: getInstructorAssignmentOptions,
  });
}

export function useCreateInstructorAssignments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createInstructorAssignments,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: instructorOverviewKey });
    },
  });
}
