import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  abandonAttempt,
  completeAttempt,
  getAssignmentKnowledgeCheck,
  getAssignment,
  getAttempt,
  ingestAttemptEvents,
  listAssignments,
  listAttempts,
  recordAttemptAction,
  requestAttemptHint,
  saveAssignmentKnowledgeCheck,
  selectAttemptRenderer,
  startAssignment,
  type AttemptDetail,
  type CapabilityProfile,
  type RendererMode,
  type TelemetryEventInput,
} from "../api/learning";
import { isNetworkError } from "../api/client";
import { evaluateAction } from "../procedure/engine";
import {
  createOfflineAction,
  createTelemetryEvent,
  getAttemptSnapshot,
  queueOutboxItem,
  saveAttemptSnapshot,
} from "../offline/outbox";

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
    /** `practice` starts a free practice run, which does not use up an attempt. */
    mutationFn: (practice: boolean | undefined = false) => startAssignment(id, practice),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignmentsQueryKey });
    },
  });
}

export function useKnowledgeCheck(id: number) {
  return useQuery({
    queryKey: ["learning", "assignments", id, "knowledge-check"],
    queryFn: () => getAssignmentKnowledgeCheck(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export function useSaveKnowledgeCheck(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: Parameters<typeof saveAssignmentKnowledgeCheck>[1]) =>
      saveAssignmentKnowledgeCheck(id, answers),
    onSuccess: (submission) => {
      queryClient.setQueryData(["learning", "assignments", id, "knowledge-check"], submission);
    },
  });
}

export function useAttempt(id: number) {
  return useQuery({
    queryKey: ["learning", "attempts", id],
    queryFn: async () => {
      try {
        const attempt = await getAttempt(id);
        await saveAttemptSnapshot(attempt);
        return attempt;
      } catch (error) {
        const snapshot = await getAttemptSnapshot(id);
        if (snapshot) return snapshot;
        throw error;
      }
    },
    enabled: Number.isInteger(id) && id > 0,
    networkMode: "always",
  });
}

export function useRecordAttemptAction(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      action,
      source,
      rendererMode,
    }: {
      action: string;
      source: "scene" | "accessible-controls" | "camera-ar";
      rendererMode: RendererMode;
    }) => {
      const eventId = crypto.randomUUID();
      const occurredAt = new Date().toISOString();
      const detail = queryClient.getQueryData<AttemptDetail>(["learning", "attempts", id]);
      if (navigator.onLine) {
        try {
          return await recordAttemptAction(
            id,
            action,
            { source, rendererMode, occurredAt, scenarioVersion: detail?.scenario_version },
            eventId,
          );
        } catch (error) {
          // The browser can claim to be online on a dead workshop Wi-Fi; keep the evidence locally.
          if (!isNetworkError(error)) throw error;
        }
      }

      if (!detail) throw new Error("Open the lesson online once before completing it offline.");
      const completed = detail.resume_state.completedSteps ?? [];
      const steps = detail.assignment.lesson.procedure_steps;
      // The same rules the server applies, so offline practice shows the same consequences.
      const outcome = evaluateAction(
        steps,
        completed,
        action,
        detail.assignment.scenario?.sequence ?? "ordered",
      );
      if (!outcome.step) {
        return {
          correct: true,
          message: outcome.repeated
            ? outcome.message
            : "All procedure steps are complete. Submit the attempt when you are back online.",
          consequence: null,
          currentStep: outcome.nextStep,
          isReadyToComplete: outcome.nextStep === null,
          attempt: detail,
        };
      }
      // Wrong actions are queued too: the server scores them, so practising offline must not hide
      // mistakes from the instructor.
      const outboxItem = createOfflineAction(id, action, rendererMode, {
        source,
        scenarioVersion: detail.scenario_version,
      });
      outboxItem.id = eventId;
      outboxItem.createdAt = occurredAt;
      await queueOutboxItem(outboxItem);
      if (!outcome.correct) {
        return {
          correct: false,
          message: `${outcome.message} This attempt is saved on this device.`,
          consequence: outcome.consequence,
          currentStep: outcome.nextStep,
          isReadyToComplete: false,
          attempt: detail,
        };
      }
      return {
        correct: true,
        message: "Saved on this device. It will be sent when the connection returns.",
        consequence: null,
        currentStep: outcome.nextStep,
        isReadyToComplete: outcome.nextStep === null,
        attempt: {
          ...detail,
          resume_state: {
            completedSteps: outcome.completedCodes,
            currentStep: outcome.nextStep?.code ?? null,
          },
        },
      };
    },
    onSuccess: (result) => {
      const current = queryClient.getQueryData<AttemptDetail>(["learning", "attempts", id]);
      if (current) {
        const updated: AttemptDetail = { ...current, ...result.attempt };
        queryClient.setQueryData<AttemptDetail>(["learning", "attempts", id], updated);
        void saveAttemptSnapshot(updated);
      }
      if (navigator.onLine) {
        void queryClient.invalidateQueries({ queryKey: ["learning", "attempts", id] });
      }
    },
    networkMode: "always",
  });
}

export function useRequestAttemptHint(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hintCode?: string) => requestAttemptHint(id, hintCode),
    onSuccess: (result) => {
      const current = queryClient.getQueryData<AttemptDetail>(["learning", "attempts", id]);
      if (!current) return;
      const updated: AttemptDetail = { ...current, ...result.attempt };
      queryClient.setQueryData(["learning", "attempts", id], updated);
      void saveAttemptSnapshot(updated);
    },
  });
}

export function useSelectAttemptRenderer(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mode,
      capabilityProfile,
      learningMode,
    }: {
      mode: RendererMode;
      capabilityProfile: CapabilityProfile;
      learningMode?: "guided" | "independent";
    }) => selectAttemptRenderer(id, mode, capabilityProfile, learningMode),
    onSuccess: (attempt) => {
      queryClient.setQueryData<AttemptDetail>(["learning", "attempts", id], (current) =>
        current ? { ...current, ...attempt } : current,
      );
      const snapshot = queryClient.getQueryData<AttemptDetail>(["learning", "attempts", id]);
      if (snapshot) void saveAttemptSnapshot(snapshot);
    },
  });
}

export function useRecordAttemptTelemetry(id: number) {
  return useMutation({
    mutationFn: async ({
      rendererMode,
      eventType,
      payload = {},
    }: {
      rendererMode: RendererMode;
      eventType: TelemetryEventInput["eventType"];
      payload?: Record<string, unknown>;
    }) => {
      const offline = createTelemetryEvent(id, rendererMode, eventType, payload);
      if (!navigator.onLine) {
        await queueOutboxItem(offline);
        return [];
      }
      return ingestAttemptEvents(id, [offline.event]);
    },
    networkMode: "always",
  });
}

export function useCompleteAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => completeAttempt(id),
    onSuccess: (attempt) => {
      queryClient.setQueryData(["learning", "attempts", id], attempt);
      void saveAttemptSnapshot(attempt);
      void queryClient.invalidateQueries({ queryKey: assignmentsQueryKey });
    },
  });
}

export function useAbandonAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => abandonAttempt(id),
    onSuccess: (attempt) => {
      queryClient.setQueryData(["learning", "attempts", id], attempt);
      void saveAttemptSnapshot(attempt);
      void queryClient.invalidateQueries({ queryKey: assignmentsQueryKey });
    },
  });
}

/** Every attempt this learner has made, newest first. Backs the progress view. */
export function useAttempts() {
  return useQuery({ queryKey: ["learning", "attempts"], queryFn: listAttempts });
}
