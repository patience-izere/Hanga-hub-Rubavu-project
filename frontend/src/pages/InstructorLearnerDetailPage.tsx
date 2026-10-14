import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { describeApiError } from "../api/client";
import type { InstructorLearnerAssignment } from "../api/instructor";
import { MetricGrid, MetricTile } from "../components/ui/MetricTile";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { attemptStatusLabel, attemptOutcomeLabel } from "../learning/labels";
import { useInstructorLearner, useUpdateInstructorAssignment } from "../learning/useInstructor";

const MASTERY_LABELS: Record<string, string> = {
  mastered: "Mastered",
  developing: "Developing",
  not_demonstrated: "Not demonstrated",
  requires_review: "Requires review",
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}

/** `datetime-local` wants local wall-clock time without a zone. */
function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function AssignmentEditor({
  learnerId,
  assignment,
  onDone,
}: {
  learnerId: number;
  assignment: InstructorLearnerAssignment;
  onDone: () => void;
}) {
  const update = useUpdateInstructorAssignment(learnerId);
  const [dueAt, setDueAt] = useState(toLocalInput(assignment.dueAt));
  const [attemptLimit, setAttemptLimit] = useState(assignment.attemptLimit);

  return (
    <form
      className="assignment-editor"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate(
          {
            id: assignment.id,
            changes: {
              dueAt: dueAt ? new Date(dueAt).toISOString() : null,
              attemptLimit,
            },
          },
          { onSuccess: onDone },
        );
      }}
    >
      <label>
        Due date
        <input
          type="datetime-local"
          value={dueAt}
          min={toLocalInput(new Date().toISOString())}
          onChange={(event) => setDueAt(event.target.value)}
        />
      </label>
      <label>
        Attempts allowed
        <input
          type="number"
          min={Math.max(1, assignment.attemptsUsed)}
          max={20}
          value={attemptLimit}
          onChange={(event) => setAttemptLimit(Number(event.target.value))}
        />
        <small>{assignment.attemptsUsed} used so far</small>
      </label>
      <div className="button-row">
        <button className="button button-primary" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="button button-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
      {update.isError ? (
        <p className="form-error" role="alert">
          {describeApiError(update.error, "The assignment could not be changed.")}
        </p>
      ) : null}
    </form>
  );
}

export function InstructorLearnerDetailPage() {
  const learnerId = Number(useParams().learnerId);
  const detail = useInstructorLearner(learnerId);
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <section className="dashboard learner-detail-page">
      <Link className="back-link" to="/teach/learners">
        &larr; School roster
      </Link>

      <QueryBoundary
        query={detail}
        loading="Loading this learner…"
        error="This learner is not in your school, or could not be loaded."
      >
        {(data) => (
          <>
            <div className="dashboard-heading">
              <div>
                <span className="eyebrow">
                  {data.learner.school}
                  {data.learner.cohorts.length > 0 ? ` · ${data.learner.cohorts.join(", ")}` : ""}
                </span>
                <h1>{data.learner.name}</h1>
                <p>{data.learner.email}</p>
              </div>
            </div>

            <MetricGrid>
              <MetricTile
                label="Assignments completed"
                value={`${data.learner.completedAssignments}/${data.learner.assignments}`}
              />
              <MetricTile label="Attempts made" value={data.learner.attempts} />
              <MetricTile
                label="Average score"
                value={
                  data.learner.averageScore === null
                    ? "—"
                    : `${Math.round(Number(data.learner.averageScore))}%`
                }
              />
              <MetricTile
                label="Safety errors"
                value={data.learner.safetyErrors}
                alert={data.learner.safetyErrors > 0}
              />
            </MetricGrid>

            <h2 className="section-title">Competency profile</h2>
            {data.competencies.length === 0 ? (
              <p className="field-note">
                No competency results yet. These appear when an attempt is completed.
              </p>
            ) : (
              <ul className="learner-competencies">
                {data.competencies.map((competency) => (
                  <li key={competency.code} className={`mastery-${competency.masteryState}`}>
                    <div>
                      <span className="competency-code">{competency.code}</span>
                      <strong>{competency.title}</strong>
                    </div>
                    <span className="mastery-state">
                      {MASTERY_LABELS[competency.masteryState] ?? competency.masteryState}
                      <small>{Math.round(Number(competency.masteryPercentage))}%</small>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="section-title">Assignments</h2>
            {data.assignments.length === 0 ? (
              <p className="field-note">This learner has no assignments yet.</p>
            ) : (
              <div className="evidence-table-wrap">
                <table className="evidence-table">
                  <thead>
                    <tr>
                      <th>Lesson</th>
                      <th>Due</th>
                      <th>Attempts</th>
                      <th>Latest</th>
                      <th>
                        <span className="sr-only">Change</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.assignments.map((assignment) =>
                      editingId === assignment.id ? (
                        <tr key={assignment.id}>
                          <td colSpan={5}>
                            <strong>{assignment.lessonTitle}</strong>
                            <AssignmentEditor
                              learnerId={learnerId}
                              assignment={assignment}
                              onDone={() => setEditingId(null)}
                            />
                          </td>
                        </tr>
                      ) : (
                        <tr
                          key={assignment.id}
                          className={assignment.isOverdue ? "is-overdue" : ""}
                        >
                          <td>
                            <strong>{assignment.lessonTitle}</strong>
                            <small>
                              {assignment.courseTitle} · {assignment.trade}
                            </small>
                          </td>
                          <td>
                            <strong>{formatDate(assignment.dueAt)}</strong>
                            {assignment.isOverdue ? (
                              <small className="overdue">Overdue</small>
                            ) : null}
                          </td>
                          <td>
                            <strong>
                              {assignment.attemptsUsed}/{assignment.attemptLimit}
                            </strong>
                          </td>
                          <td>
                            <strong>
                              {assignment.latestScore
                                ? `${Math.round(Number(assignment.latestScore))}%`
                                : "—"}
                            </strong>
                            <small>
                              {assignment.latestStatus
                                ? attemptStatusLabel(assignment.latestStatus)
                                : "Not started"}
                            </small>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="button-link"
                              onClick={() => setEditingId(assignment.id)}
                              aria-label={`Change deadline or attempts for ${assignment.lessonTitle}`}
                            >
                              Change
                            </button>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="section-title">Attempt history</h2>
            {data.attempts.length === 0 ? (
              <p className="field-note">This learner has not started an attempt yet.</p>
            ) : (
              <ol className="learner-attempts">
                {data.attempts.map((attempt) => (
                  <li key={attempt.id}>
                    <div>
                      <strong>{attempt.lessonTitle}</strong>
                      <small>
                        {new Date(attempt.startedAt).toLocaleString()} ·{" "}
                        {attemptStatusLabel(attempt.status)}
                      </small>
                    </div>
                    <div className="learner-attempt-stats">
                      <span>
                        {attempt.completedSteps}/{attempt.totalSteps} steps
                      </span>
                      {attempt.safetyErrors > 0 ? (
                        <span className="safety-badge">{attempt.safetyErrors} safety</span>
                      ) : null}
                      <span>
                        {attempt.score ? `${Math.round(Number(attempt.score))}%` : "Pending"}
                        <small>{attemptOutcomeLabel(attempt.outcome)}</small>
                      </span>
                      <Link className="table-link" to={`/teach/attempts/${attempt.id}`}>
                        Review evidence
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
