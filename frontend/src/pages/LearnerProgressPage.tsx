import { Link } from "react-router-dom";

import { MetricGrid, MetricTile } from "../components/ui/MetricTile";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { attemptOutcomeLabel, attemptStatusLabel } from "../learning/labels";
import { competencyProfile, practiceStreak } from "../learning/progress";
import { useAttempts } from "../learning/useAssignments";
import "../styles/engagement.css";

const MASTERY_LABELS: Record<string, string> = {
  mastered: "Mastered",
  developing: "Still developing",
  not_demonstrated: "Not shown yet",
  requires_review: "Waiting for review",
};

export function LearnerProgressPage() {
  const attempts = useAttempts();

  return (
    <section className="dashboard progress-page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">My progress</span>
          <h1>Your skills passport.</h1>
          <p>
            Each skill shows your most recent assessed result. Practice runs help you improve but
            are not counted here.
          </p>
        </div>
      </div>

      <QueryBoundary
        query={attempts}
        loading="Loading your attempts…"
        error="Your attempts could not be loaded."
        empty={{
          title: "No attempts yet",
          description: "Open a lesson to make your first attempt.",
          symbol: "⚙",
        }}
      >
        {(items) => {
          const assessed = items.filter((attempt) => !attempt.is_practice);
          const completed = assessed.filter((attempt) => attempt.status === "completed");
          const scores = completed
            .map((attempt) => Number(attempt.score))
            .filter((score) => Number.isFinite(score));
          const average = scores.length
            ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
            : null;
          const profile = competencyProfile(assessed);
          const mastered = profile.filter((item) => item.mastery_state === "mastered").length;
          const titles = new Map(
            items.flatMap((attempt) =>
              attempt.assignment.lesson.competencies.map((item) => [item.code, item.title]),
            ),
          );
          const streak = practiceStreak(items.map((attempt) => attempt.started_at));

          return (
            <>
              <MetricGrid>
                <MetricTile label="Days in a row" value={streak} />
                <MetricTile label="Practice runs" value={items.length - assessed.length} />
                <MetricTile label="Average score" value={average === null ? "—" : `${average}%`} />
                <MetricTile
                  label="Skills mastered"
                  value={profile.length === 0 ? "—" : `${mastered}/${profile.length}`}
                />
              </MetricGrid>

              <h2 className="section-title">Skills</h2>
              {profile.length === 0 ? (
                <p className="field-note">
                  Your skills appear once you finish an assessed attempt.
                </p>
              ) : (
                <ul className="learner-competencies">
                  {profile.map((result) => (
                    <li key={result.competency_code} className={`mastery-${result.mastery_state}`}>
                      <div>
                        <strong>
                          {titles.get(result.competency_code) ?? result.competency_code}
                        </strong>
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

              <h2 className="section-title">History</h2>
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
                          <small>
                            {attempt.is_practice ? "Practice · " : ""}
                            {attempt.assignment.lesson.course_title}
                          </small>
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
