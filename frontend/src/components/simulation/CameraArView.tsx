import { useEffect, useRef, useState } from "react";

import type { ProcedureStep, TelemetryEventInput } from "../../api/learning";

type BarcodeResult = { rawValue: string };
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
};

export function CameraArView({
  currentStep,
  independent = false,
  disabled,
  onAction,
  onTelemetry,
  expectedMarker,
}: CameraArViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const markerMismatchRef = useRef(false);
  const sessionStartedAtRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [marker, setMarker] = useState<string | null>(null);
  const [manualAlignment, setManualAlignment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceConfirmed, setWorkspaceConfirmed] = useState(false);

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
    }, 650);
    return () => window.clearInterval(timer);
  }, [active, expectedMarker, onTelemetry]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) =>
        track.addEventListener(
          "ended",
          () => {
            setActive(false);
            setMarker(null);
            setError("The camera was interrupted. Re-enter AR or choose a fallback mode.");
            onTelemetry("ar_marker_lost", { reason: "camera-interrupted" });
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
      onTelemetry("ar_session_started", {
        mode: "camera-marker",
        markerDetector: "BarcodeDetector" in window,
      });
    } catch (cameraError) {
      const denied = cameraError instanceof DOMException && cameraError.name === "NotAllowedError";
      setError(
        denied
          ? "Camera permission was denied. Continue with desktop or accessible controls without losing progress."
          : "The camera could not be started on this device. Choose another learning mode.",
      );
      onTelemetry(denied ? "ar_permission_denied" : "ar_fallback_used", {
        reason: denied ? "permission-denied" : "camera-unavailable",
      });
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setMarker(null);
    sessionStartedAtRef.current = null;
    setManualAlignment(false);
    onTelemetry("ar_session_ended", { mode: "camera-marker" });
  }

  const registered = Boolean(marker || manualAlignment);
  return (
    <div className="camera-ar" aria-label="Camera augmented-reality workspace">
      <video ref={videoRef} muted playsInline aria-label="Live rear-camera view" />
      {!active ? (
        <div className="camera-ar-start">
          <h2>Camera AR</h2>
          <p>Point the rear camera at the approved training rig or its printed QR marker.</p>
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
            onClick={startCamera}
            disabled={!workspaceConfirmed}
          >
            Enable camera and enter AR
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      ) : (
        <>
          <div className={`ar-reticle${registered ? " is-registered" : ""}`} aria-hidden="true" />
          <div className="ar-overlay" role="status" aria-live="polite">
            <span>{registered ? "Training target registered" : "Find the training marker"}</span>
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
