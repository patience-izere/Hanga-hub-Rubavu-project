import {
  ingestAttemptEvents,
  reconcileAttemptSync,
  recordAttemptAction,
  type AttemptDetail,
  type RendererMode,
  type TelemetryEventInput,
} from "../api/learning";
import { ApiError } from "../api/client";

const DATABASE = "opedu-offline-v1";
const DATABASE_VERSION = 3;
const STORE = "event-outbox";
const SNAPSHOT_STORE = "attempt-snapshots";
const DELIVERY_STORE = "delivery-ledger";
const LESSON_CACHE = "opedu-lessons-v1";
const memoryOutbox = new Map<string, OutboxItem>();
const memorySnapshots = new Map<number, AttemptDetail>();
const memoryDeliveries = new Map<string, DeliveryReceipt>();
let databasePromise: Promise<IDBDatabase> | null = null;
let synchronizationPromise: Promise<{ synchronized: number; pending: number }> | null = null;

export type OfflineAction = {
  id: string;
  attemptId: number;
  kind: "action";
  action: string;
  rendererMode: RendererMode;
  metadata: Record<string, unknown>;
  createdAt: string;
  syncStatus?: "pending" | "failed" | "conflict" | "stale";
  lastError?: string;
};

export type OfflineTelemetry = {
  id: string;
  attemptId: number;
  kind: "telemetry";
  event: TelemetryEventInput;
  createdAt: string;
  syncStatus?: "pending" | "failed" | "conflict" | "stale";
  lastError?: string;
};

export type OutboxItem = OfflineAction | OfflineTelemetry;

type DeliveryReceipt = {
  key: string;
  attemptId: number;
  eventId: string;
  deliveredAt: string;
};

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(DELIVERY_STORE)) {
        const store = database.createObjectStore(DELIVERY_STORE, { keyPath: "key" });
        store.createIndex("attemptId", "attemptId");
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error);
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("The offline evidence database upgrade is blocked by another tab."));
    };
  });
  return databasePromise;
}

export async function saveAttemptSnapshot(attempt: AttemptDetail) {
  if (typeof indexedDB === "undefined") {
    memorySnapshots.set(attempt.id, attempt);
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
    transaction.objectStore(SNAPSHOT_STORE).put(attempt);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAttemptSnapshot(id: number): Promise<AttemptDetail | undefined> {
  if (typeof indexedDB === "undefined") return memorySnapshots.get(id);
  const database = await openDatabase();
  const attempt = await new Promise<AttemptDetail | undefined>((resolve, reject) => {
    const request = database
      .transaction(SNAPSHOT_STORE, "readonly")
      .objectStore(SNAPSHOT_STORE)
      .get(id);
    request.onsuccess = () => resolve(request.result as AttemptDetail | undefined);
    request.onerror = () => reject(request.error);
  });
  return attempt;
}

export type DownloadableAsset = string | { url: string; sha256?: string };

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function downloadAssignmentAssets(assets: DownloadableAsset[]) {
  if (!("caches" in window)) {
    throw new Error("Offline lesson downloads are not supported by this browser.");
  }
  const cache = await caches.open(LESSON_CACHE);
  const uniqueAssets = new Map<string, { url: string; sha256?: string }>();
  for (const asset of assets) {
    const normalized = typeof asset === "string" ? { url: asset } : asset;
    if (normalized.url) uniqueAssets.set(normalized.url, normalized);
  }
  let downloaded = 0;
  const failed: string[] = [];
  for (const asset of uniqueAssets.values()) {
    try {
      const response = await fetch(asset.url, { credentials: "include" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (asset.sha256) {
        const buffer = await response.arrayBuffer();
        const actual = await sha256Hex(buffer);
        if (actual !== asset.sha256.toLowerCase()) throw new Error("Checksum mismatch");
        await cache.put(
          asset.url,
          new Response(buffer, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          }),
        );
      } else {
        await cache.put(asset.url, response.clone());
      }
      downloaded += 1;
    } catch {
      failed.push(asset.url);
    }
  }
  return { downloaded, failed, total: uniqueAssets.size };
}

export async function removeAssignmentAssets(assets: DownloadableAsset[]) {
  if (!("caches" in window)) return 0;
  const cache = await caches.open(LESSON_CACHE);
  const urls = [...new Set(assets.map((asset) => (typeof asset === "string" ? asset : asset.url)))];
  const removed = await Promise.all(urls.map((url) => cache.delete(url)));
  return removed.filter(Boolean).length;
}

export async function queueOutboxItem(item: OutboxItem) {
  if (typeof indexedDB === "undefined") {
    memoryOutbox.set(item.id, item);
    window.dispatchEvent(new CustomEvent("opedu:outbox-changed"));
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Evidence storage aborted."));
    transaction.objectStore(STORE).put(item);
    transaction.commit?.();
  });
  window.dispatchEvent(new CustomEvent("opedu:outbox-changed"));
}

export async function listOutboxItems(): Promise<OutboxItem[]> {
  if (typeof indexedDB === "undefined") {
    return [...memoryOutbox.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }
  const database = await openDatabase();
  const items = await new Promise<OutboxItem[]>((resolve, reject) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as OutboxItem[]);
    request.onerror = () => reject(request.error);
  });
  return items.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function removeOutboxItem(id: string) {
  if (typeof indexedDB === "undefined") {
    memoryOutbox.delete(id);
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    transaction.objectStore(STORE).delete(id);
    transaction.commit?.();
  });
}

async function saveDeliveryReceipt(attemptId: number, eventId: string) {
  const receipt: DeliveryReceipt = {
    key: `${attemptId}:${eventId}`,
    attemptId,
    eventId,
    deliveredAt: new Date().toISOString(),
  };
  if (typeof indexedDB === "undefined") {
    memoryDeliveries.set(receipt.key, receipt);
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DELIVERY_STORE, "readwrite");
    transaction.objectStore(DELIVERY_STORE).put(receipt);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function listDeliveryReceipts(): Promise<DeliveryReceipt[]> {
  if (typeof indexedDB === "undefined") return [...memoryDeliveries.values()];
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(DELIVERY_STORE, "readonly")
      .objectStore(DELIVERY_STORE)
      .getAll();
    request.onsuccess = () => resolve(request.result as DeliveryReceipt[]);
    request.onerror = () => reject(request.error);
  });
}

async function clearDeliveryReceipts(receipts: DeliveryReceipt[]) {
  if (typeof indexedDB === "undefined") {
    receipts.forEach((receipt) => memoryDeliveries.delete(receipt.key));
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DELIVERY_STORE, "readwrite");
    const store = transaction.objectStore(DELIVERY_STORE);
    receipts.forEach((receipt) => store.delete(receipt.key));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function reconcileDeliveryReceipts(pendingItems: OutboxItem[]) {
  const receipts = await listDeliveryReceipts();
  const byAttempt = new Map<number, DeliveryReceipt[]>();
  receipts.forEach((receipt) => {
    byAttempt.set(receipt.attemptId, [...(byAttempt.get(receipt.attemptId) ?? []), receipt]);
  });
  for (const [receiptAttemptId, attemptReceipts] of byAttempt) {
    if (pendingItems.some((item) => item.attemptId === receiptAttemptId)) continue;
    try {
      const audit = await reconcileAttemptSync(
        receiptAttemptId,
        attemptReceipts.map((receipt) => receipt.eventId),
        0,
      );
      if (audit.passed) await clearDeliveryReceipts(attemptReceipts);
    } catch {
      // Keep the ledger for the next reconnect; learning synchronization already succeeded.
    }
  }
}

async function runOutboxSynchronization(attemptId?: number) {
  if (!navigator.onLine) return { synchronized: 0, pending: (await listOutboxItems()).length };
  const items = (await listOutboxItems()).filter(
    (item) => attemptId === undefined || item.attemptId === attemptId,
  );
  let synchronized = 0;
  for (const item of items) {
    try {
      if (item.kind === "action") {
        await recordAttemptAction(
          item.attemptId,
          item.action,
          {
            ...item.metadata,
            rendererMode: item.rendererMode,
            occurredAt: item.createdAt,
            synchronizedFromOutbox: true,
          },
          item.id,
        );
      } else {
        await ingestAttemptEvents(item.attemptId, [item.event]);
      }
      await saveDeliveryReceipt(
        item.attemptId,
        item.kind === "action" ? item.id : item.event.eventId,
      );
      await removeOutboxItem(item.id);
      synchronized += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Synchronization failed.";
      const syncStatus =
        error instanceof ApiError && error.status === 409
          ? message.toLowerCase().includes("version")
            ? "stale"
            : "conflict"
          : "failed";
      await queueOutboxItem({
        ...item,
        syncStatus,
        lastError: message,
      });
      break;
    }
  }
  const pending = (await listOutboxItems()).length;
  await reconcileDeliveryReceipts(await listOutboxItems());
  window.dispatchEvent(new CustomEvent("opedu:outbox-changed", { detail: { pending } }));
  return { synchronized, pending };
}

export function synchronizeOutbox(attemptId?: number) {
  if (synchronizationPromise) return synchronizationPromise;
  const operation = runOutboxSynchronization(attemptId);
  synchronizationPromise = operation.finally(() => {
    synchronizationPromise = null;
  });
  return synchronizationPromise;
}

export function createOfflineAction(
  attemptId: number,
  action: string,
  rendererMode: RendererMode,
  metadata: Record<string, unknown>,
): OfflineAction {
  const createdAt = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    attemptId,
    kind: "action",
    action,
    rendererMode,
    metadata,
    createdAt,
    syncStatus: "pending",
  };
}

export function createTelemetryEvent(
  attemptId: number,
  rendererMode: RendererMode,
  eventType: TelemetryEventInput["eventType"],
  payload: Record<string, unknown> = {},
): OfflineTelemetry {
  const createdAt = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    attemptId,
    kind: "telemetry",
    createdAt,
    syncStatus: "pending",
    event: {
      eventId: crypto.randomUUID(),
      eventType,
      rendererMode,
      occurredAt: createdAt,
      payload,
    },
  };
}
