import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import type {
  CapabilityProfile,
  ProcedureStep,
  RendererMode,
  TelemetryEventInput,
} from "../api/learning";
import { detectCapabilities, recommendedRenderer, rendererAvailability } from "../ar/capabilities";
import { BatteryWorkshopScene } from "../components/simulation/BatteryWorkshopScene";
import { CameraArView } from "../components/simulation/CameraArView";
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
import { listOutboxItems, synchronizeOutbox } from "../offline/outbox";

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
  const [synchronizing, setSynchronizing] = useState(false);
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
        setPendingSync(attemptItems.length);
        setFailedSync(
          attemptItems.filter((item) => ["failed", "conflict"].includes(item.syncStatus ?? ""))
            .length,
        );
        setStaleSync(attemptItems.filter((item) => item.syncStatus === "stale").length);
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
  const incorrectCount = attempt.events.filter(
    (event) => event.event_type === "incorrect_action",
  ).length;
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

  if (attempt.status === "completed") {
    return (
      <section className="result-page">
        <div className="result-card">
          <span className="result-kicker">Attempt complete</span>
          <div className="result-score" aria-label={`Score ${attempt.score} percent`}>
            <strong>{Number(attempt.score)}</strong>
            <span>%</span>
          </div>
          <h1>{lesson.title}</h1>
          <p>
            You completed all {lesson.procedure_steps.length} procedure steps with {incorrectCount}{" "}
            recorded incorrect {incorrectCount === 1 ? "action" : "actions"}.
          </p>
          <div className="result-evidence">
            <div>
              <strong>{completedCodes.length}</strong>
              <span>steps evidenced</span>
            </div>
            <div>
              <strong>{incorrectCount}</strong>
              <span>actions to review</span>
            </div>
            <div>
              <strong>{attempt.score === "100.00" ? "Mastered" : "Review"}</strong>
              <span>recommendation</span>
            </div>
          </div>
          <p className="result-note">
            Scores are calculated by Django from the saved action sequence. Safety-order errors
            carry a larger penalty.
          </p>
          {(attempt.competency_results ?? []).length > 0 ? (
            <div className="result-feedback">
              <strong>Competency evidence</strong>
              <ul>
                {attempt.competency_results.map((result) => (
                  <li key={result.competency_code}>
                    {result.competency_code}: {Number(result.mastery_percentage)}% ·{" "}
                    {result.mastery_state.replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {(attempt.step_results ?? []).some(
            (result) =>
              result.outcome !== "passed" || result.hints_used > 0 || result.safety_violations > 0,
          ) ? (
            <div className="result-feedback">
              <strong>Steps to review</strong>
              <ul>
                {attempt.step_results
                  .filter(
                    (result) =>
                      result.outcome !== "passed" ||
                      result.hints_used > 0 ||
                      result.safety_violations > 0,
                  )
                  .map((result) => (
                    <li key={result.step_code}>
                      {result.step_code}: {result.outcome.replaceAll("_", " ")} ·{" "}
                      {result.hints_used} hint(s) · {result.safety_violations} safety violation(s)
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {attempt.recommendation && (
            <div className="result-recommendation">
              <strong>Recommended next action</strong>
              <p>{attempt.recommendation.rationale}</p>
              {attempt.recommendation.override_kind ? (
                <p>
                  Instructor decision: {attempt.recommendation.override_kind.replaceAll("_", " ")}.{" "}
                  {attempt.recommendation.override_reason}
                </p>
              ) : null}
              <small>Rule: {attempt.recommendation.rule_version}</small>
            </div>
          )}
          {attempt.feedback.length > 0 && (
            <div className="result-feedback">
              <strong>Instructor feedback</strong>
              {attempt.feedback.map((item) => (
                <blockquote key={item.id}>{item.feedback}</blockquote>
              ))}
            </div>
          )}
          <Link className="button button-primary" to="/learn">
            Return to my learning
          </Link>
          <Link
            className="button button-secondary"
            to={`/research/survey?scenarioVersion=${attempt.scenario_version}`}
          >
            Complete optional pilot evaluation
          </Link>
        </div>
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
              {staleSync
                ? `${staleSync} evidence item(s) use a stale scenario version and need instructor review`
                : failedSync
                  ? `${failedSync} evidence item(s) need synchronization review`
                  : pendingSync
                    ? `${pendingSync} evidence item(s) pending`
                    : "Evidence synchronized"}
            </span>
            {online && pendingSync > 0 && (
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
          {!independent && currentStep?.hints?.length ? (
            <div className="hint-panel">
              <button
                className="button button-secondary"
                type="button"
                disabled={!online || hint.isPending}
                onClick={() => hint.mutate(currentStep.hints[0].code)}
              >
                {hint.isPending ? "Loading hint…" : "Request a guided hint"}
              </button>
              {!online ? (
                <small>Hints require a connection so their evidence is preserved.</small>
              ) : null}
              {hint.data ? <p role="status">{hint.data.hint.text}</p> : null}
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
              {record.error instanceof ApiError
                ? record.error.message
                : "The action could not be saved."}
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
              : !online || pendingSync > 0
                ? "Synchronize evidence before scoring"
                : "Complete and view result"}
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={!online || pendingSync > 0 || abandon.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "End this attempt? Its evidence will remain in history and a new attempt will start from the safe beginning.",
                )
              ) {
                abandon.mutate(undefined, {
                  onSuccess: () => navigate(`/assignments/${attempt.assignment.id}`),
                });
              }
            }}
          >
            {abandon.isPending ? "Ending attempt…" : "End and restart safely"}
          </button>
          {!online || pendingSync > 0 ? (
            <small>Synchronize saved evidence before ending this attempt.</small>
          ) : null}
          {complete.isError && (
            <p className="form-error" role="alert">
              {complete.error instanceof ApiError
                ? complete.error.message
                : "The attempt could not be completed."}
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
