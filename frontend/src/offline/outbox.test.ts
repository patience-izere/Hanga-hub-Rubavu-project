import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import {
  discardBlockedOutboxItems,
  listOutboxItems,
  queueOutboxItem,
  synchronizeOutbox,
  type OfflineAction,
} from "./outbox";

const api = vi.hoisted(() => ({
  ingestAttemptEvents: vi.fn(),
  reconcileAttemptSync: vi.fn(),
  recordAttemptAction: vi.fn(),
}));

vi.mock("../api/learning", () => api);

function action(id: string, createdAt: string, attemptId = 42): OfflineAction {
  return {
    id,
    attemptId,
    kind: "action",
    action: id,
    rendererMode: "accessible_2d",
    metadata: { scenarioVersion: 3 },
    createdAt,
    syncStatus: "pending",
  };
}

function clearDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("opedu-offline-v1");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Offline test database remained open."));
  });
}

beforeEach(async () => {
  await clearDatabase();
  api.ingestAttemptEvents.mockReset().mockResolvedValue([]);
  api.recordAttemptAction.mockReset().mockResolvedValue({});
  api.reconcileAttemptSync.mockReset().mockResolvedValue({ passed: true });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("offline evidence outbox", () => {
  it("replays delayed items in their original order and removes accepted evidence", async () => {
    await queueOutboxItem(action("second", "2026-08-22T10:00:02Z"));
    await queueOutboxItem(action("first", "2026-08-22T10:00:01Z"));

    const result = await synchronizeOutbox(42);

    expect(result).toEqual({ synchronized: 2, pending: 0 });
    expect(api.recordAttemptAction.mock.calls.map((call) => call[1])).toEqual(["first", "second"]);
    expect(api.reconcileAttemptSync).toHaveBeenCalledWith(42, ["first", "second"], 0);
    expect(await listOutboxItems()).toEqual([]);
  });

  it("preserves stale-version evidence and stops later replay for review", async () => {
    api.recordAttemptAction.mockRejectedValueOnce(
      new ApiError(409, "The offline evidence uses a stale scenario version."),
    );
    await queueOutboxItem(action("stale", "2026-08-22T10:00:01Z"));
    await queueOutboxItem(action("later", "2026-08-22T10:00:02Z"));

    const result = await synchronizeOutbox(42);
    const retained = await listOutboxItems();

    expect(result).toEqual({ synchronized: 0, pending: 2 });
    expect(retained[0]).toEqual(expect.objectContaining({ id: "stale", syncStatus: "stale" }));
    expect(api.recordAttemptAction).toHaveBeenCalledOnce();
  });

  it("deduplicates replacement writes and clears evidence after a successful retry", async () => {
    const item = action("same-id", "2026-08-22T10:00:01Z");
    await queueOutboxItem(item);
    await queueOutboxItem({ ...item, lastError: "prior interruption" });
    expect(await listOutboxItems()).toHaveLength(1);

    expect(await synchronizeOutbox(42)).toEqual({ synchronized: 1, pending: 0 });
    expect(await listOutboxItems()).toHaveLength(0);
  });

  it("shares one replay when automatic and manual synchronization start together", async () => {
    let acceptAction: ((value: object) => void) | undefined;
    api.recordAttemptAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acceptAction = resolve;
        }),
    );
    await queueOutboxItem(action("one-delivery", "2026-08-22T10:00:01Z"));

    const automatic = synchronizeOutbox(42);
    const manual = synchronizeOutbox(42);

    expect(manual).toBe(automatic);
    await vi.waitFor(() => expect(api.recordAttemptAction).toHaveBeenCalledOnce());
    acceptAction?.({});
    await expect(Promise.all([automatic, manual])).resolves.toEqual([
      { synchronized: 1, pending: 0 },
      { synchronized: 1, pending: 0 },
    ]);
    expect(await listOutboxItems()).toEqual([]);
  });

  it("keeps other attempts synchronizing when one attempt's evidence is refused", async () => {
    api.recordAttemptAction.mockRejectedValueOnce(
      new ApiError(409, "This attempt is no longer active."),
    );
    await queueOutboxItem(action("closed", "2026-08-22T10:00:01Z", 7));
    await queueOutboxItem(action("closed-later", "2026-08-22T10:00:02Z", 7));
    await queueOutboxItem(action("other", "2026-08-22T10:00:03Z", 42));

    expect(await synchronizeOutbox()).toEqual({ synchronized: 1, pending: 2 });
    expect(api.recordAttemptAction.mock.calls.map((call) => call[1])).toEqual(["closed", "other"]);
    const retained = await listOutboxItems();
    expect(retained.map((item) => [item.id, item.syncStatus])).toEqual([
      ["closed", "conflict"],
      ["closed-later", "pending"],
    ]);

    // A refused attempt is not replayed on every reconnect.
    api.recordAttemptAction.mockClear();
    await synchronizeOutbox();
    expect(api.recordAttemptAction).not.toHaveBeenCalled();
  });

  it("leaves evidence untouched when the connection drops mid-replay", async () => {
    api.recordAttemptAction.mockRejectedValueOnce(
      new ApiError(0, "Cannot reach the server.", "network_error"),
    );
    await queueOutboxItem(action("first", "2026-08-22T10:00:01Z"));
    await queueOutboxItem(action("second", "2026-08-22T10:00:02Z", 7));

    expect(await synchronizeOutbox()).toEqual({ synchronized: 0, pending: 2 });
    expect(api.recordAttemptAction).toHaveBeenCalledOnce();
    expect((await listOutboxItems()).map((item) => item.syncStatus)).toEqual([
      "pending",
      "pending",
    ]);
  });

  it("discards an attempt's refused evidence only when something was refused", async () => {
    await queueOutboxItem(action("waiting", "2026-08-22T10:00:01Z"));
    expect(await discardBlockedOutboxItems(42)).toBe(0);

    await queueOutboxItem({ ...action("stale", "2026-08-22T10:00:00Z"), syncStatus: "stale" });
    await queueOutboxItem(action("elsewhere", "2026-08-22T10:00:02Z", 7));
    expect(await discardBlockedOutboxItems(42)).toBe(2);
    expect((await listOutboxItems()).map((item) => item.id)).toEqual(["elsewhere"]);
  });
});
