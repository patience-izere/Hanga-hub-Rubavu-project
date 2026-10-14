import { useState } from "react";
import { Link } from "react-router-dom";

import { describeApiError } from "../api/client";
import type { AuthoredScenario, AuthoringCourse, AuthoringLesson } from "../api/content";
import { useCurrentUser } from "../auth/useAuth";
import { useRoles } from "../auth/useRoles";
import { ContentStatusBadge } from "../components/authoring/AuthoringFields";
import { CONTENT_STATUS_LABELS, type ContentStatus } from "../components/authoring/authoringLabels";
import { EmptyState } from "../components/ui/EmptyState";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import {
  useAuthoredScenarios,
  useAddCourseCompetency,
  useAddCourseModule,
  useAuthoringCourses,
  useAuthoringLessons,
  useCreateAuthoringCourse,
} from "../learning/useContentAuthoring";

/** Drafts first: a returned lesson is the thing an author must act on. */
const STATUS_ORDER: ContentStatus[] = ["draft", "review", "approved", "published", "retired"];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function LessonRow({ lesson }: { lesson: AuthoringLesson }) {
  const latest = [...lesson.scenarios].sort((a, b) => b.version - a.version)[0];
  return (
    <li>
      <Link className="studio-lesson-row" to={`/authoring/lessons/${lesson.id}`}>
        <span className="studio-lesson-main">
          <strong>{lesson.title}</strong>
          <span>
            {lesson.courseTitle}
            {lesson.authorName ? ` · ${lesson.authorName}` : ""}
          </span>
        </span>
        <span className="studio-lesson-meta">
          {lesson.status === "draft" && lesson.reviewNotes ? (
            <span className="returned-flag">Returned for revision</span>
          ) : null}
          <span>
            {latest
              ? `Practical v${latest.version} · ${CONTENT_STATUS_LABELS[latest.status].toLowerCase()}`
              : "No practical yet"}
          </span>
          <span>Updated {formatDate(lesson.updated_at)}</span>
        </span>
      </Link>
    </li>
  );
}

type QueueItem = {
  key: string;
  to: string;
  title: string;
  kind: "Lesson" | "Practical";
  status: "review" | "approved";
  authorName: string;
  isOwnWork: boolean;
  submittedAt: string | null;
};

function ReviewQueue({
  lessons,
  scenarios,
  userId,
}: {
  lessons: AuthoringLesson[];
  scenarios: AuthoredScenario[];
  userId: number | undefined;
}) {
  const waiting = (status: string): status is "review" | "approved" =>
    status === "review" || status === "approved";
  const items: QueueItem[] = [
    ...lessons
      .filter((lesson) => waiting(lesson.status))
      .map((lesson) => ({
        key: `lesson-${lesson.id}`,
        to: `/authoring/lessons/${lesson.id}`,
        title: lesson.title,
        kind: "Lesson" as const,
        status: lesson.status as "review" | "approved",
        authorName: lesson.authorName,
        isOwnWork: lesson.authoredBy === userId,
        submittedAt: lesson.submittedAt,
      })),
    ...scenarios
      .filter((scenario) => waiting(scenario.status))
      .map((scenario) => ({
        key: `scenario-${scenario.id}`,
        to: `/authoring/scenarios/${scenario.id}`,
        title: `${scenario.lessonTitle} · practical v${scenario.version}`,
        kind: "Practical" as const,
        status: scenario.status as "review" | "approved",
        authorName: scenario.authorName,
        isOwnWork: scenario.authoredBy === userId,
        submittedAt: scenario.submittedAt,
      })),
  ].sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));

  if (!items.length) return null;
  return (
    <section className="studio-review-queue" aria-labelledby="review-queue-heading">
      <div className="studio-section-heading">
        <h2 id="review-queue-heading">Waiting for review</h2>
        <span className="studio-count">{items.length}</span>
      </div>
      <ul className="studio-lesson-list">
        {items.map((item) => (
          <li key={item.key}>
            <Link className="studio-lesson-row" to={item.to}>
              <span className="studio-lesson-main">
                <strong>{item.title}</strong>
                <span>
                  {item.kind}
                  {item.authorName ? ` by ${item.authorName}` : ""}
                  {item.submittedAt ? ` · submitted ${formatDate(item.submittedAt)}` : ""}
                </span>
              </span>
              <span className="studio-lesson-meta">
                <ContentStatusBadge status={item.status} />
                <span>
                  {item.isOwnWork
                    ? "Your work: another reviewer decides"
                    : item.status === "review"
                      ? "Needs your review"
                      : "Ready to publish"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CourseCard({ course }: { course: AuthoringCourse }) {
  const addCompetency = useAddCourseCompetency();
  const addModule = useAddCourseModule();
  const [code, setCode] = useState("");
  const [competencyTitle, setCompetencyTitle] = useState("");
  const [moduleTitle, setModuleTitle] = useState("");

  return (
    <article className="studio-course-card">
      <header>
        <h3>{course.title}</h3>
        <span>
          {course.trade} · {course.lessonCount} {course.lessonCount === 1 ? "lesson" : "lessons"}
        </span>
      </header>
      <details>
        <summary>
          Competencies <span className="studio-count">{course.competencies.length}</span>
        </summary>
        {course.competencies.length ? (
          <ul className="studio-competency-list">
            {course.competencies.map((competency) => (
              <li key={competency.id}>
                <code>{competency.code}</code> {competency.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="field-note">
            Add the competencies this course assesses. Every practical step maps to at least one.
          </p>
        )}
        <form
          className="studio-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            addCompetency.mutate(
              { courseId: course.id, code, title: competencyTitle, description: "" },
              {
                onSuccess: () => {
                  setCode("");
                  setCompetencyTitle("");
                },
              },
            );
          }}
        >
          <label>
            Code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="ELEC-03"
              required
              maxLength={60}
            />
          </label>
          <label>
            What the learner can do
            <input
              value={competencyTitle}
              onChange={(event) => setCompetencyTitle(event.target.value)}
              placeholder="Isolate a circuit safely"
              required
              maxLength={180}
            />
          </label>
          <button
            className="button button-secondary studio-small-button"
            disabled={addCompetency.isPending}
          >
            Add competency
          </button>
          {addCompetency.isError ? (
            <p className="form-error" role="alert">
              {describeApiError(addCompetency.error, "The competency could not be added.")}
            </p>
          ) : null}
        </form>
      </details>
      <details>
        <summary>
          Modules <span className="studio-count">{course.modules.length}</span>
        </summary>
        {course.modules.length ? (
          <ol className="studio-competency-list">
            {course.modules.map((module) => (
              <li key={module.id}>{module.title}</li>
            ))}
          </ol>
        ) : (
          <p className="field-note">Modules group related lessons, for example "PV safety".</p>
        )}
        <form
          className="studio-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            addModule.mutate(
              { courseId: course.id, title: moduleTitle, description: "" },
              { onSuccess: () => setModuleTitle("") },
            );
          }}
        >
          <label>
            Module title
            <input
              value={moduleTitle}
              onChange={(event) => setModuleTitle(event.target.value)}
              required
              maxLength={180}
            />
          </label>
          <button
            className="button button-secondary studio-small-button"
            disabled={addModule.isPending}
          >
            Add module
          </button>
          {addModule.isError ? (
            <p className="form-error" role="alert">
              {describeApiError(addModule.error, "The module could not be added.")}
            </p>
          ) : null}
        </form>
      </details>
    </article>
  );
}

function NewCourseForm({ onDone }: { onDone: () => void }) {
  const create = useCreateAuthoringCourse();
  const [title, setTitle] = useState("");
  const [trade, setTrade] = useState("");
  return (
    <form
      className="studio-inline-form studio-new-course"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate({ title, trade, description: "" }, { onSuccess: onDone });
      }}
    >
      <label>
        Course title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={180}
        />
      </label>
      <label>
        Trade
        <input
          value={trade}
          onChange={(event) => setTrade(event.target.value)}
          placeholder="Electrical installation"
          required
          maxLength={120}
        />
      </label>
      <button className="button button-primary studio-small-button" disabled={create.isPending}>
        {create.isPending ? "Creating…" : "Create course"}
      </button>
      {create.isError ? (
        <p className="form-error" role="alert">
          {describeApiError(create.error, "The course could not be created.")}
        </p>
      ) : null}
    </form>
  );
}

export function StudioHomePage() {
  const lessons = useAuthoringLessons();
  const courses = useAuthoringCourses();
  const roles = useRoles();
  const userId = useCurrentUser().data?.id;
  const scenarios = useAuthoredScenarios();
  const [courseFilter, setCourseFilter] = useState(0);
  const [addingCourse, setAddingCourse] = useState(false);

  const visible = (lessons.data ?? []).filter(
    (lesson) => !courseFilter || lesson.course === courseFilter,
  );
  const returned = visible.filter((lesson) => lesson.status === "draft" && lesson.reviewNotes);
  const hasCourses = (courses.data ?? []).length > 0;

  return (
    <section className="dashboard studio-page">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">Module Development Studio</div>
          <h1>Build practical modules</h1>
          <p>
            Write the lesson, map it to course competencies, then build the steps learners carry
            out. A reviewer approves each lesson and practical before any learner sees it.
          </p>
        </div>
        <div className="studio-heading-actions">
          {hasCourses ? (
            <Link className="button button-primary" to="/authoring/lessons/new">
              New lesson
            </Link>
          ) : null}
          <Link className="button button-secondary" to="/authoring/assets">
            3D asset packages
          </Link>
        </div>
      </div>

      <ol className="studio-pipeline" aria-label="How a module reaches learners">
        <li>
          <strong>1. Lesson</strong>
          <span>Objectives, safety notes and competencies</span>
        </li>
        <li>
          <strong>2. Practical</strong>
          <span>The ordered steps a learner performs</span>
        </li>
        <li>
          <strong>3. Review</strong>
          <span>Another person checks safety and accuracy</span>
        </li>
        <li>
          <strong>4. Publish</strong>
          <span>Instructors can assign it</span>
        </li>
      </ol>

      {roles.canPublishContent ? (
        <ReviewQueue
          lessons={lessons.data ?? []}
          scenarios={scenarios.data ?? []}
          userId={userId}
        />
      ) : null}

      <div className="studio-home-grid">
        <div className="studio-lessons">
          <div className="studio-section-heading">
            <h2>Lessons</h2>
            {(courses.data ?? []).length > 1 ? (
              <label className="studio-filter">
                Course
                <select
                  value={courseFilter}
                  onChange={(event) => setCourseFilter(Number(event.target.value))}
                >
                  <option value={0}>All courses</option>
                  {(courses.data ?? []).map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {returned.length ? (
            <div className="returned-banner" role="status">
              <strong>
                {returned.length === 1
                  ? "1 lesson was returned for revision"
                  : `${returned.length} lessons were returned for revision`}
              </strong>
              <p>Open it to read the reviewer's notes.</p>
            </div>
          ) : null}
          <QueryBoundary
            query={lessons}
            loading="Loading lessons…"
            error="Lessons could not be loaded. Check your connection and try again."
          >
            {() =>
              visible.length === 0 ? (
                <EmptyState
                  title="No lessons yet"
                  description={
                    hasCourses
                      ? "Start with a lesson: what learners will be able to do, and how to stay safe."
                      : "Create a course and its competencies first, then add lessons to it."
                  }
                  action={
                    hasCourses ? (
                      <Link className="button button-primary" to="/authoring/lessons/new">
                        New lesson
                      </Link>
                    ) : null
                  }
                />
              ) : (
                <>
                  {STATUS_ORDER.map((status) => {
                    const group = visible.filter((lesson) => lesson.status === status);
                    if (!group.length) return null;
                    return (
                      <section className="studio-status-group" key={status}>
                        <h3>
                          <ContentStatusBadge status={status} /> {group.length}
                        </h3>
                        <ul className="studio-lesson-list">
                          {group.map((lesson) => (
                            <LessonRow key={lesson.id} lesson={lesson} />
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </>
              )
            }
          </QueryBoundary>
        </div>

        <aside className="studio-courses" aria-labelledby="studio-courses-heading">
          <div className="studio-section-heading">
            <h2 id="studio-courses-heading">Courses</h2>
            <button
              type="button"
              className="button button-secondary studio-small-button"
              onClick={() => setAddingCourse((value) => !value)}
              aria-expanded={addingCourse}
            >
              {addingCourse ? "Cancel" : "New course"}
            </button>
          </div>
          {addingCourse ? <NewCourseForm onDone={() => setAddingCourse(false)} /> : null}
          <QueryBoundary
            query={courses}
            loading="Loading courses…"
            error="Courses could not be loaded."
            empty={{
              title: "No courses yet",
              description: "Create your first course to start building lessons.",
            }}
          >
            {(items) => (
              <div className="studio-course-list">
                {items.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            )}
          </QueryBoundary>
        </aside>
      </div>
    </section>
  );
}
