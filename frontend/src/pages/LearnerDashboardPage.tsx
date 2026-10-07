import { Link } from "react-router-dom";

import type { Assignment } from "../api/learning";
import { useCurrentUser } from "../auth/useAuth";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { StatusPill } from "../components/ui/StatusPill";
import {
  attemptsUsed,
  dueRelative,
  dueState,
  formatDue,
  groupAssignments,
  hasAttemptsLeft,
} from "../learning/progress";
import { useAssignments } from "../learning/useAssignments";

function AssignmentCard({ assignment }: { assignment: Assignment }) {
  const state = dueState(assignment);
  const used = attemptsUsed(assignment);
  const inProgress = assignment.latest_attempt?.status === "in_progress";
  const exhausted = !hasAttemptsLeft(assignment);

  return (
    <article className={`assignment-card${state === "overdue" ? " is-overdue" : ""}`}>
      <div className="assignment-meta">
        <span>{assignment.lesson.trade}</span>
        <StatusPill status={assignment.latest_attempt?.status} />
      </div>
      <h3>{assignment.lesson.title}</h3>
      <p>{assignment.lesson.summary}</p>

      {assignment.due_at ? (
        <p className={`assignment-due due-${state}`}>
          <strong>{state === "overdue" ? "Overdue" : "Due"}</strong> {formatDue(assignment.due_at)}
          <small>{dueRelative(assignment.due_at)}</small>
        </p>
      ) : null}

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
          <dt>Attempts</dt>
          <dd>
            {used}/{assignment.attempt_limit}
          </dd>
        </div>
      </dl>

      <Link className="button button-primary" to={`/assignments/${assignment.id}`}>
        {inProgress ? "Continue lesson" : exhausted ? "Review lesson" : "Open lesson"}
      </Link>
    </article>
  );
}

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
        {(items) => {
          const resume = items.find(
            (assignment) => assignment.latest_attempt?.status === "in_progress",
          );

          return (
            <>
              {resume ? (
                <section className="resume-band">
                  <div>
                    <span className="eyebrow">Continue where you left off</span>
                    <h2>{resume.lesson.title}</h2>
                    <p>
                      Attempt {resume.latest_attempt?.id} is saved.{" "}
                      {resume.latest_attempt?.resume_state?.completedSteps?.length ?? 0} step(s)
                      already evidenced.
                    </p>
                  </div>
                  <Link
                    className="button button-primary"
                    to={`/attempts/${resume.latest_attempt?.id}`}
                  >
                    Resume attempt
                  </Link>
                </section>
              ) : null}

              {groupAssignments(items).map((group) => (
                <section className="assignment-group" key={group.key}>
                  <div className="assignment-group-heading">
                    <h2>{group.title}</h2>
                    <p>{group.description}</p>
                  </div>
                  <div className="assignment-grid">
                    {group.assignments.map((assignment) => (
                      <AssignmentCard key={assignment.id} assignment={assignment} />
                    ))}
                  </div>
                </section>
              ))}
            </>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
