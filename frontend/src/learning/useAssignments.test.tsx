import "fake-indexeddb/auto";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import type { AttemptDetail } from "../api/learning";
import { listOutboxItems } from "../offline/outbox";
import { useRecordAttemptAction } from "./useAssignments";

const api = vi.hoisted(() => ({ recordAttemptAction: vi.fn() }));

vi.mock("../api/learning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/learning")>()),
  recordAttemptAction: api.recordAttemptAction,
}));

const step = (order: number, code: string, action: string, safetyCritical = false) => ({
  id: order,
  order,
  code,
  title: code,
  instruction: `Do ${code}.`,
  action_code: action,
  acceptable_actions: [],
  safety_critical: safetyCritical,
  hints: [],
});

const attempt = {
  id: 42,
  status: "in_progress",
  scenario_version: 3,
  resume_state: { completedSteps: [], currentStep: "ppe" },
  assignment: {
    lesson: {
      procedure_steps: [step(1, "ppe", "confirm_ppe", true), step(2, "inspect", "inspect")],
    },
  },
} as unknown as AttemptDetail;

function setup(online: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: online });
  const queryClient = new QueryClient();
  queryClient.setQueryData(["learning", "attempts", 42], attempt);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useRecordAttemptAction(42), { wrapper });
}

function clearDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("opedu-offline-v1");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  await clearDatabase();
  api.recordAttemptAction.mockReset();
});

describe("recording practice actions offline", () => {
  it("keeps a wrong offline action as evidence instead of silently dropping it", async () => {
    const { result } = setup(false);
    let response: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      response = await result.current.mutateAsync({
        action: "inspect",
        source: "accessible-controls",
        rendererMode: "accessible_2d",
      });
    });
    expect(response?.correct).toBe(false);
    expect(response?.message).toMatch(/Safety sequence interrupted/);
    expect((await listOutboxItems()).map((item) => item.kind === "action" && item.action)).toEqual([
      "inspect",
    ]);
    expect(api.recordAttemptAction).not.toHaveBeenCalled();
  });

  it("falls back to the device when the browser says online but the server is unreachable", async () => {
    api.recordAttemptAction.mockRejectedValue(
      new ApiError(0, "Cannot reach the server.", "network_error"),
    );
    const { result } = setup(true);
    let response: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      response = await result.current.mutateAsync({
        action: "confirm_ppe",
        source: "accessible-controls",
        rendererMode: "accessible_2d",
      });
    });
    expect(response?.correct).toBe(true);
    expect(response?.attempt.resume_state.completedSteps).toEqual(["ppe"]);
    expect(await listOutboxItems()).toHaveLength(1);
  });

  it("does not hide a real server refusal behind offline storage", async () => {
    api.recordAttemptAction.mockRejectedValue(
      new ApiError(409, "This attempt is no longer active."),
    );
    const { result } = setup(true);
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          action: "confirm_ppe",
          source: "accessible-controls",
          rendererMode: "accessible_2d",
        }),
      ).rejects.toThrow("This attempt is no longer active.");
    });
    expect(await listOutboxItems()).toHaveLength(0);
  });
});
