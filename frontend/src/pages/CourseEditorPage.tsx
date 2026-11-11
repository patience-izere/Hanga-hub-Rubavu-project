import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, describeApiError } from "../api/client";
import type { AuthoringCourse, CourseInput } from "../api/content";
import { useRoles } from "../auth/useRoles";
import { ListEditor } from "../components/authoring/AuthoringFields";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import { Dialog } from "../components/ui/Dialog";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import {
  useAddCourseCompetency,
  useAddCourseModule,
  useAuthoringCourses,
  useCreateAuthoringCourse,
  useDeleteAuthoringCourse,
  useDeleteCourseCompetency,
  useDeleteCourseModule,
  useUpdateAuthoringCourse,
  useUpdateCourseCompetency,
  useUpdateCourseModule,
} from "../learning/useContentAuthoring";
import { ACCESS_INFO, AccessBadge } from "./CoursesPage";
import "../styles/authoring.css";

type Form = Required<Omit<CourseInput, "accessLabel">>;

const EMPTY: Form = {
  title: "",
  trade: "",
  summary: "",
  description: "",
  access: "members",
  level: "beginner",
  ageGroup: "",
  durationHours: null,
  language: "English",
  delivery: "virtual",
  outcomes: [],
  requirements: [],
  prerequisites: [],
  recognition: "",
  isPublished: false,
};

function formFrom(course: AuthoringCourse): Form {
  return {
    title: course.title,
    trade: course.trade,
    summary: course.summary ?? "",
    description: course.description ?? "",
    access: course.access ?? "members",
    level: course.level ?? "beginner",
    ageGroup: course.ageGroup ?? "",
    durationHours: course.durationHours ?? null,
    language: course.language ?? "",
    delivery: course.delivery ?? "virtual",
    outcomes: course.outcomes ?? [],
    requirements: course.requirements ?? [],
    prerequisites: course.prerequisites ?? [],
    recognition: course.recognition ?? "",
    isPublished: course.isPublished ?? false,
  };
}

const clean = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);

/** Create or edit a course: catalogue details, who can take it, modules and competencies. */
export function CourseEditorPage() {
  const { courseId } = useParams();
  const isNew = !courseId;
  const courses = useAuthoringCourses();
  const course = courses.data?.find((item) => item.id === Number(courseId));

  if (!isNew) {
    return (
      <QueryBoundary query={courses} loading="Loading the course…">
        {() =>
          course ? (
            <CourseEditor key={course.id} course={course} />
          ) : (
            <section className="dashboard studio-page">
              <h1>Course not found</h1>
              <Link to="/authoring">Back to the Module Studio</Link>
            </section>
          )
        }
      </QueryBoundary>
    );
  }
  return <CourseEditor />;
}

function CourseEditor({ course }: { course?: AuthoringCourse }) {
  const navigate = useNavigate();
  const roles = useRoles();
  const create = useCreateAuthoringCourse();
  const update = useUpdateAuthoringCourse();
  const remove = useDeleteAuthoringCourse();
  const [form, setForm] = useState<Form>(() => (course ? formFrom(course) : EMPTY));
  const [saved, setSaved] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saving = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const fieldErrors = error instanceof ApiError ? error.fieldErrors : {};

  useEffect(() => setSaved(""), [form]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const input = {
      ...form,
      outcomes: clean(form.outcomes),
      requirements: clean(form.requirements),
      prerequisites: clean(form.prerequisites),
    };
    if (course) {
      update.mutate({ id: course.id, ...input }, { onSuccess: () => setSaved("Course saved.") });
    } else {
      create.mutate(input, {
        onSuccess: (created) => navigate(`/authoring/courses/${created.id}`, { replace: true }),
      });
    }
  }

  const fieldError = (name: string) =>
    fieldErrors[name]?.length ? (
      <small className="field-error">{fieldErrors[name].join(" ")}</small>
    ) : null;

  return (
    <section className="dashboard studio-page course-editor">
      <Breadcrumbs
        items={[
          { label: "Module Studio", to: "/authoring" },
          { label: course ? course.title : "New course" },
        ]}
      />
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Course</span>
          <h1>{course ? course.title : "New course"}</h1>
          <p>
            These details appear on the public Courses page, so learners know what the course
            covers, who it is for and whether they need an account.
          </p>
        </div>
        {course ? (
          <Link className="button button-secondary" to={`/courses/${course.slug}`}>
            View public page
          </Link>
        ) : null}
      </div>

      <form className="studio-form course-form" onSubmit={submit}>
        <fieldset className="studio-plain-fieldset">
          <legend>About the course</legend>
          <label>
            Title
            <input
              required
              maxLength={180}
              value={form.title}
              onChange={(event) => set("title", event.target.value)}
            />
            {fieldError("title")}
          </label>
          <label>
            Trade
            <input
              required
              maxLength={120}
              placeholder="Electrical installation"
              value={form.trade}
              onChange={(event) => set("trade", event.target.value)}
            />
          </label>
          <label>
            Summary (shown on the course card)
            <textarea
              rows={2}
              maxLength={300}
              value={form.summary}
              onChange={(event) => set("summary", event.target.value)}
            />
            <small className="field-note">{form.summary.length}/300 characters</small>
          </label>
          <label>
            Full description
            <textarea
              rows={6}
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="studio-plain-fieldset access-choice">
          <legend>Who can take it</legend>
          {(Object.keys(ACCESS_INFO) as Form["access"][]).map((key) => (
            <label key={key} className="access-option">
              <input
                type="radio"
                name="access"
                value={key}
                checked={form.access === key}
                onChange={() => set("access", key)}
              />
              <span>
                <AccessBadge access={key} />
                <small>{ACCESS_INFO[key].explain}</small>
              </span>
            </label>
          ))}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(event) => set("isPublished", event.target.checked)}
            />
            Show this course on the public Courses page
          </label>
        </fieldset>

        <fieldset className="studio-plain-fieldset">
          <legend>Who it is for</legend>
          <div className="form-row">
            <label>
              Level
              <select
                value={form.level}
                onChange={(event) => set("level", event.target.value as Form["level"])}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label>
              Age group
              <input
                maxLength={60}
                placeholder="15 and over"
                value={form.ageGroup}
                onChange={(event) => set("ageGroup", event.target.value)}
              />
            </label>
            <label>
              Total time (hours)
              <input
                type="number"
                min={1}
                max={1000}
                value={form.durationHours ?? ""}
                onChange={(event) =>
                  set("durationHours", event.target.value ? Number(event.target.value) : null)
                }
              />
            </label>
            <label>
              Language
              <input
                maxLength={60}
                value={form.language}
                onChange={(event) => set("language", event.target.value)}
              />
            </label>
          </div>
          <label>
            How it is taught
            <select
              value={form.delivery}
              onChange={(event) => set("delivery", event.target.value as Form["delivery"])}
            >
              <option value="virtual">Virtual practice only</option>
              <option value="blended">Virtual practice, then a supervised physical workshop</option>
            </select>
          </label>
          <ListEditor
            label="What learners will be able to do"
            items={form.outcomes}
            onChange={(items) => set("outcomes", items)}
            addLabel="Add an outcome"
            placeholder="Prove a circuit is dead before touching it"
            error={fieldErrors.outcomes?.join(" ")}
          />
          <ListEditor
            label="Prerequisites"
            hint="Knowledge or courses a learner should have first."
            items={form.prerequisites}
            onChange={(items) => set("prerequisites", items)}
            addLabel="Add a prerequisite"
            placeholder="Workshop Safety Essentials"
            error={fieldErrors.prerequisites?.join(" ")}
          />
          <ListEditor
            label="Requirements"
            hint="Devices, tools or conditions a learner needs."
            items={form.requirements}
            onChange={(items) => set("requirements", items)}
            addLabel="Add a requirement"
            placeholder="A phone or computer with a recent browser"
            error={fieldErrors.requirements?.join(" ")}
          />
          <label>
            Recognition by a partner institution (optional)
            <textarea
              rows={3}
              placeholder="Leave empty unless a partner institution awards its own certificate after the physical workshop."
              value={form.recognition}
              onChange={(event) => set("recognition", event.target.value)}
            />
            <small className="field-note">OPedu itself issues no certificates.</small>
          </label>
        </fieldset>

        {error && !Object.keys(fieldErrors).length ? (
          <p className="form-error" role="alert">
            {describeApiError(error, "The course could not be saved.")}
          </p>
        ) : null}
        {saved ? (
          <p className="form-success" role="status">
            {saved}
          </p>
        ) : null}
        <div className="button-row">
          <button className="button button-primary" disabled={saving}>
            {saving ? "Saving…" : course ? "Save course" : "Create course"}
          </button>
          {course && roles.canPublishContent ? (
            <button
              type="button"
              className="button button-danger"
              onClick={() => setConfirmDelete(true)}
            >
              Delete course
            </button>
          ) : null}
        </div>
      </form>

      {course ? (
        <>
          <ModulesEditor course={course} />
          <CompetenciesEditor course={course} />
        </>
      ) : (
        <p className="field-note">
          Create the course first, then add its modules and competencies.
        </p>
      )}

      {confirmDelete && course ? (
        <Dialog labelledBy="delete-course-title" onClose={() => setConfirmDelete(false)}>
          <h2 id="delete-course-title">Delete {course.title}?</h2>
          <p>
            Its lessons, modules and competencies are deleted too. A course that learners have
            worked in cannot be deleted; unpublish it instead.
          </p>
          {remove.isError ? (
            <p className="form-error" role="alert">
              {describeApiError(remove.error, "The course could not be deleted.")}
            </p>
          ) : null}
          <div className="modal-actions">
            <button className="button button-secondary" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            <button
              className="button button-danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(course.id, { onSuccess: () => navigate("/authoring") })}
            >
              {remove.isPending ? "Deleting…" : "Delete course"}
            </button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}

function ModulesEditor({ course }: { course: AuthoringCourse }) {
  const add = useAddCourseModule();
  const update = useUpdateCourseModule();
  const remove = useDeleteCourseModule();
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<{ id: number; title: string } | null>(null);
  const error = add.error ?? update.error ?? remove.error;
  const modules = [...course.modules].sort((a, b) => a.order - b.order);

  return (
    <section className="admin-panel">
      <h2>Modules</h2>
      <p className="field-note">Modules group related lessons, in the order learners see them.</p>
      {modules.length ? (
        <ol className="crud-list">
          {modules.map((module, index) => (
            <li key={module.id}>
              {editing?.id === module.id ? (
                <form
                  className="crud-inline"
                  onSubmit={(event) => {
                    event.preventDefault();
                    update.mutate(
                      { courseId: course.id, moduleId: module.id, title: editing.title },
                      { onSuccess: () => setEditing(null) },
                    );
                  }}
                >
                  <label>
                    <span className="sr-only">Module title</span>
                    <input
                      required
                      maxLength={180}
                      value={editing.title}
                      onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                    />
                  </label>
                  <button className="button button-primary" disabled={update.isPending}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span>
                    <strong>{module.title}</strong>
                    <small>
                      {module.lessonCount ?? 0} lesson{module.lessonCount === 1 ? "" : "s"}
                    </small>
                  </span>
                  <span className="crud-actions">
                    <button
                      type="button"
                      className="button-link"
                      disabled={index === 0 || update.isPending}
                      aria-label={`Move ${module.title} up`}
                      onClick={() =>
                        update.mutate({ courseId: course.id, moduleId: module.id, move: "up" })
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="button-link"
                      disabled={index === modules.length - 1 || update.isPending}
                      aria-label={`Move ${module.title} down`}
                      onClick={() =>
                        update.mutate({ courseId: course.id, moduleId: module.id, move: "down" })
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="button-link"
                      onClick={() => setEditing({ id: module.id, title: module.title })}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="button-link danger-link"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete the module "${module.title}"?`)) {
                          remove.mutate({ courseId: course.id, moduleId: module.id });
                        }
                      }}
                    >
                      Delete
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="field-note">No modules yet.</p>
      )}
      <form
        className="crud-inline"
        onSubmit={(event) => {
          event.preventDefault();
          if (add.isPending) return;
          add.mutate(
            { courseId: course.id, title, description: "" },
            { onSuccess: () => setTitle("") },
          );
        }}
      >
        <label>
          New module
          <input
            required
            maxLength={180}
            value={title}
            placeholder="PV safety"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <button className="button button-secondary" disabled={add.isPending}>
          Add module
        </button>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {describeApiError(error, "The module could not be changed.")}
        </p>
      ) : null}
    </section>
  );
}

function CompetenciesEditor({ course }: { course: AuthoringCourse }) {
  const add = useAddCourseCompetency();
  const update = useUpdateCourseCompetency();
  const remove = useDeleteCourseCompetency();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<{ id: number; code: string; title: string } | null>(null);
  const error = add.error ?? update.error ?? remove.error;

  return (
    <section className="admin-panel">
      <h2>Competencies</h2>
      <p className="field-note">What the course assesses. Every practical step maps to one.</p>
      {course.competencies.length ? (
        <ul className="crud-list">
          {course.competencies.map((competency) => (
            <li key={competency.id}>
              {editing?.id === competency.id ? (
                <form
                  className="crud-inline"
                  onSubmit={(event) => {
                    event.preventDefault();
                    update.mutate(
                      {
                        courseId: course.id,
                        competencyId: competency.id,
                        code: editing.code,
                        title: editing.title,
                      },
                      { onSuccess: () => setEditing(null) },
                    );
                  }}
                >
                  <label>
                    <span className="sr-only">Code</span>
                    <input
                      required
                      maxLength={60}
                      value={editing.code}
                      onChange={(event) => setEditing({ ...editing, code: event.target.value })}
                    />
                  </label>
                  <label>
                    <span className="sr-only">What the learner can do</span>
                    <input
                      required
                      maxLength={180}
                      value={editing.title}
                      onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                    />
                  </label>
                  <button className="button button-primary" disabled={update.isPending}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span>
                    <code>{competency.code}</code> {competency.title}
                  </span>
                  <span className="crud-actions">
                    <button
                      type="button"
                      className="button-link"
                      onClick={() =>
                        setEditing({
                          id: competency.id,
                          code: competency.code,
                          title: competency.title,
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="button-link danger-link"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete the competency ${competency.code}?`)) {
                          remove.mutate({ courseId: course.id, competencyId: competency.id });
                        }
                      }}
                    >
                      Delete
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-note">No competencies yet.</p>
      )}
      <form
        className="crud-inline"
        onSubmit={(event) => {
          event.preventDefault();
          if (add.isPending) return;
          add.mutate(
            { courseId: course.id, code, title, description: "" },
            {
              onSuccess: () => {
                setCode("");
                setTitle("");
              },
            },
          );
        }}
      >
        <label>
          Code
          <input
            required
            maxLength={60}
            placeholder="ELEC-03"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <label>
          What the learner can do
          <input
            required
            maxLength={180}
            placeholder="Isolate a circuit safely"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <button className="button button-secondary" disabled={add.isPending}>
          Add competency
        </button>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {describeApiError(error, "The competency could not be changed.")}
        </p>
      ) : null}
    </section>
  );
}
