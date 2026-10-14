import { FormEvent, useState } from "react";

import { describeApiError } from "@/api/client";
import type { SchoolCohort, SchoolCohortList } from "@/api/school";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import {
  useCreateSchoolCohort,
  useSchoolCohorts,
  useSchoolOverview,
  useUpdateSchoolCohort,
} from "@/school/useSchoolAdmin";

function LearnerPicker({
  cohort,
  learners,
  onDone,
}: {
  cohort: SchoolCohort;
  learners: SchoolCohortList["learners"];
  onDone: () => void;
}) {
  const update = useUpdateSchoolCohort();
  const [selected, setSelected] = useState(() => new Set(cohort.learners.map((item) => item.id)));
  const [search, setSearch] = useState("");
  const eligible = learners.filter((learner) => learner.schoolId === cohort.school.id);
  const term = search.trim().toLowerCase();
  const visible = eligible.filter(
    (learner) =>
      !term ||
      learner.name.toLowerCase().includes(term) ||
      learner.email.toLowerCase().includes(term),
  );

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form
      className="class-learner-picker"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate({ id: cohort.id, learnerIds: [...selected] }, { onSuccess: onDone });
      }}
    >
      {eligible.length === 0 ? (
        <p className="field-note">
          This school has no active learners yet. Invite learners first, then add them here.
        </p>
      ) : (
        <>
          <label>
            <span className="sr-only">Search learners</span>
            <input
              type="search"
              placeholder="Search learners"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <ul>
            {visible.map((learner) => (
              <li key={learner.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(learner.id)}
                    onChange={() => toggle(learner.id)}
                  />
                  <span>
                    {learner.name}
                    <small>{learner.email}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="button-row">
        <button className="button button-primary" disabled={update.isPending}>
          {update.isPending
            ? "Saving…"
            : `Save ${selected.size} learner${selected.size === 1 ? "" : "s"}`}
        </button>
        <button type="button" className="button button-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
      {update.isError ? (
        <p className="form-error" role="alert">
          {describeApiError(update.error, "The class could not be saved.")}
        </p>
      ) : null}
    </form>
  );
}

function CreateClassForm({ data }: { data: SchoolCohortList }) {
  const create = useCreateSchoolCohort();
  const schools = useSchoolOverview().data?.schools ?? [];
  const [name, setName] = useState("");
  const [programName, setProgramName] = useState("");
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [schoolId, setSchoolId] = useState<number | "">("");
  // Administrators of more than one school say which one the class belongs to.
  const needsSchool = schools.length > 1;

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate(
      {
        name,
        programName,
        academicYear,
        schoolId: needsSchool && schoolId !== "" ? schoolId : undefined,
      },
      {
        onSuccess: () => {
          setName("");
        },
      },
    );
  }

  return (
    <section className="admin-panel">
      <h2>Create a class</h2>
      <form onSubmit={submit}>
        {needsSchool ? (
          <>
            <label htmlFor="class-school">School</label>
            <select
              id="class-school"
              required
              value={schoolId}
              onChange={(event) =>
                setSchoolId(event.target.value ? Number(event.target.value) : "")
              }
            >
              <option value="">Choose a school</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <label htmlFor="class-name">Class name</label>
        <input
          id="class-name"
          required
          maxLength={180}
          placeholder="Automobile Technology, Level 3 A"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="class-program">Programme</label>
        <input
          id="class-program"
          required
          maxLength={180}
          list="class-programs"
          placeholder="Automobile Technology"
          value={programName}
          onChange={(event) => setProgramName(event.target.value)}
        />
        <datalist id="class-programs">
          {data.programs.map((program) => (
            <option key={program.id} value={program.name} />
          ))}
        </datalist>
        <label htmlFor="class-year">Academic year</label>
        <input
          id="class-year"
          maxLength={20}
          value={academicYear}
          onChange={(event) => setAcademicYear(event.target.value)}
        />
        {create.isError ? (
          <p className="form-error" role="alert">
            {describeApiError(create.error, "The class could not be created.")}
          </p>
        ) : null}
        {create.data ? (
          <p className="form-success" role="status">
            {create.data.name} created. Add its learners below.
          </p>
        ) : null}
        <button className="button button-primary" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create class"}
        </button>
      </form>
    </section>
  );
}

/**
 * Classes (cohorts) group learners so an instructor can assign a lesson to everyone at once.
 * They used to exist only in Django admin, which school administrators usually cannot open.
 */
export function SchoolClassesPage() {
  const cohorts = useSchoolCohorts();
  const update = useUpdateSchoolCohort();
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <section className="dashboard school-admin-page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">School administration</span>
          <h1>Classes.</h1>
          <p>
            Group learners into classes so instructors can assign a lesson to a whole class at once.
            Removing someone from a class keeps their attempts and results.
          </p>
        </div>
      </div>

      <QueryBoundary
        query={cohorts}
        loading="Loading classes…"
        error="Classes could not be loaded."
      >
        {(data) => (
          <>
            <CreateClassForm data={data} />
            <h2 className="section-title">All classes</h2>
            {update.isError ? (
              <p className="form-error" role="alert">
                {describeApiError(update.error, "The class could not be changed.")}
              </p>
            ) : null}
            {data.cohorts.length === 0 ? (
              <p className="field-note">No classes yet. Create the first one above.</p>
            ) : (
              <ul className="class-list">
                {data.cohorts.map((cohort) => (
                  <li key={cohort.id} className={cohort.isActive ? "" : "is-archived"}>
                    <div className="class-summary">
                      <div>
                        <strong>{cohort.name}</strong>
                        <small>
                          {cohort.programName}
                          {cohort.academicYear ? ` · ${cohort.academicYear}` : ""}
                          {data.cohorts.some((item) => item.school.id !== cohort.school.id)
                            ? ` · ${cohort.school.name}`
                            : ""}
                          {cohort.isActive ? "" : " · archived"}
                        </small>
                      </div>
                      <span>
                        {cohort.learners.length} learner{cohort.learners.length === 1 ? "" : "s"}
                      </span>
                      <div className="button-row">
                        {cohort.isActive ? (
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => setEditingId(editingId === cohort.id ? null : cohort.id)}
                          >
                            {editingId === cohort.id ? "Close" : "Choose learners"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="button-link"
                          disabled={update.isPending}
                          onClick={() =>
                            update.mutate({ id: cohort.id, isActive: !cohort.isActive })
                          }
                        >
                          {cohort.isActive ? "Archive" : "Restore"}
                        </button>
                      </div>
                    </div>
                    {editingId === cohort.id ? (
                      <LearnerPicker
                        cohort={cohort}
                        learners={data.learners}
                        onDone={() => setEditingId(null)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
