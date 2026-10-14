import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { describeApiError } from "../api/client";
import type { InstructorAttemptReview, ReviewDecision } from "../api/instructor";
import type { AttemptEvent } from "../api/learning";
import { attemptOutcomeLabel, attemptStatusLabel } from "../learning/labels";
import {
  useInstructorAttempt,
  useOverrideAttemptRecommendation,
  useSignOffAttempt,
  useSubmitInstructorFeedback,
  useUpdateInstructorFeedback,
} from "../learning/useInstructor";

const RECOMMENDATION_LABELS: Record<string, string> = {
  continue: "Continue the attempt",
  remediate: "Practise again with support",
  retry: "Repeat independently",
  instructor_review: "Instructor review",
  complete: "Complete",
};

const MASTERY_LABELS: Record<string, string> = {
  mastered: "Mastered",
  developing: "Developing",
  not_demonstrated: "Not demonstrated",
  requires_review: "Held for review",
};

function eventDescription(event: AttemptEvent, stepTitles: Map<string, string>) {
  const stepCode = String(event.payload.stepCode || event.payload.expectedStepCode || "");
  const stepTitle = stepTitles.get(stepCode) || stepCode;
  if (event.event_type === "attempt_started") return "Learner opened the practical attempt.";
  if (event.event_type === "step_completed") return `Completed: ${stepTitle}.`;
  if (event.event_type === "incorrect_action") {
    return `Action was out of sequence while expecting: ${stepTitle}.`;
  }
  if (event.event_type === "tolerance_failed") {
    return `Measurement outside the accepted range while doing: ${stepTitle}.`;
  }
  if (event.event_type === "hint_used") return `Used a hint on: ${stepTitle}.`;
  if (event.event_type === "attempt_completed")
    return `Attempt submitted with a score of ${event.payload.score}%.`;
  return event.event_type.replaceAll("_", " ");
}

function isMistake(event: AttemptEvent) {
  return event.event_type === "incorrect_action" || event.event_type === "tolerance_failed";
}

function SignOffPanel({ data }: { data: InstructorAttemptReview }) {
  const signOff = useSignOffAttempt(data.id);
  const [decision, setDecision] = useState<ReviewDecision>("competent");
  const [note, setNote] = useState("");
  const score = data.score === null || data.score === undefined ? null : Number(data.score);
  const belowPassMark = score !== null && score < data.pass_threshold;

  return (
    <section className="signoff-panel" aria-labelledby="signoff-title">
      <span className="eyebrow">Waiting for you</span>
      <h2 id="signoff-title">Sign off this attempt</h2>
      <p>
        Grading held this attempt because {data.safety_errors} safety-critical{" "}
        {data.safety_errors === 1 ? "mistake was" : "mistakes were"} recorded. Check the timeline
        below, then decide how it counts. The learner sees your decision and reason.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          signOff.mutate({ decision, note });
        }}
      >
        <fieldset>
          <legend>Decision</legend>
          <label className="choice-row">
            <input
              type="radio"
              name="decision"
              value="competent"
              checked={decision === "competent"}
              onChange={() => setDecision("competent")}
            />
            <span>
              <strong>Accept the graded result</strong>
              <small>
                {score === null
                  ? "The attempt counts with its graded score."
                  : belowPassMark
                    ? `The score of ${score}% is below the ${data.pass_threshold}% pass mark, so it still counts as not passed.`
                    : `It counts with its score of ${score}% (pass mark ${data.pass_threshold}%).`}
              </small>
            </span>
          </label>
          <label className="choice-row">
            <input
              type="radio"
              name="decision"
              value="not_yet_competent"
              checked={decision === "not_yet_competent"}
              onChange={() => setDecision("not_yet_competent")}
            />
            <span>
              <strong>Not yet competent</strong>
              <small>
                The attempt counts as not passed and the learner is told to practise again.
              </small>
            </span>
          </label>
        </fieldset>
        <label>
          Reason for your decision
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What you saw, and what the learner should do next."
          />
        </label>
        <button className="button button-primary" disabled={signOff.isPending}>
          {signOff.isPending ? "Saving…" : "Sign off"}
        </button>
        {signOff.isError ? (
          <p className="form-error" role="alert">
            {describeApiError(signOff.error, "The sign-off could not be saved.")}
          </p>
        ) : null}
      </form>
    </section>
  );
}

type FeedbackEntry = InstructorAttemptReview["feedback"][number];

function FeedbackItem({ attemptId, item }: { attemptId: number; item: FeedbackEntry }) {
  const update = useUpdateInstructorFeedback(attemptId);
  const [editing, setEditing] = useState(false);
  const [observation, setObservation] = useState(item.observation ?? "");
  const [text, setText] = useState(item.feedback);

  if (editing) {
    return (
      <article>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate(
              { feedbackId: item.id, observation, feedback: text },
              { onSuccess: () => setEditing(false) },
            );
          }}
        >
          <label>
            Private note
            <textarea
              rows={2}
              maxLength={5000}
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
            />
          </label>
          <label>
            Feedback for the learner
            <textarea
              required
              rows={3}
              maxLength={5000}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button className="button button-primary" disabled={update.isPending}>
              Save changes
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article>
      <strong>{item.author_name}</strong>
      {item.observation ? (
        <p>
          <small>Private note:</small> {item.observation}
        </p>
      ) : null}
      <blockquote>{item.feedback}</blockquote>
      <small>
        {item.is_published
          ? `Shown to the learner${item.published_at ? ` since ${new Date(item.published_at).toLocaleString()}` : ""}`
          : "Draft: not shown to the learner"}
      </small>
      <div className="button-row">
        <button
          type="button"
          className="button button-secondary"
          disabled={update.isPending}
          onClick={() => update.mutate({ feedbackId: item.id, is_published: !item.is_published })}
        >
          {item.is_published ? "Withdraw from learner" : "Publish to learner"}
        </button>
        <button type="button" className="button button-secondary" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
      {update.isError ? (
        <p className="form-error" role="alert">
          {describeApiError(update.error, "The feedback could not be changed.")}
        </p>
      ) : null}
    </article>
  );
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
  const recommendation = data.recommendations?.[0];
  // Results are stored by step code; show them in the order the procedure is done.
  const stepOrder = new Map(data.procedure_steps.map((step, index) => [step.code, index]));
  const stepResults = [...data.step_results].sort(
    (left, right) =>
      (stepOrder.get(left.step_code) ?? Number.MAX_SAFE_INTEGER) -
      (stepOrder.get(right.step_code) ?? Number.MAX_SAFE_INTEGER),
  );

  function saveFeedback(publish: boolean) {
    submitFeedback.mutate(
      { observation, feedback, is_published: publish },
      {
        onSuccess: () => {
          setObservation("");
          setFeedback("");
        },
      },
    );
  }

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
          <span>
            {attemptStatusLabel(data.status)}
            {data.outcome && !["pending", "requires_review"].includes(data.outcome)
              ? ` · ${attemptOutcomeLabel(data.outcome)}`
              : ""}
          </span>
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
          <span>mistakes</span>
        </article>
        <article className={data.safety_errors ? "summary-alert" : ""}>
          <strong>{data.safety_errors}</strong>
          <span>safety errors</span>
        </article>
      </div>

      {data.status === "requires_review" ? <SignOffPanel data={data} /> : null}
      {data.review_decision ? (
        <section className="signoff-panel is-done" aria-label="Sign-off">
          <span className="eyebrow">Signed off</span>
          <h2>
            {data.review_decision === "competent" ? "Graded result accepted" : "Not yet competent"}
          </h2>
          <p>{data.review_note}</p>
          <small>
            {data.reviewed_by_name}
            {data.reviewed_at ? ` · ${new Date(data.reviewed_at).toLocaleString()}` : ""}
          </small>
        </section>
      ) : null}

      {data.step_results.length > 0 ? (
        <section className="timeline-panel">
          <div className="evidence-heading">
            <div>
              <h2>Graded steps</h2>
              <p>How each step was scored when the attempt was submitted.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="evidence-table">
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col">Result</th>
                  <th scope="col">Points</th>
                  <th scope="col">Tries</th>
                  <th scope="col">Hints</th>
                  <th scope="col">Safety</th>
                  <th scope="col">Measurement</th>
                </tr>
              </thead>
              <tbody>
                {stepResults.map((result) => (
                  <tr
                    key={result.step_code}
                    className={result.safety_violations ? "has-safety-error" : undefined}
                  >
                    <td>
                      <strong>{stepTitles.get(result.step_code) ?? result.step_code}</strong>
                    </td>
                    <td>{result.outcome.replaceAll("_", " ")}</td>
                    <td>
                      {Number(result.achieved_points)}/{Number(result.available_points)}
                    </td>
                    <td>{result.attempts_count}</td>
                    <td>{result.hints_used}</td>
                    <td>{result.safety_violations}</td>
                    <td>
                      {result.tolerance_passed === null
                        ? "—"
                        : result.tolerance_passed
                          ? "In range"
                          : "Out of range"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.competency_results.length > 0 ? (
            <ul className="result-competencies">
              {data.competency_results.map((result) => (
                <li key={result.competency_code} className={`mastery-${result.mastery_state}`}>
                  <span>{result.competency_code}</span>
                  <span>
                    {Math.round(Number(result.mastery_percentage))}% of {result.mastery_threshold}%
                    needed
                  </span>
                  <strong>
                    {MASTERY_LABELS[result.mastery_state] ??
                      result.mastery_state.replaceAll("_", " ")}
                  </strong>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="timeline-panel">
        <div className="evidence-heading">
          <div>
            <h2>Action timeline</h2>
            <p>Evidence in the order the server received it. It cannot be edited.</p>
          </div>
        </div>
        <ol className="attempt-timeline">
          {data.events.map((event) => {
            const isError = isMistake(event);
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

      {recommendation ? (
        <section className="feedback-panel">
          <div>
            <span className="eyebrow">Next step for the learner</span>
            <h2>Recommendation</h2>
            <p>{recommendation.rationale}</p>
            <p>
              The rules recommend{" "}
              <strong>{RECOMMENDATION_LABELS[recommendation.kind] ?? recommendation.kind}</strong>.
            </p>
            {recommendation.override_kind ? (
              <p role="status">
                Changed to{" "}
                {RECOMMENDATION_LABELS[recommendation.override_kind] ??
                  recommendation.override_kind}{" "}
                by {recommendation.overridden_by_name}: {recommendation.override_reason}
              </p>
            ) : null}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              overrideRecommendation.mutate(
                { kind: overrideKind, reason: overrideReason },
                { onSuccess: () => setOverrideReason("") },
              );
            }}
          >
            <label>
              Recommend instead
              <select
                value={overrideKind}
                onChange={(event) => setOverrideKind(event.target.value as typeof overrideKind)}
              >
                {Object.entries(RECOMMENDATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason (kept in the audit trail)
              <textarea
                required
                minLength={10}
                rows={3}
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
              />
            </label>
            <button className="button button-secondary" disabled={overrideRecommendation.isPending}>
              Change recommendation
            </button>
            {overrideRecommendation.isError ? (
              <p className="form-error" role="alert">
                {describeApiError(
                  overrideRecommendation.error,
                  "The recommendation could not be changed.",
                )}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}

      <section className="feedback-panel">
        <div>
          <span className="eyebrow">Instructor evidence</span>
          <h2>Notes and feedback</h2>
          <p>
            Private notes stay with instructors. Feedback is shown to the learner once you publish
            it, and they are emailed a link.
          </p>
        </div>
        {data.feedback?.map((item) => (
          <FeedbackItem key={item.id} attemptId={data.id} item={item} />
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveFeedback(true);
          }}
        >
          <label>
            Private note (not shown to the learner)
            <textarea
              value={observation}
              maxLength={5000}
              onChange={(event) => setObservation(event.target.value)}
              rows={3}
            />
          </label>
          <label>
            Feedback for the learner
            <textarea
              required
              maxLength={5000}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              rows={4}
            />
          </label>
          <div className="button-row">
            <button className="button button-primary" disabled={submitFeedback.isPending}>
              {submitFeedback.isPending ? "Saving…" : "Publish to learner"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={submitFeedback.isPending || !feedback.trim()}
              onClick={() => saveFeedback(false)}
            >
              Save as draft
            </button>
          </div>
          {submitFeedback.isError && (
            <p className="form-error" role="alert">
              {describeApiError(submitFeedback.error, "The feedback could not be saved.")}
            </p>
          )}
        </form>
      </section>
    </section>
  );
}
