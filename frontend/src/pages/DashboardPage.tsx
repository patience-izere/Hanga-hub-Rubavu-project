import { Link } from "react-router-dom";

import type { User } from "../api/client";
import { useAssignments } from "../learning/useAssignments";
import { InstructorDashboardPage } from "./InstructorDashboardPage";

function attemptLabel(status: string | undefined) {
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  if (status === "requires_review") return "Instructor review";
  return "Not started";
}

function LearnerDashboardPage({ user }: { user: User }) {
  const displayName = user.firstName || user.email;
  const assignments = useAssignments();

  return (
    <section className="dashboard">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">My learning</div>
          <h1>Good to see you, {displayName}.</h1>
          <p>Continue an assigned competency lesson or prepare for your next workshop task.</p>
        </div>
        <div className="profile-chip">
          <span>{displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{displayName}</strong>
            <small>{user.organization || "OPedu learner"}</small>
          </div>
        </div>
      </div>

      {assignments.isPending ? <p className="panel-status">Loading assignments…</p> : null}
      {assignments.isError ? (
        <p className="panel-status form-error" role="alert">
          Assignments could not be loaded.
        </p>
      ) : null}
      {assignments.data?.length === 0 ? (
        <div className="empty-learning-state">
          <div className="machine-symbol" aria-hidden="true">
            ⚙
          </div>
          <h2>No lessons assigned yet</h2>
          <p>Your instructor’s assignments will appear here.</p>
        </div>
      ) : null}
      {assignments.data && assignments.data.length > 0 ? (
        <div className="assignment-grid">
          {assignments.data.map((assignment) => (
            <article className="assignment-card" key={assignment.id}>
              <div className="assignment-meta">
                <span>{assignment.lesson.trade}</span>
                <span className={`status status-${assignment.latest_attempt?.status || "new"}`}>
                  {attemptLabel(assignment.latest_attempt?.status)}
                </span>
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
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function DashboardPage({ user }: { user: User }) {
  const canReviewEvidence = user.roles.some(
    (role) => role === "platform_admin" || role === "instructor" || role === "admin",
  );
  return canReviewEvidence ? (
    <InstructorDashboardPage user={user} />
  ) : (
    <LearnerDashboardPage user={user} />
  );
}
