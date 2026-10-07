import { useState } from "react";
import { Link } from "react-router-dom";

import type { InstructorAttemptEvidence } from "../api/instructor";
import { AttemptEvidenceTable } from "../components/instructor/AttemptEvidenceTable";
import { MetricGrid, MetricTile } from "../components/ui/MetricTile";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { useInstructorOverview } from "../learning/useInstructor";

type Filter =
  "all" | "safety" | "review" | "in_progress" | "completed" | "overdue" | "blocked" | "failed";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All attempts" },
  { value: "safety", label: "Safety attention" },
  { value: "review", label: "Requires review" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
  { value: "blocked", label: "Blocked" },
  { value: "failed", label: "Failed" },
];

function matchesFilter(attempt: InstructorAttemptEvidence, filter: Filter): boolean {
  switch (filter) {
    case "safety":
      return attempt.safety_errors > 0;
    case "review":
      return attempt.status === "requires_review";
    case "in_progress":
      return attempt.status === "in_progress";
    case "completed":
      return attempt.status === "completed";
    case "overdue":
      return Boolean(attempt.is_overdue);
    case "blocked":
      return Boolean(attempt.is_blocked);
    case "failed":
      return attempt.outcome === "failed";
    default:
      return true;
  }
}

function attentionReason(attempt: InstructorAttemptEvidence): string {
  if (attempt.safety_errors > 0) {
    return `${attempt.safety_errors} safety error${attempt.safety_errors === 1 ? "" : "s"}`;
  }
  if (attempt.status === "requires_review") return "Awaiting review";
  return "Overdue";
}

/**
 * The instructor's landing page carries teaching signal only.
 *
 * Assignment creation, operational telemetry and competency rollups each have their own route.
 * Previously all four shared this one scroll, and the assignment form alone filled the first
 * screen before any learner evidence appeared.
 */
export function InstructorDashboardPage() {
  const overview = useInstructorOverview();
  const [filter, setFilter] = useState<Filter>("all");

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

      <QueryBoundary
        query={overview}
        loading="Loading school evidence…"
        error="School evidence could not be loaded."
      >
        {(data) => {
          const attention = data.attempts.filter(
            (attempt) =>
              attempt.safety_errors > 0 ||
              attempt.status === "requires_review" ||
              attempt.is_overdue,
          );
          const visible = data.attempts.filter((attempt) => matchesFilter(attempt, filter));

          return (
            <>
              <MetricGrid>
                <MetricTile label="Learners assigned" value={data.metrics.learners} />
                <MetricTile label="Active attempts" value={data.metrics.inProgressAttempts} />
                <MetricTile label="Completed attempts" value={data.metrics.completedAttempts} />
                <MetricTile
                  label="Safety errors"
                  value={data.metrics.safetyErrors}
                  alert={data.metrics.safetyErrors > 0}
                />
              </MetricGrid>

              {attention.length > 0 ? (
                <section className="attention-band" aria-labelledby="attention-title">
                  <div className="attention-intro">
                    <span className="eyebrow">Needs your attention</span>
                    <h2 id="attention-title">
                      {attention.length} attempt{attention.length === 1 ? "" : "s"} to look at
                    </h2>
                    <p>Safety errors, attempts awaiting review, and work past its due date.</p>
                  </div>
                  <ul>
                    {attention.slice(0, 5).map((attempt) => (
                      <li key={attempt.id}>
                        <Link to={`/teach/attempts/${attempt.id}`}>
                          <strong>{attempt.learner.name}</strong>
                          <span>{attempt.lesson.title}</span>
                        </Link>
                        <small>{attentionReason(attempt)}</small>
                      </li>
                    ))}
                  </ul>
                  {attention.length > 5 ? (
                    <button className="button-link" onClick={() => setFilter("safety")}>
                      Filter the table to safety attention
                    </button>
                  ) : null}
                </section>
              ) : null}

              <div className="evidence-heading">
                <div>
                  <h2>Attempt evidence</h2>
                  <p>Most recently updated attempts appear first.</p>
                </div>
                <div className="evidence-controls">
                  <span>
                    {data.metrics.assignments} assignments · {data.metrics.attempts} attempts
                  </span>
                  <label>
                    Filter attempts
                    <select
                      value={filter}
                      onChange={(event) => setFilter(event.target.value as Filter)}
                    >
                      {FILTERS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <AttemptEvidenceTable attempts={visible} />
            </>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
