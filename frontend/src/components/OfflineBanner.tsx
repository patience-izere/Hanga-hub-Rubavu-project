import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Says plainly that the device is offline. Without it, pages that need the server showed
 * "Loading…" for as long as the connection was down.
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <p className="offline-banner" role="status">
      <strong>You&apos;re offline.</strong> Pages that need a connection will load when you
      reconnect. Lessons you downloaded still work.
    </p>
  );
}
