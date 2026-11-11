import { useDialogFocus } from "../components/ui/Dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { describeApiError } from "../api/client";
import type { CapabilityProfile, RendererMode, TelemetryEventInput } from "../api/learning";
import { detectCapabilities, rendererAvailability } from "../ar/capabilities";
import { BatteryWorkshopScene } from "../components/simulation/BatteryWorkshopScene";
import { CameraArView } from "../components/simulation/CameraArView";
import { MarkerlessArView } from "../components/simulation/MarkerlessArView";
import {
  ProcedureWorkspace,
  type ActionSource,
  type WorkspaceFeedback,
} from "../components/simulation/ProcedureWorkspace";
import { ScenePlayer } from "../components/simulation/ScenePlayer";
import {
  useAbandonAttempt,
  useAttempt,
  useCompleteAttempt,
  useRecordAttemptAction,
  useRecordAttemptTelemetry,
  useRequestAttemptHint,
  useSelectAttemptRenderer,
} from "../learning/useAssignments";
import {
  discardBlockedOutboxItems,
  isBlockedOutboxItem,
  listOutboxItems,
  synchronizeOutbox,
} from "../offline/outbox";
import { allOptions, completedActionCodes, stepOptions } from "../procedure/engine";
import { fallbackScene } from "../procedure/scene";
import { useLocale } from "../i18n/LocaleProvider";
import { AttemptResultBody } from "./AttemptResultPage";

const RENDERER_MODES: RendererMode[] = [
  "accessible_2d",
  "desktop_3d",
  "marker_ar",
  "markerless_ar",
];

/** Checked before the first paint, so a device without WebGL never tries to draw the 3D bench. */
function canDraw3d(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function SimulationPage() {
  const attemptId = Number(useParams().attemptId);
  const navigate = useNavigate();
  const { t } = useLocale();
  const attemptQuery = useAttempt(attemptId);
  const record = useRecordAttemptAction(attemptId);
  const complete = useCompleteAttempt(attemptId);
  const abandon = useAbandonAttempt(attemptId);
  const selectRenderer = useSelectAttemptRenderer(attemptId);
  const telemetry = useRecordAttemptTelemetry(attemptId);
  const recordTelemetryMutation = telemetry.mutate;
  const hint = useRequestAttemptHint(attemptId);
  const [mode, setMode] = useState<RendererMode>(() =>
    canDraw3d() ? "desktop_3d" : "accessible_2d",
  );
  const [capabilities, setCapabilities] = useState<CapabilityProfile | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [failedSync, setFailedSync] = useState(0);
  const [staleSync, setStaleSync] = useState(0);
  const [blockedSync, setBlockedSync] = useState(0);
  const [synchronizing, setSynchronizing] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const endConfirm = useRef<HTMLDivElement>(null);
  const discardConfirm = useRef<HTMLDivElement>(null);
  useDialogFocus(endConfirm, () => setConfirmingEnd(false), {
    trap: false,
    active: confirmingEnd,
  });
  useDialogFocus(discardConfirm, () => setConfirmingDiscard(false), {
    trap: false,
    active: confirmingDiscard,
  });
  const [revealedHints, setRevealedHints] = useState<Record<string, string[]>>({});
  const [feedback, setFeedback] = useState<WorkspaceFeedback | null>(null);
  const feedbackId = useRef(0);
  const selectionInitialized = useRef(false);
  const capabilityDetected = useRef(false);
  const initialRendererMode = useRef(mode);

  useEffect(() => {
    if (capabilityDetected.current) return;
    capabilityDetected.current = true;
    void detectCapabilities().then((profile) => {
      setCapabilities(profile);
      recordTelemetryMutation({
        rendererMode: initialRendererMode.current,
        eventType: "device_capability",
        payload: profile,
      });
    });
  }, [recordTelemetryMutation]);

  useEffect(() => {
    const refreshNetwork = () => setOnline(navigator.onLine);
    const refreshOutbox = () =>
      void listOutboxItems().then((items) => {
        const attemptItems = items.filter((item) => item.attemptId === attemptId);
        // Everything still on this device counts as unsent; refused items are reported apart
        // because retrying cannot deliver them.
        setPendingSync(attemptItems.length);
        setFailedSync(attemptItems.filter((item) => item.syncStatus === "failed").length);
        setStaleSync(attemptItems.filter((item) => item.syncStatus === "stale").length);
        setBlockedSync(attemptItems.filter(isBlockedOutboxItem).length);
      });
    window.addEventListener("online", refreshNetwork);
    window.addEventListener("offline", refreshNetwork);
    window.addEventListener("opedu:outbox-changed", refreshOutbox);
    refreshOutbox();
    return () => {
      window.removeEventListener("online", refreshNetwork);
      window.removeEventListener("offline", refreshNetwork);
      window.removeEventListener("opedu:outbox-changed", refreshOutbox);
    };
  }, [attemptId]);

  useEffect(() => {
    const attempt = attemptQuery.data;
    if (
      selectionInitialized.current ||
      !capabilities ||
      !attempt ||
      Object.keys(attempt.capability_profile ?? {}).length > 0
    ) {
      return;
    }
    selectionInitialized.current = true;
    // Start somewhere that works everywhere: the 3D bench when the device can draw it, the
    // simple view otherwise. Camera and room AR are a choice, never a surprise.
    const starting = capabilities.webgl ? "desktop_3d" : "accessible_2d";
    setMode(starting);
    selectRenderer.mutate({ mode: starting, capabilityProfile: capabilities });
  }, [attemptQuery.data, capabilities, selectRenderer]);

  useEffect(() => {
    if (attemptQuery.data?.renderer_mode) setMode(attemptQuery.data.renderer_mode);
  }, [attemptQuery.data?.renderer_mode]);

  const availableModes = useMemo(
    () => (capabilities ? rendererAvailability(capabilities) : null),
    [capabilities],
  );
  const recordTelemetry = useCallback(
    (eventType: TelemetryEventInput["eventType"], payload: Record<string, unknown> = {}) => {
      recordTelemetryMutation({ rendererMode: mode, eventType, payload });
    },
    [mode, recordTelemetryMutation],
  );
  const handleAssetLoaded = useCallback(
    () => recordTelemetry("asset_load_completed", { source: "scenario_asset_package" }),
    [recordTelemetry],
  );
  const handleAssetFailure = useCallback(
    () => recordTelemetry("asset_load_failed", { fallback: "procedural_desktop_3d" }),
    [recordTelemetry],
  );

  useEffect(() => {
    if (mode === "accessible_2d" || !capabilities) return;
    let frames = 0;
    let frameId = 0;
    const started = performance.now();
    const sample = () => {
      frames += 1;
      if (performance.now() - started < 3000) frameId = requestAnimationFrame(sample);
      else {
        recordTelemetry("performance_sample", {
          framesPerSecond: Math.round((frames * 1000) / (performance.now() - started)),
          deviceMemoryGb: capabilities.deviceMemoryGb ?? null,
          connection: capabilities.connection ?? null,
        });
      }
    };
    frameId = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(frameId);
  }, [capabilities, mode, recordTelemetry]);

  if (attemptQuery.isPending) {
    return <p className="panel-status">Preparing the workshop…</p>;
  }
  if (attemptQuery.isError || !attemptQuery.data) {
    return (
      <section className="lesson-page">
        <p className="form-error" role="alert">
          This attempt is unavailable.
        </p>
        <Link to="/learn">Return to my learning</Link>
      </section>
    );
  }

  const attempt = complete.data || attemptQuery.data;
  const independent = attempt.learning_mode === "independent";
  const { lesson, scenario } = attempt.assignment;
  const steps = lesson.procedure_steps;
  const liveResume = record.data?.attempt.resume_state || attempt.resume_state;
  const completedCodes = liveResume.completedSteps || [];
  const currentStep = steps.find((step) => !completedCodes.includes(step.code)) ?? null;
  const sequence = scenario?.sequence ?? "ordered";
  const isReady = steps.length > 0 && completedCodes.length === steps.length;
  const isBusy = record.isPending || complete.isPending;
  const packageFiles = scenario?.asset_package?.files ?? [];
  const productionModelFile = packageFiles.find(
    (file) =>
      file.role === "primary-scene" || file.path.endsWith(".glb") || file.path.endsWith(".gltf"),
  );
  const fallbackMediaFiles = packageFiles.filter((file) => file.role === "fallback-media");
  const captionFile = packageFiles.find(
    (file) => file.role === "captions" || file.mime_type === "text/vtt",
  );
  const narrationFiles = packageFiles.filter((file) => file.role === "narration");
  const productionModelAsset = productionModelFile
    ? {
        url: productionModelFile.url,
        path: productionModelFile.path,
        mimeType: productionModelFile.mime_type,
        byteSize: productionModelFile.byte_size,
        sha256: productionModelFile.sha256,
      }
    : undefined;
  const expectedMarker =
    scenario?.renderer_config?.marker_ar?.targetValue ||
    `OPEDU-${lesson.slug}-V${lesson.content_version}`;
  const sceneDefinition = scenario?.scene ?? null;
  const prompted = !independent && sequence !== "free";

  const usedHintCodes = currentStep
    ? new Set([
        ...attempt.events
          .filter(
            (event) =>
              event.event_type === "hint_used" && event.payload.stepCode === currentStep.code,
          )
          .map((event) => String(event.payload.hintCode)),
        ...(revealedHints[currentStep.code] ?? []),
      ])
    : new Set<string>();
  const shownHints = (currentStep?.hints ?? [])
    .filter((item) => usedHintCodes.has(item.code))
    .sort((left, right) => left.order - right.order);
  const nextHint = (currentStep?.hints ?? [])
    .filter((item) => !usedHintCodes.has(item.code))
    .sort((left, right) => left.order - right.order)[0];

  function requestHint() {
    if (!currentStep || !nextHint) return;
    const stepCode = currentStep.code;
    hint.mutate(nextHint.code, {
      onSuccess: (result) =>
        setRevealedHints((current) => ({
          ...current,
          [stepCode]: [...(current[stepCode] ?? []), result.hint.code],
        })),
    });
  }

  async function discardRefusedEvidence() {
    await discardBlockedOutboxItems(attemptId);
    setConfirmingDiscard(false);
    await attemptQuery.refetch();
  }

  function performAction(action: string, source: ActionSource) {
    if (isBusy || attempt.status !== "in_progress") return;
    record.mutate(
      { action, source, rendererMode: mode },
      {
        onSuccess: (result) => {
          feedbackId.current += 1;
          setFeedback({
            id: feedbackId.current,
            correct: result.correct,
            message: result.message,
            consequence: result.consequence ?? null,
            action,
          });
        },
      },
    );
  }

  function chooseMode(nextMode: RendererMode) {
    if (!capabilities || availableModes?.[nextMode] === false) return;
    setMode(nextMode);
    selectRenderer.mutate({ mode: nextMode, capabilityProfile: capabilities });
  }

  function chooseLearningMode(learningMode: "guided" | "independent") {
    if (!capabilities || attempt.status !== "in_progress") return;
    selectRenderer.mutate({ mode, capabilityProfile: capabilities, learningMode });
  }

  if (attempt.status !== "in_progress") {
    // The result screen lives on its own route so it can be revisited; render its body here so
    // finishing an attempt flows straight into the result without a redirect. Ended and
    // review-pending attempts explain themselves there too.
    return (
      <section className="result-page">
        <AttemptResultBody attempt={attempt} />
      </section>
    );
  }

  const completedActions = completedActionCodes(steps, completedCodes);
  const arOptions = prompted
    ? currentStep
      ? stepOptions(currentStep)
      : []
    : allOptions(steps, scenario?.distractors ?? sceneDefinition?.extra_actions ?? [], attempt.id);

  function renderStage(stageMode: RendererMode) {
    if (stageMode === "marker_ar") {
      return (
        <CameraArView
          currentStep={currentStep}
          independent={!prompted}
          disabled={isBusy}
          onAction={(action) => performAction(action, "camera-ar")}
          onTelemetry={recordTelemetry}
          expectedMarker={expectedMarker}
          bench={(arPose) => (
            <ScenePlayer
              overlay
              arPose={arPose}
              scene={sceneDefinition ?? fallbackScene(steps)}
              steps={steps}
              completedActions={completedActions}
              currentAction={prompted ? (currentStep?.action_code ?? null) : null}
              disabled={isBusy}
              onAction={(action) => performAction(action, "camera-ar")}
            />
          )}
        />
      );
    }
    if (stageMode === "markerless_ar") {
      return (
        <MarkerlessArView
          currentStep={prompted ? currentStep : null}
          onTelemetry={recordTelemetry}
          options={arOptions}
          disabled={isBusy}
          feedback={feedback?.message ?? ""}
          onAction={(action) => performAction(action, "camera-ar")}
        />
      );
    }
    if (stageMode === "desktop_3d" && productionModelAsset) {
      // A lesson that ships a verified 3D model uses it; its parts name their own actions.
      return (
        <>
          <BatteryWorkshopScene
            currentAction={prompted ? (currentStep?.action_code ?? null) : null}
            completedActions={completedActions}
            disabled={isBusy}
            onAction={(action) => performAction(action, "scene")}
            modelAsset={productionModelAsset}
            onAssetLoaded={handleAssetLoaded}
            onAssetFailure={handleAssetFailure}
          />
          <p className="scene-help">Drag to look around · pinch or scroll to zoom</p>
        </>
      );
    }
    return null;
  }

  const syncStatus = (
    <>
      <div
        className={`sync-banner ${online ? "is-online" : "is-offline"}${
          pendingSync || !online ? " needs-attention" : ""
        }`}
        role="status"
      >
        <strong>
          {record.isPending
            ? "Saving"
            : synchronizing
              ? "Synchronizing"
              : online
                ? "Online"
                : "Offline"}
        </strong>
        <span>
          {blockedSync
            ? staleSync
              ? "This lesson changed after you started, so the server cannot accept the actions saved on this device."
              : "This attempt was closed on another device or by your instructor, so the actions saved on this device cannot be added to it."
            : failedSync
              ? `${pendingSync} saved ${pendingSync === 1 ? "action was" : "actions were"} not accepted yet. Try again, or ask your instructor if it keeps failing.`
              : pendingSync
                ? `${pendingSync} ${pendingSync === 1 ? "action is" : "actions are"} saved on this device and will be sent when you are online.`
                : "All your actions are saved."}
        </span>
        {blockedSync > 0 && !confirmingDiscard ? (
          <button type="button" onClick={() => setConfirmingDiscard(true)}>
            Review saved actions
          </button>
        ) : null}
        {online && pendingSync > 0 && blockedSync === 0 && (
          <button
            type="button"
            disabled={synchronizing}
            onClick={async () => {
              setSynchronizing(true);
              try {
                await synchronizeOutbox(attemptId);
              } finally {
                setSynchronizing(false);
              }
            }}
          >
            {synchronizing ? "Synchronizing…" : "Synchronize now"}
          </button>
        )}
      </div>
      {confirmingDiscard ? (
        <div
          ref={discardConfirm}
          className="inline-confirm"
          role="alertdialog"
          aria-labelledby="discard-title"
        >
          <strong id="discard-title">Delete the actions saved on this device?</strong>
          <p>
            {pendingSync} saved {pendingSync === 1 ? "action" : "actions"} for this attempt cannot
            be delivered. Deleting them lets you carry on; your instructor still sees everything the
            server already received. To keep them, leave this page and ask your instructor before
            deleting.
          </p>
          <div className="button-row">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setConfirmingDiscard(false)}
            >
              Keep them
            </button>
            <button
              className="button button-danger"
              type="button"
              onClick={() => void discardRefusedEvidence()}
            >
              Delete saved actions
            </button>
          </div>
        </div>
      ) : null}
    </>
  );

  const hintPanel =
    prompted && currentStep?.hints?.length ? (
      <div className="hint-panel">
        {shownHints.length > 0 ? (
          <ol className="hint-list" aria-label="Hints for this step">
            {shownHints.map((item) => (
              <li key={item.code}>{item.text}</li>
            ))}
          </ol>
        ) : null}
        {nextHint ? (
          <button
            className="button button-secondary"
            type="button"
            disabled={!online || hint.isPending}
            onClick={requestHint}
          >
            {hint.isPending
              ? "Loading hint…"
              : shownHints.length
                ? t("ws.anotherHint")
                : t("ws.giveHint")}
            {nextHint.points_penalty > 0 ? ` (−${nextHint.points_penalty} points)` : ""}
          </button>
        ) : (
          <small>{t("ws.noMoreHints")}</small>
        )}
        {!online && nextHint ? (
          <small>Hints need a connection so your instructor can see which you used.</small>
        ) : null}
        {hint.isError ? (
          <p className="form-error" role="alert">
            {describeApiError(hint.error, "The hint could not be loaded.")}
          </p>
        ) : null}
      </div>
    ) : null;

  const footer = (
    <>
      {record.isError ? (
        <p className="form-error" role="alert">
          {describeApiError(record.error, "The action could not be saved.")}
        </p>
      ) : null}
      <button
        className="button button-primary submit-attempt"
        disabled={!isReady || isBusy || !online || pendingSync > 0}
        onClick={() => complete.mutate()}
      >
        {complete.isPending
          ? t("ws.scoring")
          : !online
            ? t("ws.reconnect")
            : pendingSync > 0
              ? t("ws.sendFirst")
              : t("ws.complete")}
      </button>
      {confirmingEnd ? (
        <div
          ref={endConfirm}
          className="inline-confirm"
          role="alertdialog"
          aria-labelledby="end-title"
        >
          <strong id="end-title">
            {attempt.is_practice ? "End this practice run?" : "End this attempt?"}
          </strong>
          <p>
            {attempt.is_practice
              ? "Practice runs are free. You can start another whenever you like."
              : "It will not be scored and counts towards your attempt limit. A new attempt starts from the safe beginning."}
          </p>
          <div className="button-row">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setConfirmingEnd(false)}
            >
              Keep working
            </button>
            <button
              className="button button-danger"
              type="button"
              disabled={abandon.isPending}
              onClick={() =>
                abandon.mutate(undefined, {
                  onSuccess: () => navigate(`/assignments/${attempt.assignment.id}`),
                })
              }
            >
              {abandon.isPending
                ? "Ending…"
                : attempt.is_practice
                  ? t("ws.endPractice")
                  : "End attempt"}
            </button>
          </div>
        </div>
      ) : (
        <button
          className="button-link ws-end"
          type="button"
          disabled={!online || pendingSync > 0 || abandon.isPending}
          onClick={() => setConfirmingEnd(true)}
        >
          {attempt.is_practice ? t("ws.endPractice") : t("ws.endRestart")}
        </button>
      )}
      {!online || pendingSync > 0 ? (
        <small>
          {!online
            ? "You can keep practising offline. Submitting or ending needs a connection."
            : "Send the actions saved on this device before submitting or ending."}
        </small>
      ) : null}
      {abandon.isError && (
        <p className="form-error" role="alert">
          {describeApiError(abandon.error, "The attempt could not be ended.")}
        </p>
      )}
      {complete.isError && (
        <p className="form-error" role="alert">
          {describeApiError(complete.error, "The attempt could not be completed.")}
        </p>
      )}
    </>
  );

  const simpleMedia = prompted
    ? fallbackMediaFiles.map((file) =>
        file.mime_type.startsWith("image/") ? (
          <figure key={file.path}>
            <img
              src={file.url}
              alt={String(file.metadata.altText ?? "Technical procedure reference")}
            />
            <figcaption>{file.source_attribution}</figcaption>
          </figure>
        ) : file.mime_type.startsWith("video/") ? (
          <div key={file.path}>
            <video controls preload="metadata">
              <source src={file.url} type={file.mime_type} />
              {captionFile ? (
                <track
                  kind="captions"
                  src={captionFile.url}
                  srcLang="en"
                  label="English captions"
                  default
                />
              ) : null}
            </video>
            <details>
              <summary>Read video transcript</summary>
              <p>{String(file.metadata.transcript ?? "Transcript unavailable.")}</p>
            </details>
          </div>
        ) : null,
      )
    : null;

  return (
    <ProcedureWorkspace
      title={lesson.title}
      kicker={attempt.is_practice ? t("ws.kickerPractice") : t("ws.kickerAssessed")}
      back={{ to: `/assignments/${attempt.assignment.id}`, label: t("ws.lessonOverview") }}
      steps={steps}
      completedCodes={completedCodes}
      sequence={sequence}
      scene={sceneDefinition}
      distractors={scenario?.distractors}
      independent={independent}
      mode={mode}
      modes={RENDERER_MODES.map((rendererMode) => ({
        mode: rendererMode,
        available: availableModes?.[rendererMode] !== false && !selectRenderer.isPending,
        // The view the attempt opens in: it works without a camera, a marker or a headset.
        recommended:
          rendererMode === (capabilities?.webgl === false ? "accessible_2d" : "desktop_3d"),
      }))}
      onModeChange={chooseMode}
      guidance={
        sequence === "free"
          ? null
          : {
              value: attempt.learning_mode,
              // The server refuses a change once the procedure has evidence.
              locked: completedCodes.length > 0 || feedback !== null,
              onChange: chooseLearningMode,
            }
      }
      busy={isBusy}
      feedback={feedback}
      onAction={performAction}
      seed={attempt.id}
      startedAt={attempt.started_at}
      language={lesson.language === "en-rw" ? "rw" : lesson.language}
      narrationFiles={narrationFiles}
      renderStage={renderStage}
      simpleMedia={simpleMedia}
      status={syncStatus}
      hint={hintPanel}
      footer={footer}
    />
  );
}
