import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type { ProcedureStep, TelemetryEventInput } from "../../api/learning";

type ArAnchor = { anchorSpace: unknown; delete?(): void };
type HitTestResult = {
  getPose(space: unknown): { transform: { matrix: Float32Array } } | null;
  createAnchor?(): Promise<ArAnchor>;
};
type HitTestFrame = {
  getHitTestResults(source: unknown): HitTestResult[];
  getPose(space: unknown, baseSpace: unknown): { transform: { matrix: Float32Array } } | null;
};
type ArSession = {
  requestReferenceSpace(type: string): Promise<unknown>;
  requestHitTestSource(options: { space: unknown }): Promise<unknown>;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  addEventListener(type: string, callback: EventListener): void;
  removeEventListener(type: string, callback: EventListener): void;
  end(): Promise<void>;
};
type XrNavigator = Navigator & {
  xr?: {
    requestSession(mode: "immersive-ar", options: Record<string, unknown>): Promise<ArSession>;
  };
};

type MarkerlessArViewProps = {
  currentStep: ProcedureStep | null;
  onTelemetry(eventType: TelemetryEventInput["eventType"], payload?: Record<string, unknown>): void;
};

export function MarkerlessArView({ currentStep, onTelemetry }: MarkerlessArViewProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<ArSession | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const resetPlacementRef = useRef<() => void>(() => undefined);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("Move the phone slowly to find a flat training surface.");

  useEffect(
    () => () => {
      void sessionRef.current?.end();
      rendererRef.current?.dispose();
    },
    [],
  );

  async function enterMarkerlessAr() {
    const xr = (navigator as XrNavigator).xr;
    if (!xr || !overlayRef.current) {
      setMessage("Markerless AR is unavailable. Use Camera AR or an equivalent 2D/3D mode.");
      onTelemetry("ar_fallback_used", { reason: "immersive-ar-unsupported" });
      return;
    }
    try {
      const session = await xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["anchors", "local-floor", "dom-overlay"],
        domOverlay: { root: overlayRef.current },
      });
      sessionRef.current = session;
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      rendererRef.current = renderer;
      renderer.xr.enabled = true;
      await renderer.xr.setSession(session as never);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera();
      const reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.09, 0.12, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xd4ef78 }),
      );
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      scene.add(reticle);
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.045, 0.16, 20),
        new THREE.MeshBasicMaterial({ color: 0x0b5c4b }),
      );
      arrow.position.y = 0.12;
      reticle.add(arrow);

      const viewerSpace = await session.requestReferenceSpace("viewer");
      const localSpace = await session.requestReferenceSpace("local");
      const hitSource = await session.requestHitTestSource({ space: viewerSpace });
      let placementAvailable = false;
      let placed = false;
      let anchor: ArAnchor | null = null;
      let latestHitResult: HitTestResult | null = null;
      resetPlacementRef.current = () => {
        placed = false;
        anchor?.delete?.();
        anchor = null;
      };
      renderer.setAnimationLoop((_time, frame) => {
        const xrFrame = frame as unknown as HitTestFrame | undefined;
        const hitResults = xrFrame?.getHitTestResults(hitSource);
        latestHitResult = hitResults?.[0] ?? null;
        const pose = hitResults?.[0]?.getPose(localSpace);
        placementAvailable = Boolean(pose);
        if (!placed) {
          reticle.visible = placementAvailable;
          if (pose) reticle.matrix.fromArray(pose.transform.matrix);
        } else if (anchor && xrFrame) {
          const anchorPose = xrFrame.getPose(anchor.anchorSpace, localSpace);
          if (anchorPose) reticle.matrix.fromArray(anchorPose.transform.matrix);
        }
        renderer.render(scene, camera);
      });

      const handleSelect = async () => {
        if (!placementAvailable) return;
        placed = true;
        if (latestHitResult?.createAnchor) {
          try {
            anchor = await latestHitResult.createAnchor();
          } catch {
            anchor = null;
          }
        }
        onTelemetry("ar_placement_confirmed", {
          method: "webxr-hit-test",
          anchored: Boolean(anchor),
          stepCode: currentStep?.code ?? null,
        });
        setMessage(
          currentStep
            ? `${currentStep.title} guidance placed. Continue with the equivalent procedure action.`
            : "Guidance placement confirmed.",
        );
      };
      const handleEnd = () => {
        session.removeEventListener("select", handleSelect as EventListener);
        renderer.setAnimationLoop(null);
        anchor?.delete?.();
        resetPlacementRef.current = () => undefined;
        renderer.dispose();
        sessionRef.current = null;
        rendererRef.current = null;
        setActive(false);
        onTelemetry("ar_session_ended", { mode: "webxr-hit-test" });
      };
      session.addEventListener("select", handleSelect as EventListener);
      session.addEventListener("end", handleEnd as EventListener);
      setActive(true);
      setMessage("Aim at a flat surface; tap when the green placement ring appears.");
      onTelemetry("ar_session_started", { mode: "webxr-hit-test" });
    } catch (error) {
      setMessage("Markerless AR could not start. Camera AR and accessible modes remain available.");
      onTelemetry("ar_fallback_used", {
        reason: error instanceof Error ? error.name : "webxr-session-failed",
      });
    }
  }

  return (
    <div ref={overlayRef} className="markerless-ar" role="region" aria-label="Markerless WebXR AR">
      <span className="eyebrow">WebXR surface placement</span>
      <h2>{currentStep?.title ?? "Procedure complete"}</h2>
      <p>{message}</p>
      {!active ? (
        <button className="button button-primary" type="button" onClick={enterMarkerlessAr}>
          Enter markerless AR
        </button>
      ) : (
        <div className="authoring-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              setMessage("Move the phone slowly, find the surface again, and tap to reposition.");
              resetPlacementRef.current();
              onTelemetry("ar_tracking_recovered", { method: "learner-reposition" });
            }}
          >
            Reposition guidance
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => sessionRef.current?.end()}
          >
            Exit markerless AR
          </button>
        </div>
      )}
      <p className="markerless-note">
        Tracking and placement quality are recorded separately from learner competence.
      </p>
    </div>
  );
}
