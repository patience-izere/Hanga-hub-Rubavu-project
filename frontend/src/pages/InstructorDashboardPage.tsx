import { Link } from "react-router-dom";

import type { User } from "../api/client";
import { useInstructorOverview } from "../learning/useInstructor";

function statusLabel(status: string) {
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  return "Requires review";
}

export function InstructorDashboardPage({ user }: { user: User }) {
  const overview = useInstructorOverview();
  const displayName = user.firstName || user.email;

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
        <div className="profile-chip">
          <span>{displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{displayName}</strong>
            <small>{user.organization || "OPedu instructor"}</small>
          </div>
        </div>
      </div>
      {user.roles.some((role) => role === "platform_admin" || role === "admin") && (
        <Link className="button button-secondary school-admin-link" to="/school/admin">
          Manage school access
        </Link>
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

          <div className="evidence-heading">
            <div>
              <h2>Attempt evidence</h2>
              <p>Most recently updated attempts appear first.</p>
            </div>
            <span>{overview.data.metrics.assignments} assignments</span>
          </div>
          {overview.data.attempts.length === 0 ? (
            <div className="empty-learning-state">
              <h2>No attempt evidence yet</h2>
              <p>Evidence will appear after an assigned learner starts a practical lesson.</p>
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
                  {overview.data.attempts.map((attempt) => (
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
                        <small>{statusLabel(attempt.status)}</small>
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
                        <Link className="table-link" to={`/instructor/attempts/${attempt.id}`}>
                          Review evidence
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
