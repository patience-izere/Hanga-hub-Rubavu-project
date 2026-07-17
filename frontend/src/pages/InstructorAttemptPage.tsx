import { Link, useParams } from "react-router-dom";

import type { AttemptEvent } from "../api/learning";
import { useInstructorAttempt } from "../learning/useInstructor";

function eventDescription(event: AttemptEvent, stepTitles: Map<string, string>) {
  const stepCode = String(event.payload.stepCode || event.payload.expectedStepCode || "");
  const stepTitle = stepTitles.get(stepCode) || stepCode;
  if (event.event_type === "attempt_started") return "Learner opened the practical attempt.";
  if (event.event_type === "step_completed") return `Completed: ${stepTitle}.`;
  if (event.event_type === "incorrect_action") {
    return `Action was out of sequence while expecting: ${stepTitle}.`;
  }
  if (event.event_type === "attempt_completed")
    return `Attempt submitted with a score of ${event.payload.score}%.`;
  return event.event_type.replaceAll("_", " ");
}

export function InstructorAttemptPage() {
  const attemptId = Number(useParams().attemptId);
  const attempt = useInstructorAttempt(attemptId);

  if (attempt.isPending) return <p className="panel-status">Loading attempt evidence…</p>;
  if (attempt.isError || !attempt.data) {
    return (
      <section className="lesson-page">
        <p className="form-error" role="alert">
          Attempt evidence is unavailable.
        </p>
        <Link to="/dashboard">Return to dashboard</Link>
      </section>
    );
  }

  const data = attempt.data;
  const stepTitles = new Map(data.procedure_steps.map((step) => [step.code, step.title]));

  return (
    <section className="attempt-review-page">
      <Link className="back-link" to="/dashboard">
        ← Instructor dashboard
      </Link>
      <header className="review-header">
        <div>
          <span className="eyebrow">
            Attempt {data.id} · {data.lesson.trade}
          </span>
          <h1>{data.learner.name}</h1>
          <p>
            {data.lesson.title} · {data.lesson.courseTitle}
          </p>
        </div>
        <div className="review-score">
          <strong>{data.score ? `${Number(data.score)}%` : "Pending"}</strong>
          <span>{data.status.replaceAll("_", " ")}</span>
        </div>
      </header>

      <div className="review-summary">
        <article>
          <strong>
            {data.completed_steps}/{data.total_steps}
          </strong>
          <span>steps completed</span>
        </article>
        <article>
          <strong>{data.incorrect_actions}</strong>
          <span>incorrect actions</span>
        </article>
        <article className={data.safety_errors ? "summary-alert" : ""}>
          <strong>{data.safety_errors}</strong>
          <span>safety errors</span>
        </article>
      </div>

      <section className="timeline-panel">
        <div className="evidence-heading">
          <div>
            <h2>Action timeline</h2>
            <p>Immutable evidence in the order received by Django.</p>
          </div>
        </div>
        <ol className="attempt-timeline">
          {data.events.map((event) => {
            const isError = event.event_type === "incorrect_action";
            const isSafety = isError && event.payload.safetyCritical === true;
            return (
              <li
                key={event.sequence}
                className={`${isError ? "timeline-error" : ""}${isSafety ? " timeline-safety" : ""}`}
              >
                <span className="timeline-sequence">{event.sequence}</span>
                <div>
                  <strong>{event.event_type.replaceAll("_", " ")}</strong>
                  <p>{eventDescription(event, stepTitles)}</p>
                  <time dateTime={event.occurred_at}>
                    {new Date(event.occurred_at).toLocaleString()}
                  </time>
                </div>
                {isSafety && <span className="safety-badge">Safety</span>}
              </li>
            );
          })}
        </ol>
      </section>
    </section>
  );
}
