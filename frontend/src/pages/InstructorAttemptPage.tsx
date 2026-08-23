import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { AttemptEvent } from "../api/learning";
import {
  useInstructorAttempt,
  useOverrideAttemptRecommendation,
  useSubmitInstructorFeedback,
} from "../learning/useInstructor";

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
  const submitFeedback = useSubmitInstructorFeedback(attemptId);
  const overrideRecommendation = useOverrideAttemptRecommendation(attemptId);
  const [observation, setObservation] = useState("");
  const [feedback, setFeedback] = useState("");
  const [overrideKind, setOverrideKind] = useState<
    "continue" | "remediate" | "retry" | "instructor_review" | "complete"
  >("continue");
  const [overrideReason, setOverrideReason] = useState("");

  if (attempt.isPending) return <p className="panel-status">Loading attempt evidence…</p>;
  if (attempt.isError || !attempt.data) {
    return (
      <section className="lesson-page">
        <p className="form-error" role="alert">
          Attempt evidence is unavailable.
        </p>
        <Link to="/teach">Return to the instructor overview</Link>
      </section>
    );
  }

  const data = attempt.data;
  const stepTitles = new Map(data.procedure_steps.map((step) => [step.code, step.title]));

  return (
    <section className="attempt-review-page">
      <Link className="back-link" to="/teach">
        ← Instructor overview
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

      {data.recommendations?.[0] ? (
        <section className="feedback-panel">
          <div>
            <span className="eyebrow">Transparent sequencing</span>
            <h2>Recommendation review</h2>
            <p>{data.recommendations[0].rationale}</p>
            <p>
              Rule {data.recommendations[0].rule_version} recommended{" "}
              <strong>{data.recommendations[0].kind.replaceAll("_", " ")}</strong>.
            </p>
            {data.recommendations[0].override_kind ? (
              <p role="status">
                Overridden to {data.recommendations[0].override_kind.replaceAll("_", " ")} by{" "}
                {data.recommendations[0].overridden_by_name}:{" "}
                {data.recommendations[0].override_reason}
              </p>
            ) : null}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              overrideRecommendation.mutate({ kind: overrideKind, reason: overrideReason });
            }}
          >
            <label>
              Instructor decision
              <select
                value={overrideKind}
                onChange={(event) => setOverrideKind(event.target.value as typeof overrideKind)}
              >
                <option value="continue">Continue</option>
                <option value="remediate">Remediate</option>
                <option value="retry">Retry</option>
                <option value="instructor_review">Instructor review</option>
                <option value="complete">Complete</option>
              </select>
            </label>
            <label>
              Audit reason
              <textarea
                required
                minLength={10}
                rows={3}
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
              />
            </label>
            <button className="button button-secondary" disabled={overrideRecommendation.isPending}>
              Record override
            </button>
          </form>
        </section>
      ) : null}

      <section className="feedback-panel">
        <div>
          <span className="eyebrow">Instructor evidence</span>
          <h2>Observation and learner feedback</h2>
          <p>
            Published feedback becomes visible to the learner and is retained with its author and
            timestamp.
          </p>
        </div>
        {data.feedback?.map((item) => (
          <article key={item.id}>
            <strong>{item.author_name}</strong>
            {item.observation && <p>{item.observation}</p>}
            <blockquote>{item.feedback}</blockquote>
            <small>{item.is_published ? "Published" : "Draft"}</small>
          </article>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitFeedback.mutate(
              { observation, feedback, is_published: true },
              {
                onSuccess: () => {
                  setObservation("");
                  setFeedback("");
                },
              },
            );
          }}
        >
          <label>
            Practical observation
            <textarea
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              rows={3}
            />
          </label>
          <label>
            Feedback for the learner
            <textarea
              required
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              rows={4}
            />
          </label>
          <button className="button button-primary" disabled={submitFeedback.isPending}>
            {submitFeedback.isPending ? "Publishing…" : "Publish feedback"}
          </button>
          {submitFeedback.isError && (
            <p className="form-error" role="alert">
              Feedback could not be published.
            </p>
          )}
        </form>
      </section>
    </section>
  );
}
