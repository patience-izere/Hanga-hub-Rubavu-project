import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, describeApiError } from "../api/client";
import type { AuthoringLesson, LessonInput } from "../api/content";
import { ContentStatusBadge, ListEditor } from "../components/authoring/AuthoringFields";
import { CONTENT_STATUS_LABELS, fieldError } from "../components/authoring/authoringLabels";
import { useCurrentUser } from "../auth/useAuth";
import { useRoles } from "../auth/useRoles";
import {
  useAuthoringCourses,
  useAuthoringLesson,
  useCreateAuthoringLesson,
  useCreateLessonScenario,
  useLessonHistory,
  useReviseAuthoringLesson,
  useTransitionAuthoringLesson,
  useUpdateAuthoringLesson,
} from "../learning/useContentAuthoring";

const EMPTY_LESSON: LessonInput = {
  course: 0,
  module: null,
  title: "",
  summary: "",
  objectives: [""],
  safetyNotes: [""],
  estimatedMinutes: 30,
  language: "en",
  competencies: [],
};

function toInput(lesson: AuthoringLesson): LessonInput {
  return {
    course: lesson.course,
    module: lesson.module,
    title: lesson.title,
    summary: lesson.summary,
    objectives: lesson.objectives,
    safetyNotes: lesson.safetyNotes,
    estimatedMinutes: lesson.estimatedMinutes,
    language: lesson.language,
    competencies: lesson.competencies,
  };
}

function cleaned(input: LessonInput): LessonInput {
  return {
    ...input,
    objectives: input.objectives.map((item) => item.trim()).filter(Boolean),
    safetyNotes: input.safetyNotes.map((item) => item.trim()).filter(Boolean),
  };
}

export function LessonEditorPage() {
  const lessonId = Number(useParams().lessonId ?? 0);
  const isNew = !lessonId;
  const navigate = useNavigate();
  const roles = useRoles();
  const currentUser = useCurrentUser().data;
  const courses = useAuthoringCourses();
  const lesson = useAuthoringLesson(lessonId);
  const create = useCreateAuthoringLesson();
  const update = useUpdateAuthoringLesson();
  const transition = useTransitionAuthoringLesson();
  const createScenario = useCreateLessonScenario();
  const revise = useReviseAuthoringLesson();
  const history = useLessonHistory(lessonId);

  const [form, setForm] = useState<LessonInput>(EMPTY_LESSON);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  useEffect(() => {
    if (lesson.data) {
      const input = toInput(lesson.data);
      setForm(input);
      setSavedSnapshot(JSON.stringify(cleaned(input)));
    }
  }, [lesson.data]);

  useEffect(() => {
    if (isNew && !form.course && courses.data?.length) {
      setForm((current) => ({ ...current, course: courses.data[0].id }));
    }
  }, [isNew, form.course, courses.data]);

  const isDirty = JSON.stringify(cleaned(form)) !== savedSnapshot;
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const course = courses.data?.find((item) => item.id === form.course);
  const status = lesson.data?.status ?? "draft";
  const editable = isNew || status === "draft";
  const saveError = create.error ?? update.error;
  const fieldErrors = saveError instanceof ApiError ? saveError.fieldErrors : {};

  const readiness = useMemo(() => {
    const input = cleaned(form);
    return [
      {
        done: input.title.trim().length > 0 && input.summary.trim().length > 0,
        label: "Title and summary",
      },
      { done: input.objectives.length > 0, label: "At least one learning objective" },
      { done: input.safetyNotes.length > 0, label: "At least one safety note" },
      { done: input.competencies.length > 0, label: "Mapped to a course competency" },
    ];
  }, [form]);
  const ready = readiness.every((item) => item.done);

  if (!isNew && lesson.isPending) {
    return <p className="panel-status dashboard">Loading lesson…</p>;
  }
  if (!isNew && lesson.isError) {
    return (
      <section className="dashboard studio-page">
        <p className="form-error" role="alert">
          {lesson.error instanceof ApiError && lesson.error.status === 404
            ? "This lesson does not exist or belongs to another school."
            : "The lesson could not be loaded. Check your connection and try again."}
        </p>
        <Link to="/authoring">Back to the Studio</Link>
      </section>
    );
  }

  const set = <K extends keyof LessonInput>(key: K, value: LessonInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = () => {
    const input = cleaned(form);
    if (isNew) {
      create.mutate(input, {
        onSuccess: (created) => navigate(`/authoring/lessons/${created.id}`, { replace: true }),
      });
    } else {
      update.mutate(
        { id: lessonId, ...input },
        { onSuccess: () => setSavedSnapshot(JSON.stringify(input)) },
      );
    }
  };

  const isOwnWork = lesson.data?.authoredBy === currentUser?.id;
  const canReview = roles.canPublishContent && !isNew;

  return (
    <section className="dashboard studio-page">
      <Link className="studio-back-link" to="/authoring">
        ← All lessons
      </Link>
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">
            {isNew ? "New lesson" : `Lesson · version ${lesson.data?.contentVersion}`}
          </div>
          <h1>{isNew ? "Write a lesson" : lesson.data?.title}</h1>
          {!isNew && lesson.data ? (
            <p>
              <ContentStatusBadge status={status} /> {lesson.data.courseTitle}
              {lesson.data.authorName ? ` · written by ${lesson.data.authorName}` : ""}
            </p>
          ) : (
            <p>Describe what learners will be able to do and how they stay safe doing it.</p>
          )}
        </div>
      </div>

      {status === "draft" && lesson.data?.reviewNotes ? (
        <div className="returned-banner" role="status">
          <strong>Returned for revision</strong>
          <p>{lesson.data.reviewNotes}</p>
        </div>
      ) : null}
      {!editable ? (
        <p className="studio-locked-note" role="status">
          This lesson is {CONTENT_STATUS_LABELS[status].toLowerCase()} and can no longer be edited.
          {status === "review" || status === "approved"
            ? " A reviewer can return it to draft with notes."
            : ""}
        </p>
      ) : null}

      <div className="studio-editor-grid">
        <form
          className="studio-form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="studio-field-row">
            <label>
              Course
              <select
                value={form.course}
                disabled={!isNew}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    course: Number(event.target.value),
                    module: null,
                    competencies: [],
                  }))
                }
                required
              >
                {(courses.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                Module <span className="studio-optional">optional</span>
              </span>
              <select
                value={form.module ?? ""}
                disabled={!editable}
                onChange={(event) =>
                  set("module", event.target.value ? Number(event.target.value) : null)
                }
              >
                <option value="">No module</option>
                {(course?.modules ?? []).map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Lesson title
            <input
              value={form.title}
              disabled={!editable}
              onChange={(event) => set("title", event.target.value)}
              required
              maxLength={180}
              placeholder="Isolate a PV array before maintenance"
              aria-invalid={Boolean(fieldErrors.title)}
            />
            {fieldError(fieldErrors, "title") ? (
              <span className="form-error">{fieldError(fieldErrors, "title")}</span>
            ) : null}
          </label>
          <label>
            Summary for learners
            <textarea
              rows={3}
              value={form.summary}
              disabled={!editable}
              onChange={(event) => set("summary", event.target.value)}
              required
              placeholder="In two or three sentences: what the learner will do and why it matters."
            />
          </label>
          <ListEditor
            label="Learning objectives"
            hint="Start each with a verb the learner can be observed doing: identify, measure, connect."
            items={form.objectives}
            onChange={(items) => set("objectives", items)}
            addLabel="Add objective"
            placeholder="Measure open-circuit voltage with a multimeter"
            disabled={!editable}
            error={fieldError(fieldErrors, "objectives")}
          />
          <div className="studio-safety-block">
            <ListEditor
              label="Safety notes"
              hint="Shown to the learner before they start. Include PPE and hazards."
              items={form.safetyNotes}
              onChange={(items) => set("safetyNotes", items)}
              addLabel="Add safety note"
              placeholder="Wear insulated gloves rated for the system voltage"
              disabled={!editable}
              error={fieldError(fieldErrors, "safetyNotes", "safety_notes")}
            />
          </div>
          <fieldset className="studio-competency-picker">
            <legend>Competencies this lesson develops</legend>
            {course?.competencies.length ? (
              course.competencies.map((competency) => (
                <label key={competency.id} className="studio-check">
                  <input
                    type="checkbox"
                    disabled={!editable}
                    checked={form.competencies.includes(competency.id)}
                    onChange={(event) =>
                      set(
                        "competencies",
                        event.target.checked
                          ? [...form.competencies, competency.id]
                          : form.competencies.filter((id) => id !== competency.id),
                      )
                    }
                  />
                  <span>
                    <code>{competency.code}</code> {competency.title}
                  </span>
                </label>
              ))
            ) : (
              <p className="field-note">
                This course has no competencies yet. Add them from the{" "}
                <Link to="/authoring">Studio course list</Link>.
              </p>
            )}
            {fieldError(fieldErrors, "competencies") ? (
              <p className="form-error">{fieldError(fieldErrors, "competencies")}</p>
            ) : null}
          </fieldset>
          <div className="studio-field-row">
            <label>
              Language of the lesson text
              <select
                value={form.language}
                disabled={!editable}
                onChange={(event) => set("language", event.target.value as LessonInput["language"])}
              >
                <option value="en">English</option>
                <option value="rw">Kinyarwanda</option>
                <option value="en-rw">English and Kinyarwanda</option>
              </select>
            </label>
            <label>
              Estimated minutes
              <input
                type="number"
                min={5}
                max={480}
                value={form.estimatedMinutes}
                disabled={!editable}
                onChange={(event) => set("estimatedMinutes", Number(event.target.value))}
              />
            </label>
          </div>
          {saveError && !Object.keys(fieldErrors).length ? (
            <p className="form-error" role="alert">
              {describeApiError(saveError, "The lesson could not be saved.")}
            </p>
          ) : null}
          {editable ? (
            <div className="studio-form-actions">
              <button
                className="button button-primary"
                disabled={create.isPending || update.isPending}
              >
                {create.isPending || update.isPending
                  ? "Saving…"
                  : isNew
                    ? "Create lesson"
                    : "Save changes"}
              </button>
              {isDirty && !isNew ? <span className="studio-unsaved">Unsaved changes</span> : null}
              {update.isSuccess && !isDirty ? <span className="form-success">Saved</span> : null}
            </div>
          ) : null}
        </form>

        {!isNew && lesson.data ? (
          <aside className="studio-side">
            <section className="studio-side-panel">
              <h2>
                {status === "draft"
                  ? "Ready for review?"
                  : status === "review" || status === "approved"
                    ? "Review"
                    : "Lesson status"}
              </h2>
              <ul className="studio-checklist" hidden={status !== "draft"}>
                {readiness.map((item) => (
                  <li key={item.label} className={item.done ? "is-done" : ""}>
                    <span aria-hidden="true">{item.done ? "✓" : "○"}</span> {item.label}
                    <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
                  </li>
                ))}
              </ul>
              {status === "draft" ? (
                <button
                  type="button"
                  className="button button-primary button-full"
                  disabled={!ready || isDirty || transition.isPending}
                  onClick={() => transition.mutate({ id: lessonId, action: "submit" })}
                >
                  Submit for review
                </button>
              ) : null}
              {status === "draft" && isDirty ? (
                <p className="field-note">Save your changes before submitting.</p>
              ) : null}
              {canReview && (status === "review" || status === "approved") ? (
                <div className="studio-review-actions">
                  <label>
                    Review notes
                    <textarea
                      rows={3}
                      value={reviewNotes}
                      onChange={(event) => setReviewNotes(event.target.value)}
                      placeholder="What must change, or what you checked."
                    />
                  </label>
                  {status === "review" ? (
                    <button
                      type="button"
                      className="button button-primary button-full"
                      disabled={transition.isPending || isOwnWork}
                      onClick={() =>
                        transition.mutate({ id: lessonId, action: "approve", reviewNotes })
                      }
                    >
                      Approve lesson
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button button-primary button-full"
                      disabled={transition.isPending}
                      onClick={() => transition.mutate({ id: lessonId, action: "publish" })}
                    >
                      Publish lesson
                    </button>
                  )}
                  {isOwnWork && status === "review" ? (
                    <p className="field-note">
                      You wrote this lesson, so another reviewer must approve it. A school with a
                      single reviewer can ask its platform administrator to allow self-approval.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="button button-secondary button-full"
                    disabled={transition.isPending || !reviewNotes.trim()}
                    onClick={() =>
                      transition.mutate({ id: lessonId, action: "return_to_draft", reviewNotes })
                    }
                  >
                    Return to author with notes
                  </button>
                </div>
              ) : null}
              {canReview && status === "published" ? (
                <button
                  type="button"
                  className="button button-secondary button-full"
                  disabled={transition.isPending}
                  onClick={() => transition.mutate({ id: lessonId, action: "retire" })}
                >
                  Retire lesson
                </button>
              ) : null}
              {status === "published" || status === "retired" ? (
                <>
                  <p className="field-note">
                    Learners' evidence refers to this exact text, so it stays as published. Start a
                    revision to change it; the current version stays live until you retire it.
                  </p>
                  <button
                    type="button"
                    className="button button-primary button-full"
                    disabled={revise.isPending}
                    onClick={() =>
                      revise.mutate(lessonId, {
                        onSuccess: (revision) => navigate(`/authoring/lessons/${revision.id}`),
                      })
                    }
                  >
                    {revise.isPending ? "Starting…" : "Start a revision"}
                  </button>
                  {revise.isError ? (
                    <p className="form-error" role="alert">
                      {describeApiError(revise.error, "The revision could not be started.")}
                    </p>
                  ) : null}
                </>
              ) : null}
              {transition.isError ? (
                <p className="form-error" role="alert">
                  {describeApiError(transition.error, "That change could not be made.")}
                </p>
              ) : null}
            </section>

            <section className="studio-side-panel">
              <h2>Practical scenarios</h2>
              <p className="field-note">
                The practical is the ordered set of steps a learner performs, in 2D or 3D.
              </p>
              {lesson.data.scenarios.length ? (
                <ul className="studio-scenario-list">
                  {[...lesson.data.scenarios]
                    .sort((a, b) => b.version - a.version)
                    .map((scenario) => (
                      <li key={scenario.id}>
                        <Link to={`/authoring/scenarios/${scenario.id}`}>
                          <strong>Version {scenario.version}</strong>
                          <ContentStatusBadge status={scenario.status} />
                        </Link>
                      </li>
                    ))}
                </ul>
              ) : null}
              <button
                type="button"
                className="button button-secondary button-full"
                disabled={createScenario.isPending || !lesson.data.competencies.length}
                onClick={() =>
                  createScenario.mutate(
                    { lessonId },
                    { onSuccess: (scenario) => navigate(`/authoring/scenarios/${scenario.id}`) },
                  )
                }
              >
                {createScenario.isPending
                  ? "Creating…"
                  : lesson.data.scenarios.length
                    ? "Start a new practical version"
                    : "Build the practical"}
              </button>
              {!lesson.data.competencies.length ? (
                <p className="field-note">Map the lesson to a competency first.</p>
              ) : null}
              {createScenario.isError ? (
                <p className="form-error" role="alert">
                  {describeApiError(createScenario.error, "The practical could not be created.")}
                </p>
              ) : null}
            </section>
            <section className="studio-side-panel" aria-labelledby="lesson-history-heading">
              <h2 id="lesson-history-heading">Review history</h2>
              {history.data?.length ? (
                <ol className="studio-history">
                  {history.data.map((entry) => (
                    <li key={entry.id}>
                      <span className="studio-history-what">
                        <strong>{entry.summary}</strong> · {entry.subject}
                      </span>
                      <span className="studio-history-who">
                        {entry.actorName} ·{" "}
                        {new Date(entry.occurredAt).toLocaleString(undefined, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {entry.reviewNotes ? <q>{entry.reviewNotes}</q> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="field-note">
                  {history.isError ? "History could not be loaded." : "No activity yet."}
                </p>
              )}
            </section>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
