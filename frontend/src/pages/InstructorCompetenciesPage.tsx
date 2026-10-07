import type { InstructorCompetencyRollup } from "../api/instructor";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { useInstructorOverview } from "../learning/useInstructor";

type Band = {
  key: keyof Pick<
    InstructorCompetencyRollup,
    "mastered" | "developing" | "notDemonstrated" | "requiresReview"
  >;
  label: string;
  className: string;
};

const BANDS: Band[] = [
  { key: "mastered", label: "Mastered", className: "band-mastered" },
  { key: "developing", label: "Developing", className: "band-developing" },
  { key: "notDemonstrated", label: "Not demonstrated", className: "band-not-demonstrated" },
  { key: "requiresReview", label: "Requires review", className: "band-requires-review" },
];

/** Weakest competencies first, so the teaching decision is at the top of the page. */
function byWeakest(a: InstructorCompetencyRollup, b: InstructorCompetencyRollup): number {
  const rate = (item: InstructorCompetencyRollup) =>
    item.attempts === 0 ? 1 : item.mastered / item.attempts;
  return rate(a) - rate(b);
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

export function InstructorCompetenciesPage() {
  const overview = useInstructorOverview();

  return (
    <section className="dashboard competencies-page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Competency aggregation</span>
          <h1>Where the class stands.</h1>
          <p>
            Every completed attempt contributes one result per mapped competency. Competencies with
            the lowest mastery appear first.
          </p>
        </div>
      </div>

      <QueryBoundary
        query={overview}
        loading="Loading competency evidence…"
        error="Competency evidence could not be loaded."
      >
        {(data) => {
          const rollups = [...data.competencies].sort(byWeakest);
          if (rollups.length === 0) {
            return (
              <div className="empty-learning-state">
                <h2>No competency evidence yet</h2>
                <p>
                  Results appear once an assigned learner completes a practical attempt. Completion
                  is what materializes competency results.
                </p>
              </div>
            );
          }

          return (
            <ul className="competency-rollup">
              {rollups.map((item) => (
                <li key={item.code}>
                  <div className="competency-rollup-head">
                    <div>
                      <span className="competency-code">{item.code}</span>
                      <strong>{item.title}</strong>
                    </div>
                    <span className="competency-rate">
                      {percent(item.mastered, item.attempts)}% mastered
                      <small>{item.attempts} result(s)</small>
                    </span>
                  </div>
                  <div
                    className="competency-bar"
                    role="img"
                    aria-label={BANDS.map(
                      (band) => `${item[band.key]} ${band.label.toLowerCase()}`,
                    ).join(", ")}
                  >
                    {BANDS.map((band) =>
                      item[band.key] > 0 ? (
                        <span
                          key={band.key}
                          className={band.className}
                          style={{ width: `${percent(item[band.key], item.attempts)}%` }}
                        />
                      ) : null,
                    )}
                  </div>
                  <dl className="competency-legend">
                    {BANDS.map((band) => (
                      <div key={band.key}>
                        <dt>
                          <span className={band.className} aria-hidden="true" />
                          {band.label}
                        </dt>
                        <dd>{item[band.key]}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
