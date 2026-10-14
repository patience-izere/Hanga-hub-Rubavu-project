import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getInstructorAttempt,
  getInstructorAssignmentOptions,
  getInstructorOverview,
  getInstructorRoster,
  getInstructorLearner,
  createInstructorAssignments,
  overrideAttemptRecommendation,
  signOffAttempt,
  submitInstructorFeedback,
  updateInstructorAssignment,
  updateInstructorFeedback,
  type InstructorAssignmentChanges,
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

export function useInstructorRoster() {
  return useQuery({
    queryKey: ["learning", "instructor", "roster"],
    queryFn: getInstructorRoster,
  });
}

export function useInstructorLearner(id: number) {
  return useQuery({
    queryKey: ["learning", "instructor", "learners", id],
    queryFn: () => getInstructorLearner(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}

function useInvalidateAttemptEvidence(id: number) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["learning", "instructor", "attempts", id] });
    void queryClient.invalidateQueries({ queryKey: instructorOverviewKey });
    void queryClient.invalidateQueries({ queryKey: ["learning", "instructor", "learners"] });
    void queryClient.invalidateQueries({ queryKey: ["learning", "instructor", "roster"] });
  };
}

export function useUpdateInstructorFeedback(attemptId: number) {
  const invalidate = useInvalidateAttemptEvidence(attemptId);
  return useMutation({
    mutationFn: ({
      feedbackId,
      ...input
    }: {
      feedbackId: number;
      observation?: string;
      feedback?: string;
      is_published?: boolean;
    }) => updateInstructorFeedback(attemptId, feedbackId, input),
    onSuccess: invalidate,
  });
}

export function useSignOffAttempt(id: number) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAttemptEvidence(id);
  return useMutation({
    mutationFn: (input: Parameters<typeof signOffAttempt>[1]) => signOffAttempt(id, input),
    onSuccess: (review) => {
      queryClient.setQueryData(["learning", "instructor", "attempts", id], review);
      invalidate();
    },
  });
}

export function useUpdateInstructorAssignment(learnerId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: InstructorAssignmentChanges }) =>
      updateInstructorAssignment(id, changes),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["learning", "instructor", "learners", learnerId],
      });
      void queryClient.invalidateQueries({ queryKey: ["learning", "instructor", "roster"] });
      void queryClient.invalidateQueries({ queryKey: instructorOverviewKey });
    },
  });
}
