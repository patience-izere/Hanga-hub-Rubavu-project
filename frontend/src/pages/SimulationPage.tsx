import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { describeApiError } from "../api/client";
import type {
  CapabilityProfile,
  ProcedureStep,
  RendererMode,
  TelemetryEventInput,
} from "../api/learning";
import { detectCapabilities, recommendedRenderer, rendererAvailability } from "../ar/capabilities";
import { BatteryWorkshopScene } from "../components/simulation/BatteryWorkshopScene";
import { CameraArView } from "../components/simulation/CameraArView";
import { AttemptResultBody } from "./AttemptResultPage";
import { MarkerlessArView } from "../components/simulation/MarkerlessArView";
import {
  useAttempt,
  useAbandonAttempt,
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

const rendererLabels: Record<RendererMode, string> = {
  accessible_2d: "Accessible 2D",
  desktop_3d: "Desktop 3D",
  marker_ar: "Camera AR",
  markerless_ar: "Markerless AR",
};

function deterministicActionOrder(steps: ProcedureStep[], attemptId: number) {
  return [...steps].sort((left, right) => {
    const rank = (code: string) =>
      Array.from(`${attemptId}:${code}`).reduce(
        (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
        7,
      );
    return rank(left.code) - rank(right.code);
  });
}

export function SimulationPage() {
  const attemptId = Number(useParams().attemptId);
  const navigate = useNavigate();
  const attemptQuery = useAttempt(attemptId);
  const record = useRecordAttemptAction(attemptId);
  const complete = useCompleteAttempt(attemptId);
  const abandon = useAbandonAttempt(attemptId);
  const selectRenderer = useSelectAttemptRenderer(attemptId);
  const telemetry = useRecordAttemptTelemetry(attemptId);
  const recordTelemetryMutation = telemetry.mutate;
  const hint = useRequestAttemptHint(attemptId);
  const [mode, setMode] = useState<RendererMode>("desktop_3d");
  const [capabilities, setCapabilities] = useState<CapabilityProfile | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [failedSync, setFailedSync] = useState(0);
  const [staleSync, setStaleSync] = useState(0);
  const [blockedSync, setBlockedSync] = useState(0);
  const [synchronizing, setSynchronizing] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [revealedHints, setRevealedHints] = useState<Record<string, string[]>>({});
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
    const recommended = recommendedRenderer(capabilities);
    setMode(recommended);
    selectRenderer.mutate({ mode: recommended, capabilityProfile: capabilities });
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
  const { lesson } = attempt.assignment;
  const liveResume = record.data?.attempt.resume_state || attempt.resume_state;
  const completedCodes = liveResume.completedSteps || [];
  const currentCode =
    liveResume.currentStep === undefined
      ? (lesson.procedure_steps[0]?.code ?? null)
      : liveResume.currentStep;
  const currentStep = lesson.procedure_steps.find((step) => step.code === currentCode) || null;
  const completedActions = new Set(
    lesson.procedure_steps
      .filter((step) => completedCodes.includes(step.code))
      .map((step) => step.action_code),
  );
  const isReady =
    lesson.procedure_steps.length > 0 && completedCodes.length === lesson.procedure_steps.length;
  const isBusy = record.isPending || complete.isPending;
  const productionModelFile = attempt.assignment.scenario?.asset_package?.files.find(
    (file) =>
      file.role === "primary-scene" || file.path.endsWith(".glb") || file.path.endsWith(".gltf"),
  );
  const fallbackMediaFiles =
    attempt.assignment.scenario?.asset_package?.files.filter(
      (file) => file.role === "fallback-media",
    ) ?? [];
  const captionFile = attempt.assignment.scenario?.asset_package?.files.find(
    (file) => file.role === "captions" || file.mime_type === "text/vtt",
  );
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
    attempt.assignment.scenario?.renderer_config?.marker_ar?.targetValue ||
    `OPEDU-${lesson.slug}-V${lesson.content_version}`;

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

  function performAction(action: string, source: "scene" | "accessible-controls" | "camera-ar") {
    if (!isBusy && attempt.status === "in_progress") {
      record.mutate({ action, source, rendererMode: mode });
    }
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

  return (
    <section className="simulation-page">
      <header className="simulation-header">
        <div>
          <Link className="back-link" to={`/assignments/${attempt.assignment.id}`}>
            ← Lesson overview
          </Link>
          <span className="eyebrow">
            {independent ? "Independent assessment" : "Guided practical"} · Attempt {attempt.id}
          </span>
          <h1>{lesson.title}</h1>
        </div>
        <div
          className="simulation-progress"
          aria-label={`${completedCodes.length} of ${lesson.procedure_steps.length} steps complete`}
        >
          <strong>
            {completedCodes.length}/{lesson.procedure_steps.length}
          </strong>
          <span>steps complete</span>
        </div>
      </header>

      <div className="simulation-layout">
        <div className="scene-panel">
          <div className="renderer-toolbar" aria-label="Learning mode">
            {(["accessible_2d", "desktop_3d", "marker_ar", "markerless_ar"] as RendererMode[]).map(
              (rendererMode) => (
                <button
                  type="button"
                  key={rendererMode}
                  aria-pressed={mode === rendererMode}
                  disabled={availableModes?.[rendererMode] === false || selectRenderer.isPending}
                  onClick={() => chooseMode(rendererMode)}
                >
                  {rendererLabels[rendererMode]}
                  {capabilities && recommendedRenderer(capabilities) === rendererMode
                    ? " · recommended"
                    : ""}
                </button>
              ),
            )}
          </div>
          <div className="renderer-toolbar" aria-label="Guidance level">
            {(["guided", "independent"] as const).map((learningMode) => (
              <button
                type="button"
                key={learningMode}
                aria-pressed={attempt.learning_mode === learningMode}
                disabled={!capabilities || selectRenderer.isPending}
                onClick={() => chooseLearningMode(learningMode)}
              >
                {learningMode === "guided" ? "Guided practice" : "Independent assessment"}
              </button>
            ))}
          </div>
          {independent ? (
            <p className="scene-help" role="status">
              Ordered prompts, active-step highlights, and hints are hidden. Scoring and required
              evidence are unchanged.
            </p>
          ) : null}

          {mode === "desktop_3d" && (
            <>
              <BatteryWorkshopScene
                currentAction={independent ? null : (currentStep?.action_code ?? null)}
                completedActions={completedActions}
                disabled={isBusy}
                onAction={(action) => performAction(action, "scene")}
                modelAsset={productionModelAsset}
                onAssetLoaded={handleAssetLoaded}
                onAssetFailure={handleAssetFailure}
              />
              <p className="scene-help">
                Drag to orbit · scroll to zoom · select workshop objects to act
              </p>
            </>
          )}
          {mode === "accessible_2d" && (
            <div className="accessible-renderer" role="region" aria-label="Accessible lesson">
              <span className="eyebrow">Equivalent learning path</span>
              <h2>
                {independent
                  ? "Complete the procedure independently"
                  : (currentStep?.title ?? "Procedure complete")}
              </h2>
              <p>
                {independent
                  ? "Choose actions from the unnumbered panel. No ordered answer prompts are shown."
                  : (currentStep?.instruction ?? "All required evidence is saved.")}
              </p>
              {!independent &&
                currentStep?.hazards?.map((hazard) => (
                  <div className="accessible-hazard" key={hazard.code}>
                    <strong>{hazard.title}</strong>
                    <p>{hazard.mitigation}</p>
                  </div>
                ))}
              {!independent
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
                : null}
              <p>
                Use the procedure controls beside this panel. They create the same evidence and
                score as 3D or AR.
              </p>
            </div>
          )}
          {mode === "marker_ar" && (
            <CameraArView
              currentStep={currentStep}
              independent={independent}
              disabled={isBusy}
              onAction={(action) => performAction(action, "camera-ar")}
              onTelemetry={recordTelemetry}
              expectedMarker={expectedMarker}
            />
          )}
          {mode === "markerless_ar" && (
            <MarkerlessArView currentStep={currentStep} onTelemetry={recordTelemetry} />
          )}
          <div className={`sync-banner ${online ? "is-online" : "is-offline"}`} role="status">
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
            <div className="inline-confirm" role="alertdialog" aria-labelledby="discard-title">
              <strong id="discard-title">Delete the actions saved on this device?</strong>
              <p>
                {pendingSync} saved {pendingSync === 1 ? "action" : "actions"} for this attempt
                cannot be delivered. Deleting them lets you carry on; your instructor still sees
                everything the server already received. To keep them, leave this page and ask your
                instructor before deleting.
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
          {!independent && currentStep?.hints?.length ? (
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
                      ? "Show another hint"
                      : "Request a guided hint"}
                  {nextHint.points_penalty > 0 ? ` (−${nextHint.points_penalty} points)` : ""}
                </button>
              ) : (
                <small>No more hints for this step.</small>
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
          ) : null}
        </div>

        <aside className="procedure-panel" aria-live="polite">
          {currentStep ? (
            <>
              {independent ? (
                <>
                  <div className="step-count">Independent evidence capture</div>
                  <h2>Choose the next correct action</h2>
                  <p>Required safety rules still apply. The procedure order is not displayed.</p>
                </>
              ) : (
                <>
                  <div className="step-count">
                    Step {currentStep.order} of {lesson.procedure_steps.length}
                  </div>
                  <h2>{currentStep.title}</h2>
                  <p>{currentStep.instruction}</p>
                  {currentStep.safety_critical && (
                    <p className="safety-callout">Safety-critical step</p>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <div className="step-count">Procedure complete</div>
              <h2>Ready to submit</h2>
              <p>Your ordered action evidence is saved. Submit it for server-side scoring.</p>
            </>
          )}

          {record.data && (
            <p
              className={`action-feedback ${record.data.correct ? "is-correct" : "is-incorrect"}`}
              role="status"
            >
              {record.data.message}
            </p>
          )}
          {record.isError && (
            <p className="form-error" role="alert">
              {describeApiError(record.error, "The action could not be saved.")}
            </p>
          )}

          <div className="accessible-actions">
            <h3>{independent ? "Independent action panel" : "Accessible procedure controls"}</h3>
            <p>
              {independent
                ? "Actions use a stable, attempt-specific order that does not reveal the procedure sequence."
                : "These buttons provide the same actions as the 3D objects."}
            </p>
            {(independent
              ? deterministicActionOrder(lesson.procedure_steps, attempt.id)
              : lesson.procedure_steps
            ).map((step: ProcedureStep) => {
              const completed = completedCodes.includes(step.code);
              const active = step.code === currentStep?.code;
              return (
                <button
                  key={step.code}
                  className={`procedure-action${active ? " is-active" : ""}${completed ? " is-complete" : ""}`}
                  onClick={() => performAction(step.action_code, "accessible-controls")}
                  disabled={isBusy || completed}
                  aria-current={!independent && active ? "step" : undefined}
                >
                  <span>{independent ? "•" : step.order}</span>
                  <strong>{step.title}</strong>
                  <small>
                    {completed
                      ? "Completed"
                      : !independent && active
                        ? "Current step"
                        : "Available action"}
                  </small>
                </button>
              );
            })}
          </div>

          <button
            className="button button-primary submit-attempt"
            disabled={!isReady || isBusy || !online || pendingSync > 0}
            onClick={() => complete.mutate()}
          >
            {complete.isPending
              ? "Scoring attempt…"
              : !online
                ? "Reconnect to submit"
                : pendingSync > 0
                  ? "Send saved actions before submitting"
                  : "Complete and view result"}
          </button>
          {confirmingEnd ? (
            <div className="inline-confirm" role="alertdialog" aria-labelledby="end-title">
              <strong id="end-title">End this attempt?</strong>
              <p>
                It will not be scored and counts towards your attempt limit. Its evidence stays in
                your history, and a new attempt starts from the safe beginning.
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
                  {abandon.isPending ? "Ending attempt…" : "End attempt"}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="button button-secondary"
              type="button"
              disabled={!online || pendingSync > 0 || abandon.isPending}
              onClick={() => setConfirmingEnd(true)}
            >
              End and restart safely
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
        </aside>
      </div>
    </section>
  );
}
