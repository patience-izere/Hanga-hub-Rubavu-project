import { apiFetch, ensureCsrf } from "../api/client";

export type ClientErrorKind = "component_error" | "unhandled_error" | "unhandled_rejection";

const reported = new Set<string>();
const release = import.meta.env.VITE_RELEASE_VERSION || "development";

export async function reportClientError(kind: ClientErrorKind): Promise<void> {
  const route = window.location.pathname;
  const fingerprint = `${kind}:${route}`;
  if (reported.has(fingerprint)) return;
  reported.add(fingerprint);

  try {
    await ensureCsrf();
    await apiFetch<{ accepted: boolean }>("/api/v1/monitoring/client-errors/", {
      method: "POST",
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        kind,
        route,
        release,
      }),
    });
  } catch {
    // Monitoring must never interrupt learning or recursively report its own failure.
  }
}

export function installGlobalErrorMonitoring(): () => void {
  const onError = () => void reportClientError("unhandled_error");
  const onUnhandledRejection = () => void reportClientError("unhandled_rejection");
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
