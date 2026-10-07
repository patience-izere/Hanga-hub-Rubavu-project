/**
 * Camera discovery for the AR renderers.
 *
 * `navigator.mediaDevices.getUserMedia` existing only proves the browser has the API, not that a
 * camera is attached. A shared workshop desktop with no webcam reports the API and then fails at
 * `getUserMedia` time, so availability is decided by enumerating real video inputs instead.
 *
 * Browsers withhold device labels — and, in Firefox, most of the list — until camera permission
 * has been granted, so a full labelled list is only available after `getUserMedia` has succeeded
 * once. Counting inputs works before permission in Chromium; treat a zero count from a browser
 * that hides devices as "unknown", never as "no camera".
 */

export type CameraFacing = "environment" | "user" | "unknown";

export type CameraDevice = {
  deviceId: string;
  /** Empty until camera permission has been granted. */
  label: string;
  /** Best-effort: a USB or capture device rather than the built-in webcam. */
  isExternal: boolean;
  facing: CameraFacing;
};

const EXTERNAL_HINTS = [
  "usb",
  "external",
  "capture",
  "webcam c",
  "logitech",
  "brio",
  "elgato",
  "document camera",
  "hdmi",
];

const BUILT_IN_HINTS = ["built-in", "integrated", "internal", "facetime"];

export function mediaDevicesSupported(): boolean {
  // navigator.mediaDevices is absent entirely in an insecure context, so it is the real guard;
  // the DOM lib types its methods as always present, hence the explicit widening.
  const devices = navigator.mediaDevices as MediaDevices | undefined;
  return (
    typeof devices?.enumerateDevices === "function" && typeof devices?.getUserMedia === "function"
  );
}

function classify(label: string): { isExternal: boolean; facing: CameraFacing } {
  const lower = label.toLowerCase();
  const facing: CameraFacing = lower.includes("back")
    ? "environment"
    : lower.includes("front")
      ? "user"
      : "unknown";
  if (BUILT_IN_HINTS.some((hint) => lower.includes(hint))) {
    return { isExternal: false, facing };
  }
  return { isExternal: EXTERNAL_HINTS.some((hint) => lower.includes(hint)), facing };
}

/** Every video input the browser will admit to. Empty array when none or when unsupported. */
export async function listCameras(): Promise<CameraDevice[]> {
  if (!mediaDevicesSupported()) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === "videoinput")
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label,
        ...classify(device.label),
      }));
  } catch {
    return [];
  }
}

/**
 * Calls back whenever a camera is attached or removed, so plugging in an external camera after
 * the page loaded is noticed without a reload. Returns an unsubscribe function.
 */
export function subscribeToCameraChanges(onChange: () => void): () => void {
  const devices = navigator.mediaDevices as MediaDevices | undefined;
  if (typeof devices?.addEventListener !== "function") return () => undefined;
  devices.addEventListener("devicechange", onChange);
  return () => devices.removeEventListener("devicechange", onChange);
}

/**
 * The camera to open by default.
 *
 * A rear-facing camera wins on handheld devices; otherwise an external camera is preferred,
 * because on a workshop desktop it is the one pointed at the training rig rather than at the
 * learner.
 */
export function preferredCamera(cameras: CameraDevice[]): CameraDevice | null {
  return (
    cameras.find((camera) => camera.facing === "environment") ??
    cameras.find((camera) => camera.isExternal) ??
    cameras[0] ??
    null
  );
}

export function describeCamera(camera: CameraDevice, index: number): string {
  if (camera.label) return camera.label;
  // Pre-permission the label is blank, so fall back to a stable positional name.
  return `Camera ${index + 1}`;
}

/** Maps a getUserMedia rejection to something a learner in a workshop can act on. */
export function cameraErrorMessage(error: unknown): { message: string; reason: string } {
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        reason: "permission-denied",
        message:
          "Camera permission was denied. Continue with desktop or accessible controls without losing progress.",
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return {
        reason: "camera-not-found",
        message:
          "No camera is connected. Attach a USB camera and choose Check again, or continue in another learning mode.",
      };
    case "NotReadableError":
    case "AbortError":
      return {
        reason: "camera-busy",
        message:
          "The camera is already in use by another application. Close it, then choose Check again.",
      };
    default:
      return {
        reason: "camera-unavailable",
        message: "The camera could not be started on this device. Choose another learning mode.",
      };
  }
}
