import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  cloneAuthoredScenario,
  listAuthoredScenarios,
  listAuthoredAssetPackages,
  publishAuthoredAssetPackage,
  publishAuthoredScenario,
  transitionAuthoredScenario,
  updateAuthoredScenario,
  uploadAuthoredAsset,
} from "../api/content";

const authoringKey = ["content", "scenarios"] as const;

export function useAuthoredScenarios() {
  return useQuery({ queryKey: authoringKey, queryFn: listAuthoredScenarios });
}

function useRefreshAfter<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authoringKey }),
  });
}

export function useUpdateAuthoredScenario() {
  return useRefreshAfter(
    ({
      id,
      title,
      definition,
    }: {
      id: number;
      title: string;
      definition: Record<string, unknown>;
    }) => updateAuthoredScenario(id, { title, definition }),
  );
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
