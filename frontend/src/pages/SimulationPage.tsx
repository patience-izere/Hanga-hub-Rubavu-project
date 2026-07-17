import { Link, useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import type { ProcedureStep } from "../api/learning";
import { BatteryWorkshopScene } from "../components/simulation/BatteryWorkshopScene";
import { useAttempt, useCompleteAttempt, useRecordAttemptAction } from "../learning/useAssignments";

export function SimulationPage() {
  const attemptId = Number(useParams().attemptId);
  const attemptQuery = useAttempt(attemptId);
  const record = useRecordAttemptAction(attemptId);
  const complete = useCompleteAttempt(attemptId);

  if (attemptQuery.isPending) {
    return <p className="panel-status">Preparing the workshop…</p>;
  }
  if (attemptQuery.isError || !attemptQuery.data) {
    return (
      <section className="lesson-page">
        <p className="form-error" role="alert">
          This attempt is unavailable.
        </p>
        <Link to="/dashboard">Return to my learning</Link>
      </section>
    );
  }

  const attempt = complete.data || attemptQuery.data;
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

  function performAction(action: string, source: "scene" | "accessible-controls") {
    if (!isBusy && attempt.status === "in_progress") record.mutate({ action, source });
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
          <Link className="button button-primary" to="/dashboard">
            Return to my learning
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
          <span className="eyebrow">Guided practical · Attempt {attempt.id}</span>
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
          <BatteryWorkshopScene
            currentAction={currentStep?.action_code || null}
            completedActions={completedActions}
            disabled={isBusy}
            onAction={(action) => performAction(action, "scene")}
          />
          <p className="scene-help">
            Drag to orbit · scroll to zoom · select workshop objects to act
          </p>
        </div>

        <aside className="procedure-panel" aria-live="polite">
          {currentStep ? (
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
            <h3>Accessible procedure controls</h3>
            <p>These buttons provide the same actions as the 3D objects.</p>
            {lesson.procedure_steps.map((step: ProcedureStep) => {
              const completed = completedCodes.includes(step.code);
              const active = step.code === currentStep?.code;
              return (
                <button
                  key={step.code}
                  className={`procedure-action${active ? " is-active" : ""}${completed ? " is-complete" : ""}`}
                  onClick={() => performAction(step.action_code, "accessible-controls")}
                  disabled={isBusy || completed}
                  aria-current={active ? "step" : undefined}
                >
                  <span>{step.order}</span>
                  <strong>{step.title}</strong>
                  <small>
                    {completed ? "Completed" : active ? "Current step" : "Available action"}
                  </small>
                </button>
              );
            })}
          </div>

          <button
            className="button button-primary submit-attempt"
            disabled={!isReady || isBusy}
            onClick={() => complete.mutate()}
          >
            {complete.isPending ? "Scoring attempt…" : "Complete and view result"}
          </button>
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
