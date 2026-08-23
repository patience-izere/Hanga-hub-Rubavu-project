import { useState } from "react";
import { Link } from "react-router-dom";

import { attemptStatusLabel } from "../learning/labels";
import {
  useCreateInstructorAssignments,
  useInstructorAssignmentOptions,
  useInstructorOverview,
} from "../learning/useInstructor";

export function InstructorDashboardPage() {
  const overview = useInstructorOverview();
  const options = useInstructorAssignmentOptions();
  const createAssignments = useCreateInstructorAssignments();
  const [scenarioId, setScenarioId] = useState(0);
  const [learnerIds, setLearnerIds] = useState<number[]>([]);
  const [cohortIds, setCohortIds] = useState<number[]>([]);
  const [dueAt, setDueAt] = useState("");
  const [availableAt, setAvailableAt] = useState("");
  const [attemptLimit, setAttemptLimit] = useState(3);
  const [attemptFilter, setAttemptFilter] = useState("all");
  const visibleAttempts = (overview.data?.attempts ?? []).filter((attempt) => {
    if (attemptFilter === "safety") return attempt.safety_errors > 0;
    if (attemptFilter === "review") return attempt.status === "requires_review";
    if (attemptFilter === "in_progress") return attempt.status === "in_progress";
    if (attemptFilter === "completed") return attempt.status === "completed";
    if (attemptFilter === "overdue") return attempt.is_overdue;
    if (attemptFilter === "blocked") return attempt.is_blocked;
    if (attemptFilter === "failed") return attempt.outcome === "failed";
    return true;
  });

  return (
    <section className="dashboard instructor-dashboard">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">Instructor evidence</div>
          <h1>Workshop progress at a glance.</h1>
          <p>
            Review completion, procedural mistakes, and safety signals for learners in your school.
          </p>
        </div>
      </div>

      {options.data && (
        <section className="assignment-builder">
          <div>
            <span className="eyebrow">Assign practical learning</span>
            <h2>Create an evidence-ready assignment</h2>
            <p>
              Select a published scenario and learners from your school. Existing assignments are
              preserved.
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createAssignments.mutate({
                scenarioId,
                learnerIds,
                cohortIds,
                availableAt: availableAt ? new Date(availableAt).toISOString() : null,
                dueAt: dueAt ? new Date(dueAt).toISOString() : null,
                attemptLimit,
                instructions:
                  "Complete the pre-lesson check and follow the approved safety procedure.",
              });
            }}
          >
            <label>
              Published lesson
              <select
                required
                value={scenarioId || ""}
                onChange={(event) => setScenarioId(Number(event.target.value))}
              >
                <option value="">Choose a lesson</option>
                {options.data.scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.lessonTitle} · v{scenario.version}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Cohorts</legend>
              {(options.data.cohorts ?? []).map((cohort) => (
                <label key={cohort.id}>
                  <input
                    type="checkbox"
                    checked={cohortIds.includes(cohort.id)}
                    onChange={(event) =>
                      setCohortIds((current) =>
                        event.target.checked
                          ? [...current, cohort.id]
                          : current.filter((id) => id !== cohort.id),
                      )
                    }
                  />
                  {cohort.name} <small>{cohort.learnerCount} active learner(s)</small>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Learners</legend>
              {options.data.learners.map((learner) => (
                <label key={learner.id}>
                  <input
                    type="checkbox"
                    checked={learnerIds.includes(learner.id)}
                    onChange={(event) =>
                      setLearnerIds((current) =>
                        event.target.checked
                          ? [...current, learner.id]
                          : current.filter((id) => id !== learner.id),
                      )
                    }
                  />
                  {learner.name} <small>{learner.email}</small>
                </label>
              ))}
            </fieldset>
            <label>
              Available from
              <input
                type="datetime-local"
                value={availableAt}
                onChange={(event) => setAvailableAt(event.target.value)}
              />
            </label>
            <label>
              Due date
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </label>
            <label>
              Attempt limit
              <input
                type="number"
                min={1}
                max={20}
                value={attemptLimit}
                onChange={(event) => setAttemptLimit(Number(event.target.value))}
              />
            </label>
            <button
              className="button button-primary"
              disabled={
                !scenarioId ||
                (!learnerIds.length && !cohortIds.length) ||
                createAssignments.isPending
              }
            >
              {createAssignments.isPending ? "Assigning…" : "Create assignments"}
            </button>
            {createAssignments.data && (
              <p role="status">
                Created {createAssignments.data.created}; already assigned{" "}
                {createAssignments.data.existing}.
              </p>
            )}
          </form>
        </section>
      )}

      {overview.isPending && <p className="panel-status">Loading school evidence…</p>}
      {overview.isError && (
        <p className="panel-status form-error" role="alert">
          School evidence could not be loaded.
        </p>
      )}
      {overview.data && (
        <>
          <div className="metric-grid">
            <article>
              <span>Learners assigned</span>
              <strong>{overview.data.metrics.learners}</strong>
            </article>
            <article>
              <span>Active attempts</span>
              <strong>{overview.data.metrics.inProgressAttempts}</strong>
            </article>
            <article>
              <span>Completed attempts</span>
              <strong>{overview.data.metrics.completedAttempts}</strong>
            </article>
            <article className={overview.data.metrics.safetyErrors ? "metric-alert" : ""}>
              <span>Safety errors</span>
              <strong>{overview.data.metrics.safetyErrors}</strong>
            </article>
          </div>
          {overview.data.operationalAnalytics ? (
            <section className="lesson-panel" aria-labelledby="operational-analytics-title">
              <span className="eyebrow">Separated operational evidence</span>
              <h2 id="operational-analytics-title">Learning, AR, device, sync, and fallback</h2>
              <div className="metric-grid">
                <article>
                  <span>Learning outcomes</span>
                  <strong>{overview.data.operationalAnalytics.learning.masteredAttempts}</strong>
                  <small>
                    mastered · {overview.data.operationalAnalytics.learning.failedAttempts} failed
                  </small>
                </article>
                <article>
                  <span>AR recognition</span>
                  <strong>{overview.data.operationalAnalytics.recognition.markerFound}</strong>
                  <small>
                    found · {overview.data.operationalAnalytics.recognition.trackingLoss} tracking
                    losses · {overview.data.operationalAnalytics.recognition.markerMismatch}
                    mismatches
                  </small>
                </article>
                <article>
                  <span>Device reliability</span>
                  <strong>
                    {overview.data.operationalAnalytics.deviceReliability.assetFailures}
                  </strong>
                  <small>
                    asset failures ·{" "}
                    {overview.data.operationalAnalytics.deviceReliability.lowFrameRateSamples}{" "}
                    low-FPS samples
                  </small>
                </article>
                <article>
                  <span>Synchronization</span>
                  <strong>{overview.data.operationalAnalytics.synchronization.xapiPending}</strong>
                  <small>
                    xAPI pending ·{" "}
                    {overview.data.operationalAnalytics.synchronization.xapiDeadLetters} dead-letter
                  </small>
                </article>
                <article>
                  <span>Fallback use</span>
                  <strong>{overview.data.operationalAnalytics.fallback.accessibleAttempts}</strong>
                  <small>
                    accessible attempts ·{" "}
                    {overview.data.operationalAnalytics.fallback.arFallbackEvents}
                    AR fallback events
                  </small>
                </article>
              </div>
            </section>
          ) : null}

          <div className="evidence-heading">
            <div>
              <h2>Attempt evidence</h2>
              <p>Most recently updated attempts appear first.</p>
            </div>
            <div>
              <span>{overview.data.metrics.assignments} assignments</span>
              <a className="table-link" href="/api/v1/instructor/evidence.csv">
                Operational CSV
              </a>
              <a className="table-link" href="/api/v1/instructor/evidence.csv?scope=research">
                Pseudonymized research CSV
              </a>
              <label>
                Filter attempts
                <select
                  value={attemptFilter}
                  onChange={(event) => setAttemptFilter(event.target.value)}
                >
                  <option value="all">All attempts</option>
                  <option value="safety">Safety attention</option>
                  <option value="review">Requires review</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="overdue">Overdue</option>
                  <option value="blocked">Blocked</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
            </div>
          </div>
          {visibleAttempts.length === 0 ? (
            <div className="empty-learning-state">
              <h2>No matching attempt evidence</h2>
              <p>Change the filter or wait for assigned learners to begin practical lessons.</p>
            </div>
          ) : (
            <div className="evidence-table-wrap">
              <table className="evidence-table">
                <thead>
                  <tr>
                    <th>Learner</th>
                    <th>Lesson</th>
                    <th>Progress</th>
                    <th>Errors</th>
                    <th>Result</th>
                    <th>
                      <span className="sr-only">Review</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAttempts.map((attempt) => (
                    <tr
                      key={attempt.id}
                      className={attempt.safety_errors ? "has-safety-error" : ""}
                    >
                      <td>
                        <strong>{attempt.learner.name}</strong>
                        <small>{attempt.learner.email}</small>
                      </td>
                      <td>
                        <strong>{attempt.lesson.title}</strong>
                        <small>{attempt.lesson.trade}</small>
                      </td>
                      <td>
                        <strong>
                          {attempt.completed_steps}/{attempt.total_steps}
                        </strong>
                        <small>{attemptStatusLabel(attempt.status)}</small>
                      </td>
                      <td>
                        <strong>{attempt.incorrect_actions}</strong>
                        <small>{attempt.safety_errors} safety</small>
                      </td>
                      <td>
                        {attempt.score ? (
                          <strong>{Number(attempt.score)}%</strong>
                        ) : (
                          <span>Pending</span>
                        )}
                      </td>
                      <td>
                        <Link className="table-link" to={`/teach/attempts/${attempt.id}`}>
                          Review evidence
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(overview.data.competencies ?? []).length ? (
            <section className="lesson-panel">
              <h2>Competency aggregation</h2>
              <ul>
                {(overview.data.competencies ?? []).map((competency) => (
                  <li key={String(competency.code)}>
                    <strong>{String(competency.code)}</strong> · {String(competency.mastered)} of{" "}
                    {String(competency.attempts)} mastered · {String(competency.requiresReview)}
                    requiring review
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
