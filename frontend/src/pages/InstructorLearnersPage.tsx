import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { InstructorRosterEntry } from "../api/instructor";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { useInstructorRoster } from "../learning/useInstructor";

type Sort = "name" | "attention" | "progress";

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "attention", label: "Needs attention first" },
  { value: "name", label: "Name" },
  { value: "progress", label: "Least progress first" },
];

function attentionScore(learner: InstructorRosterEntry): number {
  return learner.safetyErrors * 10 + learner.overdueAssignments;
}

function completionRate(learner: InstructorRosterEntry): number {
  return learner.assignments === 0 ? 1 : learner.completedAttempts / learner.assignments;
}

function compare(a: InstructorRosterEntry, b: InstructorRosterEntry, sort: Sort): number {
  if (sort === "name") return a.name.localeCompare(b.name);
  if (sort === "progress") return completionRate(a) - completionRate(b);
  return attentionScore(b) - attentionScore(a) || a.name.localeCompare(b.name);
}

function relativeDay(value: string | null): string {
  if (!value) return "No activity yet";
  return new Date(value).toLocaleDateString();
}

/**
 * The learner-centric view of the school.
 *
 * The overview page is organised around attempts, which cannot answer "how is this learner
 * doing across the term". This is the only place that question gets a direct answer.
 */
export function InstructorLearnersPage() {
  const roster = useInstructorRoster();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("attention");

  const learners = useMemo(() => roster.data ?? [], [roster.data]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? learners.filter(
          (learner) =>
            learner.name.toLowerCase().includes(term) ||
            learner.email.toLowerCase().includes(term) ||
            learner.cohorts.some((cohort) => cohort.toLowerCase().includes(term)),
        )
      : learners;
    return [...filtered].sort((a, b) => compare(a, b, sort));
  }, [learners, search, sort]);

  return (
    <section className="dashboard roster-page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">School roster</span>
          <h1>Every learner you teach.</h1>
          <p>
            Assignments, attempts and safety signals aggregated per learner across the whole term.
          </p>
        </div>
      </div>

      <QueryBoundary
        query={roster}
        loading="Loading the roster…"
        error="The roster could not be loaded."
        empty={{
          title: "No learners yet",
          description:
            "Learners appear here once a school administrator activates their membership.",
          symbol: "⚙",
        }}
      >
        {() => (
          <>
            <div className="roster-controls">
              <label>
                <span className="sr-only">Search learners</span>
                <input
                  type="search"
                  placeholder="Search by name, email or cohort"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label>
                Sort by
                <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
                  {SORTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="roster-count">
                {visible.length} of {learners.length} learner(s)
              </span>
            </div>

            {visible.length === 0 ? (
              <p className="field-note">No learner matches that search.</p>
            ) : (
              <ul className="roster-list">
                {visible.map((learner) => {
                  const needsAttention = learner.safetyErrors > 0 || learner.overdueAssignments > 0;
                  return (
                    <li key={learner.id} className={needsAttention ? "needs-attention" : undefined}>
                      <div className="roster-identity">
                        <Link to={`/teach/learners/${learner.id}`}>
                          <strong>{learner.name}</strong>
                        </Link>
                        <small>{learner.email}</small>
                        {learner.cohorts.length > 0 ? (
                          <span className="roster-cohorts">{learner.cohorts.join(", ")}</span>
                        ) : (
                          <span className="roster-cohorts muted">No cohort</span>
                        )}
                      </div>
                      <dl className="roster-stats">
                        <div>
                          <dt>Progress</dt>
                          <dd>
                            {learner.completedAttempts}/{learner.assignments}
                          </dd>
                        </div>
                        <div>
                          <dt>Attempts</dt>
                          <dd>{learner.attempts}</dd>
                        </div>
                        <div>
                          <dt>Average</dt>
                          <dd>
                            {learner.averageScore === null
                              ? "—"
                              : `${Math.round(Number(learner.averageScore))}%`}
                          </dd>
                        </div>
                        <div className={learner.safetyErrors ? "stat-alert" : undefined}>
                          <dt>Safety</dt>
                          <dd>{learner.safetyErrors}</dd>
                        </div>
                        <div className={learner.overdueAssignments ? "stat-alert" : undefined}>
                          <dt>Overdue</dt>
                          <dd>{learner.overdueAssignments}</dd>
                        </div>
                        <div>
                          <dt>Last active</dt>
                          <dd>{relativeDay(learner.lastActivityAt)}</dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
