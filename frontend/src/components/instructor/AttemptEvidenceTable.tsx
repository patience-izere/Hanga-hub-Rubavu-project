import { Link } from "react-router-dom";

import type { InstructorAttemptEvidence } from "../../api/instructor";
import { attemptStatusLabel } from "../../learning/labels";
import { EmptyState } from "../ui/EmptyState";

export function AttemptEvidenceTable({ attempts }: { attempts: InstructorAttemptEvidence[] }) {
  if (attempts.length === 0) {
    return (
      <EmptyState
        title="No matching attempt evidence"
        description="Change the filter or wait for assigned learners to begin practical lessons."
      />
    );
  }

  return (
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
          {attempts.map((attempt) => (
            <tr key={attempt.id} className={attempt.safety_errors ? "has-safety-error" : ""}>
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
                {attempt.score ? <strong>{Number(attempt.score)}%</strong> : <span>Pending</span>}
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
  );
}
