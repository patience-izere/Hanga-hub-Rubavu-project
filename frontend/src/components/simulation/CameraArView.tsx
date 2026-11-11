import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { ProcedureStep, TelemetryEventInput } from "../../api/learning";
import { markerPose3d, type ArPose } from "../../ar/markerPose";
import {
  cameraErrorMessage,
  describeCamera,
  listCameras,
  mediaDevicesSupported,
  preferredCamera,
  subscribeToCameraChanges,
  type CameraDevice,
} from "../../ar/cameras";

type BarcodeResult = { rawValue: string; cornerPoints?: Array<{ x: number; y: number }> };

/** Where the marker sits in the camera view, as fractions of the view and a turn in degrees. */
export type MarkerPose = { x: number; y: number; size: number; angle: number };

/**
 * Turn a detected marker's corners into where to draw the bench.
 *
 * This follows the marker's position, apparent size and rotation in the image. It is not a full
 * 3D pose, so the bench does not tilt with the marker; it stays upright and readable instead.
 */
export function markerPose(
  corners: Array<{ x: number; y: number }> | undefined,
  videoWidth: number,
  videoHeight: number,
): MarkerPose | null {
  if (!corners || corners.length < 4 || !videoWidth || !videoHeight) return null;
  const centerX = corners.reduce((total, point) => total + point.x, 0) / corners.length;
  const centerY = corners.reduce((total, point) => total + point.y, 0) / corners.length;
  const edge = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
  const angle =
    (Math.atan2(corners[1].y - corners[0].y, corners[1].x - corners[0].x) * 180) / Math.PI;
  return {
    x: centerX / videoWidth,
    y: centerY / videoHeight,
    size: edge / Math.min(videoWidth, videoHeight),
    angle,
  };
}
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<BarcodeResult[]>;
};
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

export type CameraArViewProps = {
  currentStep: ProcedureStep | null;
  independent?: boolean;
  disabled: boolean;
  onAction(action: string): void;
  onTelemetry(eventType: TelemetryEventInput["eventType"], payload?: Record<string, unknown>): void;
  expectedMarker: string;
  /**
   * The interactive bench, drawn over the camera view once the training target is registered.
   * It receives the marker's 3D pose while the marker is in view, so it can stand on it and tilt
   * with it, and `null` when it should sit flat over the view instead.
   */
  bench?: (pose: ArPose | null) => ReactNode;
};

export function CameraArView({
  currentStep,
  independent = false,
  disabled,
  onAction,
  onTelemetry,
  expectedMarker,
  bench,
}: CameraArViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const markerMismatchRef = useRef(false);
  const sessionStartedAtRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [marker, setMarker] = useState<string | null>(null);
  const [pose, setPose] = useState<MarkerPose | null>(null);
  const [pose3d, setPose3d] = useState<ArPose | null>(null);
  const [manualAlignment, setManualAlignment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceConfirmed, setWorkspaceConfirmed] = useState(false);

  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [scanning, setScanning] = useState(true);
  const [starting, setStarting] = useState(false);

  const supported = mediaDevicesSupported();
  // Following a bench on the marker needs more frequent looks than only confirming it is there.
  const trackingInterval = bench ? 160 : 650;

  const refreshCameras = useCallback(async () => {
    if (!supported) {
      setScanning(false);
      return [] as CameraDevice[];
    }
    setScanning(true);
    const devices = await listCameras();
    setCameras(devices);
    setSelectedId((current) => {
      // Keep the learner's choice if that camera is still attached.
      if (current && devices.some((device) => device.deviceId === current)) return current;
      return preferredCamera(devices)?.deviceId ?? "";
    });
    setScanning(false);
    return devices;
  }, [supported]);

  // Initial scan, plus a live subscription so a USB camera attached after load is picked up
  // without a reload.
  useEffect(() => {
    void refreshCameras();
    return subscribeToCameraChanges(() => {
      void refreshCameras().then((devices) => {
        onTelemetry("ar_camera_devices_changed", { cameraCount: devices.length });
      });
    });
  }, [refreshCameras, onTelemetry]);

  useEffect(() => {
    if (!active || !videoRef.current || !("BarcodeDetector" in window)) return;
    const Detector = (window as typeof window & { BarcodeDetector: BarcodeDetectorConstructor })
      .BarcodeDetector;
    const detector = new Detector({ formats: ["qr_code"] });
    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      try {
        const results = await detector.detect(video);
        const detectedValue = results[0]?.rawValue ?? null;
        const nextMarker = detectedValue === expectedMarker ? detectedValue : null;
        if (nextMarker) {
          const corners = results[0]?.cornerPoints;
          setPose(markerPose(corners, video.videoWidth, video.videoHeight));
          const rect = video.getBoundingClientRect();
          setPose3d(
            corners?.length === 4
              ? markerPose3d({
                  corners,
                  video: { width: video.videoWidth, height: video.videoHeight },
                  display: { width: rect.width, height: rect.height },
                })
              : null,
          );
        } else {
          setPose3d(null);
        }
        if (detectedValue && detectedValue !== expectedMarker && !markerMismatchRef.current) {
          markerMismatchRef.current = true;
          onTelemetry("ar_marker_mismatch", { detector: "barcode-qr" });
        } else if (!detectedValue || detectedValue === expectedMarker) {
          markerMismatchRef.current = false;
        }
        setMarker((previous) => {
          if (!previous && nextMarker) {
            onTelemetry("ar_marker_found", {
              marker: nextMarker,
              detector: "barcode-qr",
              recognitionLatencyMs:
                sessionStartedAtRef.current === null
                  ? null
                  : Math.round(performance.now() - sessionStartedAtRef.current),
            });
          } else if (previous && !nextMarker) {
            onTelemetry("ar_marker_lost", { marker: previous, detector: "barcode-qr" });
          }
          return nextMarker;
        });
      } catch {
        // Detection failure is a renderer condition, never learner evidence.
      }
    }, trackingInterval);
    return () => window.clearInterval(timer);
  }, [active, expectedMarker, onTelemetry, trackingInterval]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function openStream(deviceId: string) {
    // An exact deviceId honours the learner's pick; without one, ask for a rear camera so
    // handheld devices do not open the selfie camera.
    const video: MediaTrackConstraints = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 } }
      : { facingMode: { ideal: "environment" }, width: { ideal: 1280 } };
    return navigator.mediaDevices.getUserMedia({ video, audio: false });
  }

  async function startCamera(deviceId = selectedId) {
    setError(null);
    setStarting(true);
    try {
      const stream = await openStream(deviceId);
      releaseStream();
      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) =>
        track.addEventListener(
          "ended",
          () => {
            setActive(false);
            setMarker(null);
            setError("The camera was interrupted. Re-enter AR or choose a fallback mode.");
            onTelemetry("ar_marker_lost", { reason: "camera-interrupted" });
            void refreshCameras();
          },
          { once: true },
        ),
      );
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
      sessionStartedAtRef.current = performance.now();

      // Labels are withheld until permission is granted, so re-enumerate now that it is.
      const devices = await refreshCameras();
      const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId;
      if (activeId) setSelectedId(activeId);
      const activeCamera = devices.find((device) => device.deviceId === activeId);

      onTelemetry("ar_session_started", {
        mode: "camera-marker",
        markerDetector: "BarcodeDetector" in window,
        cameraCount: devices.length,
        cameraLabel: activeCamera?.label || null,
        externalCamera: activeCamera?.isExternal ?? null,
      });
    } catch (cameraError) {
      const { message, reason } = cameraErrorMessage(cameraError);
      setError(message);
      onTelemetry(reason === "permission-denied" ? "ar_permission_denied" : "ar_fallback_used", {
        reason,
      });
      // A failed start may itself reveal devices, and re-scanning keeps the picker honest.
      void refreshCameras();
    } finally {
      setStarting(false);
    }
  }

  /** Switch cameras without leaving AR — used when the rig camera is not the default. */
  async function switchCamera(deviceId: string) {
    setSelectedId(deviceId);
    if (!active) return;
    onTelemetry("ar_camera_switched", { deviceId: deviceId ? "selected" : "default" });
    await startCamera(deviceId);
  }

  function stopCamera() {
    releaseStream();
    setActive(false);
    setMarker(null);
    setPose(null);
    setPose3d(null);
    sessionStartedAtRef.current = null;
    setManualAlignment(false);
    onTelemetry("ar_session_ended", { mode: "camera-marker" });
  }

  const registered = Boolean(marker || manualAlignment);
  const hasCamera = cameras.length > 0;
  // Some browsers disclose no devices until permission is granted, so an empty list is only
  // proof of absence once we have labels for something.
  const listIsAuthoritative = cameras.some((device) => device.label !== "");

  return (
    <div className="camera-ar" aria-label="Camera augmented-reality workspace">
      <video ref={videoRef} muted playsInline aria-label="Live rear-camera view" />
      {!active ? (
        <div className="camera-ar-start">
          <h2>Camera AR</h2>
          <p>Point the rear camera at the approved training rig or its printed QR marker.</p>

          <div className="camera-detection" role="status" aria-live="polite">
            {!supported ? (
              <p className="camera-status is-warning">
                This browser cannot access cameras. Choose desktop or accessible controls.
              </p>
            ) : scanning ? (
              <p className="camera-status">Looking for connected cameras…</p>
            ) : hasCamera ? (
              <p className="camera-status is-ready">
                {cameras.length === 1 ? "1 camera detected" : `${cameras.length} cameras detected`}
              </p>
            ) : (
              <p className="camera-status is-warning">
                No camera detected. Connect a USB camera — it is picked up automatically — or choose
                Check again.
              </p>
            )}

            {cameras.length > 1 ? (
              <label className="camera-picker">
                Camera
                <select
                  value={selectedId}
                  onChange={(event) => void switchCamera(event.target.value)}
                >
                  {cameras.map((camera, index) => (
                    <option key={camera.deviceId || index} value={camera.deviceId}>
                      {describeCamera(camera, index)}
                      {camera.isExternal ? " (external)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {supported && !listIsAuthoritative ? (
              <p className="camera-note">
                Camera names appear after you grant permission. If the wrong camera opens, switch it
                here once AR has started.
              </p>
            ) : null}

            {supported ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void refreshCameras()}
                disabled={scanning}
              >
                {scanning ? "Checking…" : "Check again"}
              </button>
            ) : null}
          </div>

          <a href={`/markers/battery?value=${encodeURIComponent(expectedMarker)}`} target="_blank">
            Open printable training marker
          </a>
          <label>
            <input
              type="checkbox"
              checked={workspaceConfirmed}
              onChange={(event) => setWorkspaceConfirmed(event.target.checked)}
            />
            I confirm the rig is de-energized, supervised, evenly lit, and the camera view will not
            hide a real hazard.
          </label>
          <button
            className="button button-primary"
            type="button"
            onClick={() => void startCamera()}
            disabled={!workspaceConfirmed || !supported || starting}
          >
            {starting ? "Starting camera…" : "Enable camera and enter AR"}
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      ) : (
        <>
          <div className={`ar-reticle${registered ? " is-registered" : ""}`} aria-hidden="true" />
          {registered && bench && marker && pose3d ? (
            <div className="ar-bench-3d">{bench(pose3d)}</div>
          ) : registered && bench ? (
            <div
              className="ar-bench"
              style={
                marker && pose
                  ? {
                      left: `${pose.x * 100}%`,
                      top: `${pose.y * 100}%`,
                      transform: `translate(-50%, -62%) rotate(${pose.angle}deg) scale(${Math.min(
                        1.6,
                        Math.max(0.55, pose.size * 3.2),
                      )})`,
                    }
                  : undefined
              }
            >
              {bench(null)}
            </div>
          ) : null}
          <div className="ar-overlay" role="status" aria-live="polite">
            <span>
              {registered
                ? bench
                  ? "Training target registered: touch the bench to act"
                  : "Training target registered"
                : "Find the training marker"}
            </span>
            <strong>
              {independent
                ? "Independent assessment"
                : (currentStep?.title ?? "Procedure complete")}
            </strong>
            <p>
              {independent
                ? "The rig is registered. Use the independent action panel without ordered prompts."
                : (currentStep?.instruction ?? "Submit the saved evidence when ready.")}
            </p>
            {cameras.length > 1 ? (
              <label className="camera-picker in-session">
                <span className="sr-only">Active camera</span>
                <select
                  value={selectedId}
                  onChange={(event) => void switchCamera(event.target.value)}
                  disabled={starting}
                >
                  {cameras.map((camera, index) => (
                    <option key={camera.deviceId || index} value={camera.deviceId}>
                      {describeCamera(camera, index)}
                      {camera.isExternal ? " (external)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!marker && (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setManualAlignment(true);
                  onTelemetry("ar_placement_confirmed", { method: "learner-confirmed" });
                }}
              >
                Confirm controlled-rig alignment
              </button>
            )}
            {currentStep && !independent && (
              <button
                className="button button-primary"
                type="button"
                disabled={disabled || !registered}
                onClick={() => onAction(currentStep.action_code)}
              >
                Record {currentStep.title}
              </button>
            )}
            <button className="ar-exit" type="button" onClick={stopCamera}>
              Exit AR
            </button>
          </div>
        </>
      )}
    </div>
  );
}
