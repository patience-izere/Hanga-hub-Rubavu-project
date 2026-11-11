import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { Consequence, ProcedureStep, RendererMode, SceneDefinition } from "../../api/learning";
import {
  allOptions,
  completedActionCodes,
  formatDuration,
  stepOptions,
  type ActionOption,
  type Sequence,
} from "../../procedure/engine";
import {
  narrate,
  recordedNarration,
  speechAvailable,
  stopNarration,
  type NarrationFile,
} from "../../procedure/narration";
import { fallbackScene, sceneOffers } from "../../procedure/scene";
import { cue, setSoundEnabled, soundEnabled } from "../../procedure/sensory";
import { useLocale } from "../../i18n/LocaleProvider";
import type { MessageKey } from "../../i18n/messages";
import { ScenePlayer, type SceneEffect } from "./ScenePlayer";
import "../../styles/workspace.css";

export type ActionSource = "scene" | "accessible-controls" | "camera-ar";

export type WorkspaceFeedback = {
  /** Changes with every answer, so repeating the same mistake still replays its consequence. */
  id: number;
  correct: boolean;
  message: string;
  consequence?: Consequence | null;
  action?: string;
};

const modeLabel = (mode: RendererMode) => `ws.mode.${mode}` as MessageKey;
const modeNote = (mode: RendererMode) => `ws.modeNote.${mode}` as MessageKey;
const CONSEQUENCE_EFFECTS = new Set(["spark", "blown_fuse", "wrong_reading", "hazard", "damage"]);

export type ProcedureWorkspaceProps = {
  title: string;
  kicker: string;
  back?: { to: string; label: string };
  steps: ProcedureStep[];
  completedCodes: string[];
  sequence: Sequence;
  scene?: SceneDefinition | null;
  /** Things a learner may pick that are never right, offered among the actions. */
  distractors?: ActionOption[];
  /** Hide the order, the highlights and the per-step prompts. */
  independent: boolean;
  mode: RendererMode;
  modes?: Array<{ mode: RendererMode; available: boolean; recommended: boolean }> | null;
  onModeChange?(mode: RendererMode): void;
  guidance?: {
    value: "guided" | "independent";
    locked: boolean;
    onChange(value: "guided" | "independent"): void;
  } | null;
  busy: boolean;
  feedback: WorkspaceFeedback | null;
  onAction(action: string, source: ActionSource): void;
  /** Keeps the shuffled order of an unprompted action list stable for one attempt. */
  seed: number | string;
  startedAt?: string | null;
  language?: string;
  narrationFiles?: NarrationFile[];
  /** Replaces the built-in stage, for the camera and room AR renderers. */
  renderStage?(mode: RendererMode): ReactNode | null;
  /** Reference pictures or video shown in the simple view. */
  simpleMedia?: ReactNode;
  status?: ReactNode;
  hint?: ReactNode;
  footer: ReactNode;
};

function Clock({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, (now - new Date(startedAt).getTime()) / 1000);
  // Long-running attempts (resumed another day) would show a meaningless number.
  if (seconds > 3 * 3600) return null;
  return (
    <span className="ws-clock" aria-hidden="true">
      {formatDuration(seconds)}
    </span>
  );
}

export function ProcedureWorkspace({
  title,
  kicker,
  back,
  steps,
  completedCodes,
  sequence,
  scene,
  distractors,
  independent,
  mode,
  modes,
  onModeChange,
  guidance,
  busy,
  feedback,
  onAction,
  seed,
  startedAt,
  language = "en",
  narrationFiles = [],
  renderStage,
  simpleMedia,
  status,
  hint,
  footer,
}: ProcedureWorkspaceProps) {
  const { t } = useLocale();
  const [sound, setSound] = useState(soundEnabled);
  const free = sequence === "free";
  const currentStep = steps.find((step) => !completedCodes.includes(step.code)) ?? null;
  const done = steps.length > 0 && !currentStep;
  const prompted = !independent && !free;
  const activeScene = useMemo(() => scene ?? fallbackScene(steps), [scene, steps]);
  const completedActions = useMemo(
    () => completedActionCodes(steps, completedCodes),
    [steps, completedCodes],
  );
  const usesScene = mode !== "accessible_2d";

  // Sound and vibration answer each action once.
  const lastFeedback = useRef<number | null>(null);
  useEffect(() => {
    if (!feedback || feedback.id === lastFeedback.current) return;
    lastFeedback.current = feedback.id;
    if (feedback.correct) cue(done ? "complete" : "correct");
    else cue(feedback.consequence?.effect ?? "wrong");
  }, [feedback, done]);

  useEffect(() => stopNarration, []);

  const sceneEffect = useMemo<SceneEffect | null>(
    () =>
      feedback && !feedback.correct && feedback.action
        ? {
            id: feedback.id,
            kind: feedback.consequence?.effect ?? "none",
            action: feedback.action,
          }
        : null,
    [feedback],
  );

  const options: ActionOption[] = prompted
    ? currentStep
      ? stepOptions(currentStep)
      : []
    : allOptions(steps, distractors ?? scene?.extra_actions ?? [], seed);
  const doneActions = new Set(
    steps.filter((step) => completedCodes.includes(step.code)).map((step) => step.action_code),
  );
  // Buttons are always there; when the scene offers the same actions they step back so the
  // workshop stays the main way to act.
  const sceneCovers =
    usesScene &&
    mode === "desktop_3d" &&
    options.every((option) => sceneOffers(activeScene, option.action_code));

  const narrationText = currentStep ? `${currentStep.title}. ${currentStep.instruction}` : "";
  const recorded = currentStep
    ? recordedNarration(narrationFiles, currentStep.code, language)
    : null;
  const canListen =
    Boolean(currentStep) && prompted && (recorded !== null || speechAvailable(language));

  const optionButtons = (
    <div className={`ws-options${options.length > 4 ? " is-many" : ""}`}>
      {options.map((option) => {
        const finished = !prompted && doneActions.has(option.action_code);
        return (
          <button
            key={option.action_code}
            type="button"
            className={`ws-option${finished ? " is-done" : ""}`}
            disabled={busy || finished}
            onClick={() => onAction(option.action_code, "accessible-controls")}
          >
            <span>{option.label}</span>
            {finished ? <small>{t("ws.done")}</small> : null}
          </button>
        );
      })}
    </div>
  );

  const customStage = renderStage?.(mode) ?? null;

  return (
    <section className={`ws ws-mode-${mode}`}>
      <header className="ws-header">
        <div className="ws-heading">
          {back ? (
            <Link className="back-link" to={back.to}>
              ← {back.label}
            </Link>
          ) : null}
          <span className="eyebrow">{kicker}</span>
          <h1>{title}</h1>
        </div>
        <div className="ws-tools">
          {startedAt ? <Clock startedAt={startedAt} /> : null}
          <div
            className="ws-count"
            aria-label={`${completedCodes.length} of ${steps.length} steps complete`}
          >
            <strong>
              {completedCodes.length}/{steps.length}
            </strong>
            <span>{free ? t("ws.found") : t("ws.steps")}</span>
          </div>
          <button
            type="button"
            className="ws-icon-button"
            aria-pressed={sound}
            onClick={() => {
              setSoundEnabled(!sound);
              setSound(!sound);
            }}
          >
            {sound ? t("ws.soundOn") : t("ws.soundOff")}
          </button>
        </div>
      </header>

      <ol className="ws-rail" aria-hidden="true">
        {steps.map((step) => (
          <li
            key={step.code}
            className={
              completedCodes.includes(step.code)
                ? "is-done"
                : prompted && step.code === currentStep?.code
                  ? "is-current"
                  : undefined
            }
          />
        ))}
      </ol>

      {modes || guidance ? (
        <details className="ws-settings">
          <summary>
            {t("ws.view")} <strong>{t(modeLabel(mode))}</strong>
            {guidance ? (
              <> · {guidance.value === "guided" ? t("ws.withGuidance") : t("ws.withoutGuidance")}</>
            ) : null}
          </summary>
          {modes ? (
            <div className="ws-setting-group" role="group" aria-label="How to practise">
              {modes.map((item) => (
                <button
                  key={item.mode}
                  type="button"
                  aria-pressed={mode === item.mode}
                  disabled={!item.available}
                  onClick={() => onModeChange?.(item.mode)}
                >
                  <strong>
                    {t(modeLabel(item.mode))}
                    {item.recommended ? ` · ${t("ws.recommended")}` : ""}
                  </strong>
                  <small>{item.available ? t(modeNote(item.mode)) : t("ws.notAvailable")}</small>
                </button>
              ))}
            </div>
          ) : null}
          {guidance ? (
            <div className="ws-setting-group" role="group" aria-label="Guidance">
              {(["guided", "independent"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={guidance.value === value}
                  disabled={guidance.locked && guidance.value !== value}
                  onClick={() => guidance.onChange(value)}
                >
                  <strong>
                    {value === "guided" ? t("ws.withGuidance") : t("ws.withoutGuidance")}
                  </strong>
                  <small>{value === "guided" ? t("ws.guidedNote") : t("ws.unguidedNote")}</small>
                </button>
              ))}
              {guidance.locked ? <p className="field-note">{t("ws.guidanceLocked")}</p> : null}
            </div>
          ) : null}
        </details>
      ) : null}

      <div className="ws-body">
        <div className="ws-stage">
          {customStage ??
            (usesScene ? (
              <ScenePlayer
                scene={activeScene}
                steps={steps}
                completedActions={completedActions}
                currentAction={prompted ? (currentStep?.action_code ?? null) : null}
                disabled={busy}
                onAction={(action) => onAction(action, "scene")}
                effect={sceneEffect}
              />
            ) : (
              <div className="ws-simple" role="region" aria-label="Accessible lesson">
                <span className="eyebrow">{t("ws.simpleView")}</span>
                <p>{t("ws.simpleText")}</p>
                {simpleMedia}
              </div>
            ))}
          {status}
        </div>

        <aside className="ws-card" aria-live="polite">
          {done ? (
            <>
              <div className="ws-step-count">{t("ws.allDone")}</div>
              <h2>{t("ws.readyToFinish")}</h2>
              <p>{t("ws.readyText")}</p>
            </>
          ) : prompted && currentStep ? (
            <>
              <div className="ws-step-count">
                {t("ws.stepOf", { n: currentStep.order, total: steps.length })}
                {currentStep.safety_critical ? (
                  <span className="ws-safety">{t("ws.safetyStep")}</span>
                ) : null}
              </div>
              <h2>{currentStep.title}</h2>
              <p>{currentStep.instruction}</p>
              {currentStep.hazards?.map((hazard) => (
                <p className="ws-hazard" key={hazard.code}>
                  <strong>{hazard.title}.</strong> {hazard.mitigation}
                </p>
              ))}
              {canListen ? (
                <button
                  type="button"
                  className="ws-listen"
                  onClick={() => narrate(narrationText, language, recorded)}
                >
                  {t("ws.listen")}
                </button>
              ) : null}
            </>
          ) : free ? (
            <>
              <div className="ws-step-count">
                {t("ws.stillToFind", { n: steps.length - completedCodes.length })}
              </div>
              <h2>{currentStep?.instruction ?? t("ws.lookAround")}</h2>
              <p>{t("ws.freeText")}</p>
            </>
          ) : (
            <>
              <div className="ws-step-count">{t("ws.noGuidance")}</div>
              <h2>{t("ws.noGuidanceTitle")}</h2>
              <p>{t("ws.noGuidanceText")}</p>
            </>
          )}

          {feedback ? (
            <div
              className={`ws-feedback ${feedback.correct ? "is-correct" : "is-incorrect"}${
                feedback.consequence && feedback.consequence.effect !== "none"
                  ? ` is-${feedback.consequence.effect}`
                  : ""
              }`}
              role="status"
            >
              {!feedback.correct && feedback.consequence ? (
                <strong>
                  {CONSEQUENCE_EFFECTS.has(feedback.consequence.effect)
                    ? t(`ws.effect.${feedback.consequence.effect}` as MessageKey)
                    : t("ws.notThat")}
                </strong>
              ) : null}
              <span>{feedback.message}</span>
            </div>
          ) : null}

          {done || options.length === 0 ? null : sceneCovers ? (
            <details className="ws-buttons-toggle">
              <summary>{t("ws.useButtons")}</summary>
              {optionButtons}
            </details>
          ) : (
            <div className="ws-buttons">
              {prompted && options.length > 1 ? <h3>{t("ws.chooseOne")}</h3> : null}
              {!prompted ? <h3>{free ? t("ws.whatCanYouSee") : t("ws.actions")}</h3> : null}
              {optionButtons}
            </div>
          )}

          {hint}

          {prompted && steps.length > 1 ? (
            <details className="ws-steps">
              <summary>{t("ws.allSteps")}</summary>
              <ol>
                {steps.map((step) => (
                  <li
                    key={step.code}
                    className={completedCodes.includes(step.code) ? "is-done" : undefined}
                    aria-current={step.code === currentStep?.code ? "step" : undefined}
                  >
                    {step.title}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}

          <div className="ws-footer">{footer}</div>
        </aside>
      </div>
    </section>
  );
}
