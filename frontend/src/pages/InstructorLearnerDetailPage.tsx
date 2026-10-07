import { Link, useParams } from "react-router-dom";

import { MetricGrid, MetricTile } from "../components/ui/MetricTile";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { attemptStatusLabel, attemptOutcomeLabel } from "../learning/labels";
import { useInstructorLearner } from "../learning/useInstructor";

const MASTERY_LABELS: Record<string, string> = {
  mastered: "Mastered",
  developing: "Developing",
  not_demonstrated: "Not demonstrated",
  requires_review: "Requires review",
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export function InstructorLearnerDetailPage() {
  const learnerId = Number(useParams().learnerId);
  const detail = useInstructorLearner(learnerId);

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
                value={`${data.learner.completedAttempts}/${data.learner.assignments}`}
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
                    </tr>
                  </thead>
                  <tbody>
                    {data.assignments.map((assignment) => (
                      <tr key={assignment.id} className={assignment.isOverdue ? "is-overdue" : ""}>
                        <td>
                          <strong>{assignment.lessonTitle}</strong>
                          <small>
                            {assignment.courseTitle} · {assignment.trade}
                          </small>
                        </td>
                        <td>
                          <strong>{formatDate(assignment.dueAt)}</strong>
                          {assignment.isOverdue ? <small className="overdue">Overdue</small> : null}
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
                      </tr>
                    ))}
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
