import { Link, useNavigate, useParams } from "react-router-dom";

import { useAssignment, useStartAssignment } from "../learning/useAssignments";

export function AssignmentPage() {
  const assignmentId = Number(useParams().assignmentId);
  const navigate = useNavigate();
  const assignment = useAssignment(assignmentId);
  const start = useStartAssignment(assignmentId);

  if (assignment.isPending) {
    return <p className="panel-status">Loading lesson…</p>;
  }
  if (assignment.isError || !assignment.data) {
    return (
      <section className="lesson-page">
        <p className="form-error" role="alert">
          This assignment is unavailable.
        </p>
        <Link to="/dashboard">Return to my learning</Link>
      </section>
    );
  }

  const { lesson, latest_attempt: latestAttempt } = assignment.data;
  const activeAttempt = start.data || latestAttempt;

  return (
    <section className="lesson-page">
      <Link className="back-link" to="/dashboard">
        ← My learning
      </Link>
      <div className="lesson-header">
        <div>
          <div className="eyebrow">
            {lesson.trade} · {lesson.course_title}
          </div>
          <h1>{lesson.title}</h1>
          <p>{lesson.summary}</p>
        </div>
        <div className="lesson-duration">
          <strong>{lesson.estimated_minutes}</strong>
          <span>minutes</span>
        </div>
      </div>
      <div className="lesson-content-grid">
        <article className="lesson-panel">
          <h2>Learning objectives</h2>
          <ol>
            {lesson.objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ol>
        </article>
        <article className="lesson-panel safety-panel">
          <h2>Safety before action</h2>
          <ul>
            {lesson.safety_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </article>
      </div>
      <article className="competency-panel">
        <h2>Competencies assessed</h2>
        {lesson.competencies.map((competency) => (
          <div className="competency-row" key={competency.id}>
            <span>{competency.code}</span>
            <div>
              <strong>{competency.title}</strong>
              <p>{competency.description}</p>
            </div>
            <small>{competency.mastery_threshold}% mastery</small>
          </div>
        ))}
      </article>
      <div className="lesson-launch">
        <div>
          <h2>
            {activeAttempt?.status === "in_progress" ? "Attempt ready" : "Ready to practise?"}
          </h2>
          <p>
            {activeAttempt?.status === "in_progress"
              ? `Attempt ${activeAttempt.id} is saved and ready for the 3D procedure workspace.`
              : "Starting creates a resumable learning attempt before the simulation opens."}
          </p>
        </div>
        {activeAttempt?.status === "in_progress" ? (
          <Link className="button button-primary" to={`/attempts/${activeAttempt.id}`}>
            {activeAttempt.resume_state?.completedSteps?.length
              ? "Resume simulation"
              : "Open simulation"}
          </Link>
        ) : (
          <button
            className="button button-primary"
            onClick={() =>
              start.mutate(undefined, {
                onSuccess: (attempt) => navigate(`/attempts/${attempt.id}`),
              })
            }
            disabled={start.isPending}
          >
            {start.isPending ? "Starting…" : "Start learning attempt"}
          </button>
        )}
      </div>
    </section>
  );
}
