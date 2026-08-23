import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPilotStudy,
  getPilotOptions,
  getPilotReport,
  getPilotStudies,
  recordPilotApproval,
  recordPilotIncident,
  recordPilotObservation,
  recordPilotRehearsal,
  recordPilotReview,
  transitionPilot,
} from "../api/pilot";

export const pilotsKey = ["research", "pilots"] as const;

export function usePilotStudies() {
  return useQuery({ queryKey: pilotsKey, queryFn: getPilotStudies });
}

export function usePilotOptions(enabled = true) {
  return useQuery({ queryKey: [...pilotsKey, "options"], queryFn: getPilotOptions, enabled });
}

export function usePilotReport(id: number | null) {
  return useQuery({
    queryKey: [...pilotsKey, id, "report"],
    queryFn: () => getPilotReport(id!),
    enabled: Boolean(id),
  });
}

export function usePilotMutation() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: pilotsKey });
  return {
    create: useMutation({ mutationFn: createPilotStudy, onSuccess: refresh }),
    transition: useMutation({
      mutationFn: ({ id, action }: { id: number; action: "freeze" | "start" | "close" }) =>
        transitionPilot(id, action),
      onSuccess: refresh,
    }),
    approval: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Record<string, unknown> }) =>
        recordPilotApproval(id, input),
      onSuccess: refresh,
    }),
    rehearsal: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Record<string, unknown> }) =>
        recordPilotRehearsal(id, input),
      onSuccess: refresh,
    }),
    observation: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: number;
        input: Parameters<typeof recordPilotObservation>[1];
      }) => recordPilotObservation(id, input),
      onSuccess: refresh,
    }),
    incident: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Record<string, unknown> }) =>
        recordPilotIncident(id, input),
      onSuccess: refresh,
    }),
    review: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Record<string, unknown> }) =>
        recordPilotReview(id, input),
      onSuccess: refresh,
    }),
  };
}
