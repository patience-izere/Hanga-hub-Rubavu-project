import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { InstructorRosterEntry } from "../api/instructor";
import { Pagination, usePage } from "../components/ui/Pagination";
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
  return learner.assignments === 0 ? 1 : learner.completedAssignments / learner.assignments;
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

function csvCell(value: string | number): string {
  let text = String(value);
  // Spreadsheet software runs cells starting with these as formulas.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The roster as it is filtered and sorted on screen, as a CSV file. */
function downloadRoster(learners: InstructorRosterEntry[]) {
  const header = [
    "name",
    "email",
    "classes",
    "assignments",
    "completed",
    "overdue",
    "attempts",
    "safety_errors",
    "last_active",
  ];
  const rows = learners.map((learner) => [
    learner.name,
    learner.email,
    learner.cohorts.join("; "),
    learner.assignments,
    learner.completedAssignments,
    learner.overdueAssignments,
    learner.attempts,
    learner.safetyErrors,
    learner.lastActivityAt ?? "",
  ]);
  const text = "\ufeff" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "opedu-learners.csv";
  link.click();
  URL.revokeObjectURL(url);
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
  // Only one page is drawn: ten thousand rows took seconds and hundreds of megabytes.
  const paged = usePage(visible);

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
            "Learners appear here once they join your school: by invitation, or by joining a class with its code.",
          symbol: "⚙",
          action: (
            <Link className="button button-primary" to="/teach/classes">
              Set up class sign-in
            </Link>
          ),
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
              <button
                type="button"
                className="button button-secondary"
                onClick={() => downloadRoster(visible)}
              >
                Download CSV
              </button>
              <span className="roster-count">
                {visible.length} of {learners.length} learner(s)
              </span>
            </div>

            {visible.length === 0 ? (
              <p className="field-note">No learner matches that search.</p>
            ) : (
              <ul className="roster-list">
                {paged.slice.map((learner) => {
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
                            {learner.completedAssignments}/{learner.assignments}
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
            <Pagination
              page={paged.page}
              total={paged.total}
              onPage={(next) => {
                paged.setPage(next);
                window.scrollTo({ top: 0, behavior: "instant" });
              }}
              label="learners"
            />
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
