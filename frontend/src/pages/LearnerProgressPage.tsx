import { Link } from "react-router-dom";

import { MetricGrid, MetricTile } from "../components/ui/MetricTile";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { attemptOutcomeLabel, attemptStatusLabel } from "../learning/labels";
import { competencyProfile } from "../learning/progress";
import { useAttempts } from "../learning/useAssignments";

const MASTERY_LABELS: Record<string, string> = {
  mastered: "Mastered",
  developing: "Developing",
  not_demonstrated: "Not demonstrated",
  requires_review: "Requires review",
};

export function LearnerProgressPage() {
  const attempts = useAttempts();

  return (
    <section className="dashboard progress-page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">My progress</span>
          <h1>Everything you have practised.</h1>
          <p>
            Your competency profile takes the most recent result for each competency across all
            attempts.
          </p>
        </div>
      </div>

      <QueryBoundary
        query={attempts}
        loading="Loading your attempts…"
        error="Your attempts could not be loaded."
        empty={{
          title: "No attempts yet",
          description: "Open an assigned lesson to make your first attempt.",
          symbol: "⚙",
        }}
      >
        {(items) => {
          const completed = items.filter((attempt) => attempt.status === "completed");
          const scores = completed
            .map((attempt) => Number(attempt.score))
            .filter((score) => Number.isFinite(score));
          const average = scores.length
            ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
            : null;
          const profile = competencyProfile(items);
          const mastered = profile.filter((item) => item.mastery_state === "mastered").length;

          return (
            <>
              <MetricGrid>
                <MetricTile label="Attempts made" value={items.length} />
                <MetricTile label="Completed" value={completed.length} />
                <MetricTile label="Average score" value={average === null ? "—" : `${average}%`} />
                <MetricTile
                  label="Competencies mastered"
                  value={profile.length === 0 ? "—" : `${mastered}/${profile.length}`}
                />
              </MetricGrid>

              <h2 className="section-title">Competency profile</h2>
              {profile.length === 0 ? (
                <p className="field-note">
                  Competency results appear once you complete an attempt.
                </p>
              ) : (
                <ul className="learner-competencies">
                  {profile.map((result) => (
                    <li key={result.competency_code} className={`mastery-${result.mastery_state}`}>
                      <div>
                        <span className="competency-code">{result.competency_code}</span>
                      </div>
                      <span className="mastery-state">
                        {MASTERY_LABELS[result.mastery_state] ??
                          result.mastery_state.replaceAll("_", " ")}
                        <small>
                          {Math.round(Number(result.mastery_percentage))}% of{" "}
                          {result.mastery_threshold}% needed
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="section-title">Attempt history</h2>
              <div className="evidence-table-wrap">
                <table className="evidence-table">
                  <thead>
                    <tr>
                      <th>Lesson</th>
                      <th>Started</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((attempt) => (
                      <tr key={attempt.id}>
                        <td>
                          <strong>{attempt.assignment.lesson.title}</strong>
                          <small>{attempt.assignment.lesson.course_title}</small>
                        </td>
                        <td>
                          <strong>{new Date(attempt.started_at).toLocaleDateString()}</strong>
                        </td>
                        <td>
                          <strong>{attemptStatusLabel(attempt.status)}</strong>
                          <small>{attemptOutcomeLabel(attempt.outcome)}</small>
                        </td>
                        <td>
                          <strong>
                            {attempt.score === null ? "—" : `${Math.round(Number(attempt.score))}%`}
                          </strong>
                        </td>
                        <td>
                          <Link
                            className="table-link"
                            to={
                              attempt.status === "in_progress"
                                ? `/attempts/${attempt.id}`
                                : `/learn/attempts/${attempt.id}`
                            }
                          >
                            {attempt.status === "in_progress" ? "Resume" : "View result"}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
