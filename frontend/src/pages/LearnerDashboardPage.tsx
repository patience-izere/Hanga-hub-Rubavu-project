import { Link } from "react-router-dom";

import { useCurrentUser } from "../auth/useAuth";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { StatusPill } from "../components/ui/StatusPill";
import { assignmentStatusLabel } from "../learning/labels";
import { useAssignments } from "../learning/useAssignments";

export function LearnerDashboardPage() {
  const user = useCurrentUser().data;
  const displayName = user?.firstName || user?.email || "learner";
  const assignments = useAssignments();

  return (
    <section className="dashboard">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">My learning</div>
          <h1>Good to see you, {displayName}.</h1>
          <p>Continue an assigned competency lesson or prepare for your next workshop task.</p>
        </div>
      </div>

      <QueryBoundary
        query={assignments}
        loading="Loading assignments…"
        error="Assignments could not be loaded."
        empty={{
          title: "No lessons assigned yet",
          description: "Your instructor’s assignments will appear here.",
          symbol: "⚙",
        }}
      >
        {(items) => (
          <div className="assignment-grid">
            {items.map((assignment) => (
              <article className="assignment-card" key={assignment.id}>
                <div className="assignment-meta">
                  <span>{assignment.lesson.trade}</span>
                  <StatusPill status={assignment.latest_attempt?.status} />
                </div>
                <h2>{assignment.lesson.title}</h2>
                <p>{assignment.lesson.summary}</p>
                <dl>
                  <div>
                    <dt>Course</dt>
                    <dd>{assignment.lesson.course_title}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{assignment.lesson.estimated_minutes} minutes</dd>
                  </div>
                  <div>
                    <dt>Competencies</dt>
                    <dd>{assignment.lesson.competencies.length}</dd>
                  </div>
                </dl>
                <Link className="button button-primary" to={`/assignments/${assignment.id}`}>
                  {assignment.latest_attempt?.status === "in_progress"
                    ? "Continue lesson"
                    : "Open lesson"}
                </Link>
                {(assignment.attempt_history ?? []).length ? (
                  <details className="attempt-history">
                    <summary>
                      Attempt history ({assignment.attempt_history.length}/
                      {assignment.attempt_limit})
                    </summary>
                    <ol>
                      {assignment.attempt_history.map((attempt) => (
                        <li key={attempt.id}>
                          <Link to={`/attempts/${attempt.id}`}>
                            {new Date(attempt.started_at).toLocaleDateString()} ·{" "}
                            {attempt.score
                              ? `${Number(attempt.score)}%`
                              : assignmentStatusLabel(attempt.status)}
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </QueryBoundary>
    </section>
  );
}
