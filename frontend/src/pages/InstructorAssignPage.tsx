import { useMemo, useState } from "react";

import { QueryBoundary } from "../components/ui/QueryBoundary";
import {
  useCreateInstructorAssignments,
  useInstructorAssignmentOptions,
} from "../learning/useInstructor";

const DEFAULT_INSTRUCTIONS =
  "Complete the pre-lesson check and follow the approved safety procedure.";

/** Above this many learners the raw checkbox list stops being usable without search. */
const SEARCH_THRESHOLD = 8;

function toIsoOrNull(localValue: string): string | null {
  return localValue ? new Date(localValue).toISOString() : null;
}

export function InstructorAssignPage() {
  const options = useInstructorAssignmentOptions();
  const create = useCreateInstructorAssignments();

  const [scenarioId, setScenarioId] = useState(0);
  const [learnerIds, setLearnerIds] = useState<number[]>([]);
  const [cohortIds, setCohortIds] = useState<number[]>([]);
  const [availableAt, setAvailableAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [attemptLimit, setAttemptLimit] = useState(3);
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [learnerSearch, setLearnerSearch] = useState("");

  const learners = useMemo(() => options.data?.learners ?? [], [options.data]);
  const filteredLearners = useMemo(() => {
    const term = learnerSearch.trim().toLowerCase();
    if (!term) return learners;
    return learners.filter(
      (learner) =>
        learner.name.toLowerCase().includes(term) || learner.email.toLowerCase().includes(term),
    );
  }, [learners, learnerSearch]);

  const scenario = options.data?.scenarios.find((item) => item.id === scenarioId);
  const selectedCohorts = (options.data?.cohorts ?? []).filter((cohort) =>
    cohortIds.includes(cohort.id),
  );
  const cohortLearnerCount = selectedCohorts.reduce(
    (total, cohort) => total + cohort.learnerCount,
    0,
  );
  const canSubmit = Boolean(scenarioId) && (learnerIds.length > 0 || cohortIds.length > 0);

  function toggle(list: number[], id: number, setter: (next: number[]) => void) {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  return (
    <section className="dashboard assign-page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Assign practical learning</span>
          <h1>Create an evidence-ready assignment.</h1>
          <p>
            Choose a published scenario and the learners who should attempt it. Learners who already
            hold this assignment keep their existing attempts.
          </p>
        </div>
      </div>

      <QueryBoundary
        query={options}
        loading="Loading lessons and learners…"
        error="Assignment options could not be loaded."
      >
        {(data) => (
          <form
            className="assign-form"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({
                scenarioId,
                learnerIds,
                cohortIds,
                availableAt: toIsoOrNull(availableAt),
                dueAt: toIsoOrNull(dueAt),
                attemptLimit,
                instructions: instructions.trim() || DEFAULT_INSTRUCTIONS,
              });
            }}
          >
            <fieldset className="assign-section">
              <legend>1 &middot; Lesson</legend>
              <label>
                Published lesson
                <select
                  required
                  value={scenarioId || ""}
                  onChange={(event) => setScenarioId(Number(event.target.value))}
                >
                  <option value="">Choose a lesson</option>
                  {data.scenarios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.lessonTitle} &middot; {item.courseTitle} &middot; v{item.version}
                    </option>
                  ))}
                </select>
              </label>
              {data.scenarios.length === 0 ? (
                <p className="field-note">
                  No published scenario is available yet. A school administrator must publish one
                  before it can be assigned.
                </p>
              ) : null}
            </fieldset>

            <fieldset className="assign-section">
              <legend>2 &middot; Who</legend>
              {data.cohorts.length > 0 ? (
                <div className="assign-group">
                  <h3>Cohorts</h3>
                  <ul className="checkbox-list">
                    {data.cohorts.map((cohort) => (
                      <li key={cohort.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={cohortIds.includes(cohort.id)}
                            onChange={() => toggle(cohortIds, cohort.id, setCohortIds)}
                          />
                          <span>
                            {cohort.name}
                            <small>{cohort.learnerCount} active learner(s)</small>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="assign-group">
                <h3>Individual learners</h3>
                {learners.length > SEARCH_THRESHOLD ? (
                  <label className="learner-search">
                    <span className="sr-only">Search learners</span>
                    <input
                      type="search"
                      placeholder="Search by name or email"
                      value={learnerSearch}
                      onChange={(event) => setLearnerSearch(event.target.value)}
                    />
                  </label>
                ) : null}
                {filteredLearners.length === 0 ? (
                  <p className="field-note">No learner matches that search.</p>
                ) : (
                  <ul className="checkbox-list scrollable">
                    {filteredLearners.map((learner) => (
                      <li key={learner.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={learnerIds.includes(learner.id)}
                            onChange={() => toggle(learnerIds, learner.id, setLearnerIds)}
                          />
                          <span>
                            {learner.name}
                            <small>{learner.email}</small>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </fieldset>

            <fieldset className="assign-section">
              <legend>3 &middot; Schedule and rules</legend>
              <div className="assign-row">
                <label>
                  Available from
                  <input
                    type="datetime-local"
                    value={availableAt}
                    onChange={(event) => setAvailableAt(event.target.value)}
                  />
                </label>
                <label>
                  Due date
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(event) => setDueAt(event.target.value)}
                  />
                </label>
                <label>
                  Attempt limit
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={attemptLimit}
                    onChange={(event) => setAttemptLimit(Number(event.target.value))}
                  />
                </label>
              </div>
              <label>
                Instructions for the learner
                <textarea
                  rows={3}
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                />
              </label>
            </fieldset>

            <div className="assign-summary">
              <div>
                <h2>Before you assign</h2>
                {canSubmit ? (
                  <p>
                    <strong>{scenario?.lessonTitle}</strong> (v{scenario?.version}) to{" "}
                    <strong>{learnerIds.length}</strong> individual learner(s)
                    {selectedCohorts.length > 0 ? (
                      <>
                        {" "}
                        and <strong>{selectedCohorts.length}</strong> cohort(s) covering about{" "}
                        {cohortLearnerCount} learner(s)
                      </>
                    ) : null}
                    {dueAt ? `, due ${new Date(dueAt).toLocaleString()}` : ", with no due date"}.
                  </p>
                ) : (
                  <p>Choose a lesson and at least one cohort or learner.</p>
                )}
              </div>
              <button className="button button-primary" disabled={!canSubmit || create.isPending}>
                {create.isPending ? "Assigning…" : "Create assignments"}
              </button>
            </div>

            {create.isError ? (
              <p className="form-error" role="alert">
                The assignments could not be created.
              </p>
            ) : null}
            {create.data ? (
              <p className="form-success" role="status">
                Created {create.data.created} assignment(s); {create.data.existing} learner(s)
                already held this lesson and were left unchanged.
              </p>
            ) : null}
          </form>
        )}
      </QueryBoundary>
    </section>
  );
}
