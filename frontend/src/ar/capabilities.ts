import type { CapabilityProfile, RendererMode } from "../api/learning";
import { listCameras, mediaDevicesSupported } from "./cameras";

type NavigatorWithCapabilities = Navigator & {
  deviceMemory?: number;
  connection?: { effectiveType?: string };
  xr?: { isSessionSupported(mode: string): Promise<boolean> };
};

function supportsWebGl() {
  if (typeof WebGLRenderingContext === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export async function detectCapabilities(): Promise<CapabilityProfile> {
  const browser = navigator as NavigatorWithCapabilities;
  let immersiveAr = false;
  try {
    immersiveAr = (await browser.xr?.isSessionSupported("immersive-ar")) ?? false;
  } catch {
    immersiveAr = false;
  }
  const storage = await navigator.storage?.estimate().catch(() => undefined);
  const quota = storage?.quota;
  const usage = storage?.usage ?? 0;
  // Enumerate real inputs rather than trusting the API's existence: a shared workshop desktop
  // with no webcam exposes getUserMedia and then fails with NotFoundError at start time.
  const cameraApi = mediaDevicesSupported();
  const cameras = await listCameras();
  const cameraCount = cameras.length;
  const externalCamera = cameras.some((device) => device.isExternal);
  const camera = cameraApi && cameraCount > 0;
  const webgl = supportsWebGl();
  const deviceTier = immersiveAr
    ? "immersive-ar"
    : camera
      ? "camera-ar"
      : webgl
        ? "desktop-3d"
        : "fallback-only";

  return {
    secureContext: window.isSecureContext,
    camera,
    cameraApi,
    cameraCount,
    externalCamera,
    webgl,
    immersiveAr,
    hitTest: immersiveAr,
    markerDetector: "BarcodeDetector" in window,
    online: navigator.onLine,
    connection: browser.connection?.effectiveType,
    deviceMemoryGb: browser.deviceMemory,
    storageQuotaMb: quota ? Math.round(quota / 1_048_576) : undefined,
    storageAvailableMb: quota ? Math.max(0, Math.round((quota - usage) / 1_048_576)) : undefined,
    deviceTier,
    inputMode: navigator.maxTouchPoints > 0 ? "touch" : "pointer",
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  };
}

export function recommendedRenderer(profile: CapabilityProfile): RendererMode {
  if (profile.secureContext && profile.immersiveAr && profile.hitTest) return "markerless_ar";
  // Only recommend Camera AR once a real input is confirmed, so a webcam-less desktop is not
  // steered into a mode that cannot start.
  if (profile.secureContext && profile.camera) return "marker_ar";
  if (profile.webgl) return "desktop_3d";
  return "accessible_2d";
}

export function rendererAvailability(profile: CapabilityProfile): Record<RendererMode, boolean> {
  return {
    accessible_2d: true,
    desktop_3d: profile.webgl,
    // Offered whenever the browser has the API, even with no camera enumerated yet: some
    // browsers hide devices until permission is granted, and a learner may attach a USB camera
    // after the page loaded. Camera AR itself reports absence and offers a re-check.
    marker_ar: profile.secureContext && profile.cameraApi,
    markerless_ar: profile.secureContext && profile.immersiveAr && profile.hitTest,
  };
}
