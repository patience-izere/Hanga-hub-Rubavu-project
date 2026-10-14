import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addCourseCompetency,
  addCourseModule,
  cloneAuthoredScenario,
  createAuthoringCourse,
  createAuthoringLesson,
  createLessonScenario,
  getAuthoredScenario,
  getAuthoringLesson,
  getLessonHistory,
  listAuthoredScenarios,
  listAuthoredAssetPackages,
  listAuthoringCourses,
  listAuthoringLessons,
  listGradingPolicies,
  publishAuthoredAssetPackage,
  publishAuthoredScenario,
  reviseAuthoringLesson,
  transitionAuthoredScenario,
  transitionAuthoringLesson,
  updateAuthoredScenario,
  updateAuthoringLesson,
  uploadAuthoredAsset,
  type AuthoredScenario,
  type LessonInput,
  type LessonTransition,
} from "../api/content";

const authoringKey = ["content", "scenarios"] as const;

export function useAuthoredScenarios() {
  return useQuery({ queryKey: authoringKey, queryFn: listAuthoredScenarios });
}

export function useAuthoredScenario(id: number) {
  return useQuery({
    queryKey: [...authoringKey, id],
    queryFn: () => getAuthoredScenario(id),
    enabled: id > 0,
  });
}

/** Every Studio mutation can change lessons, scenarios and checks, so refresh them together. */
function useRefreshAfter<TInput, TResult = unknown>(
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["content"] }),
  });
}

export function useUpdateAuthoredScenario() {
  return useRefreshAfter(
    ({
      id,
      ...input
    }: { id: number } & Partial<
      Pick<AuthoredScenario, "title" | "definition" | "grading_policy" | "asset_package">
    >) => updateAuthoredScenario(id, input),
  );
}

const coursesKey = ["content", "courses"] as const;
const lessonsKey = ["content", "lessons"] as const;

export function useAuthoringCourses() {
  return useQuery({ queryKey: coursesKey, queryFn: listAuthoringCourses });
}

export function useCreateAuthoringCourse() {
  return useRefreshAfter(createAuthoringCourse);
}

export function useAddCourseCompetency() {
  return useRefreshAfter(
    ({
      courseId,
      ...input
    }: {
      courseId: number;
      code: string;
      title: string;
      description: string;
    }) => addCourseCompetency(courseId, input),
  );
}

export function useAddCourseModule() {
  return useRefreshAfter(
    ({ courseId, ...input }: { courseId: number; title: string; description: string }) =>
      addCourseModule(courseId, input),
  );
}

export function useAuthoringLessons() {
  return useQuery({ queryKey: lessonsKey, queryFn: listAuthoringLessons });
}

export function useAuthoringLesson(id: number) {
  return useQuery({
    queryKey: [...lessonsKey, id],
    queryFn: () => getAuthoringLesson(id),
    enabled: id > 0,
  });
}

export function useCreateAuthoringLesson() {
  return useRefreshAfter((input: LessonInput) => createAuthoringLesson(input));
}

export function useUpdateAuthoringLesson() {
  return useRefreshAfter(({ id, ...input }: { id: number } & Partial<LessonInput>) =>
    updateAuthoringLesson(id, input),
  );
}

export function useTransitionAuthoringLesson() {
  return useRefreshAfter(
    ({ id, action, reviewNotes }: { id: number; action: LessonTransition; reviewNotes?: string }) =>
      transitionAuthoringLesson(id, action, reviewNotes),
  );
}

export function useCreateLessonScenario() {
  return useRefreshAfter(
    ({ lessonId, gradingPolicy }: { lessonId: number; gradingPolicy?: number }) =>
      createLessonScenario(lessonId, gradingPolicy),
  );
}

export function useGradingPolicies() {
  return useQuery({ queryKey: ["content", "grading-policies"], queryFn: listGradingPolicies });
}

export function useCloneAuthoredScenario() {
  return useRefreshAfter((id: number) => cloneAuthoredScenario(id));
}

export function usePublishAuthoredScenario() {
  return useRefreshAfter((id: number) => publishAuthoredScenario(id));
}

export function useTransitionAuthoredScenario() {
  return useRefreshAfter(
    ({
      id,
      action,
      reviewNotes,
    }: {
      id: number;
      action: "submit" | "approve" | "return_to_draft" | "retire";
      reviewNotes?: string;
    }) => transitionAuthoredScenario(id, action, reviewNotes),
  );
}

const assetsKey = ["content", "asset-packages"] as const;

export function useAuthoredAssetPackages() {
  return useQuery({ queryKey: assetsKey, queryFn: listAuthoredAssetPackages });
}

export function useUploadAuthoredAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      packageId,
      file,
      role,
      licenseSpdx,
      sourceAttribution,
      altText,
      transcript,
    }: {
      packageId: number;
      file: File;
      role: string;
      licenseSpdx: string;
      sourceAttribution: string;
      altText: string;
      transcript: string;
    }) =>
      uploadAuthoredAsset(packageId, {
        file,
        role,
        licenseSpdx,
        sourceAttribution,
        altText,
        transcript,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetsKey }),
  });
}

export function usePublishAuthoredAssetPackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: publishAuthoredAssetPackage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetsKey }),
  });
}

export function useLessonHistory(id: number) {
  return useQuery({
    queryKey: [...lessonsKey, id, "history"],
    queryFn: () => getLessonHistory(id),
    enabled: id > 0,
  });
}

export function useReviseAuthoringLesson() {
  return useRefreshAfter((id: number) => reviseAuthoringLesson(id));
}
