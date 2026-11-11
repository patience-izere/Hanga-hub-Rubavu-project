import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { User } from "../api/client";
import { describeApiError } from "../api/client";
import {
  enrollInLesson,
  getPublicCourse,
  listPublicCourses,
  type CourseAccess,
  type PublicCourse,
} from "../api/open";
import { EmptyState } from "../components/ui/EmptyState";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import "../styles/courses.css";

/** What each access level means to a visitor, in plain words. */
export const ACCESS_INFO: Record<CourseAccess, { badge: string; explain: string }> = {
  public: {
    badge: "Open to everyone",
    explain:
      "Try the lessons now, no account needed. Your progress is not saved; create a free account to keep it.",
  },
  account: {
    badge: "Free account",
    explain: "Create a free account or sign in to take this course. Your progress is saved.",
  },
  members: {
    badge: "School members",
    explain:
      "For learners of the school that runs it. Your instructor gives you access, or a class code.",
  },
};

export function AccessBadge({ access }: { access: CourseAccess | undefined }) {
  // Courses saved before access levels existed count as members-only, as the migration set them.
  const level = access && access in ACCESS_INFO ? access : "members";
  return <span className={`access-badge access-${level}`}>{ACCESS_INFO[level].badge}</span>;
}

function facts(course: PublicCourse): string[] {
  return [
    course.levelLabel,
    course.durationHours
      ? `About ${course.durationHours} hour${course.durationHours === 1 ? "" : "s"}`
      : course.minutes
        ? `About ${course.minutes} minutes`
        : "",
    `${course.lessonCount} lesson${course.lessonCount === 1 ? "" : "s"}`,
    course.ageGroup ? `Ages: ${course.ageGroup}` : "",
  ].filter(Boolean);
}

export function CoursesPage() {
  const courses = useQuery({ queryKey: ["public", "courses"], queryFn: listPublicCourses });
  const [access, setAccess] = useState<"" | CourseAccess>("");
  const [trade, setTrade] = useState("");
  const [level, setLevel] = useState("");
  const all = useMemo(() => courses.data ?? [], [courses.data]);
  const trades = [...new Set(all.map((course) => course.trade))].sort();
  const visible = all.filter(
    (course) =>
      (!access || course.access === access) &&
      (!trade || course.trade === trade) &&
      (!level || course.level === level),
  );

  return (
    <div className="public-page courses-page">
      <section className="public-hero">
        <div>
          <span className="eyebrow">Courses</span>
          <h1>Practise a trade before you touch the machine.</h1>
        </div>
        <div className="public-hero-aside">
          <p>
            Each course shows who can take it: open to everyone without an account, free with an
            account so your progress is saved, or reserved for learners of a school.
          </p>
        </div>
      </section>

      <section className="public-section">
        <dl className="access-legend">
          {(Object.keys(ACCESS_INFO) as CourseAccess[]).map((key) => (
            <div key={key}>
              <dt>
                <AccessBadge access={key} />
              </dt>
              <dd>{ACCESS_INFO[key].explain}</dd>
            </div>
          ))}
        </dl>

        <QueryBoundary
          query={courses}
          loading="Loading courses…"
          error="Courses could not be loaded."
          empty={{
            title: "No courses published yet",
            description: "Courses appear here as soon as they are published.",
          }}
        >
          {() => (
            <>
              <div className="course-filters">
                <label>
                  Who can take it
                  <select
                    value={access}
                    onChange={(event) => setAccess(event.target.value as typeof access)}
                  >
                    <option value="">Everyone and members</option>
                    <option value="public">Open to everyone</option>
                    <option value="account">Free account</option>
                    <option value="members">School members</option>
                  </select>
                </label>
                <label>
                  Trade
                  <select value={trade} onChange={(event) => setTrade(event.target.value)}>
                    <option value="">All trades</option>
                    {trades.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Level
                  <select value={level} onChange={(event) => setLevel(event.target.value)}>
                    <option value="">All levels</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </label>
                <span className="roster-count" aria-live="polite">
                  {visible.length} course{visible.length === 1 ? "" : "s"}
                </span>
              </div>
              {visible.length === 0 ? (
                <EmptyState
                  title="No course matches these filters"
                  action={
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setAccess("");
                        setTrade("");
                        setLevel("");
                      }}
                    >
                      Show all courses
                    </button>
                  }
                />
              ) : (
                <ul className="course-grid">
                  {visible.map((course) => (
                    <li key={course.slug} className="course-card">
                      <div className="course-card-top">
                        <span className="eyebrow">{course.trade}</span>
                        <AccessBadge access={course.access} />
                      </div>
                      <h2>
                        <Link to={`/courses/${course.slug}`}>{course.title}</Link>
                      </h2>
                      <p>{course.summary}</p>
                      <ul className="course-facts">
                        {facts(course).map((fact) => (
                          <li key={fact}>{fact}</li>
                        ))}
                      </ul>
                      <small>By {course.provider}</small>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </QueryBoundary>
      </section>
    </div>
  );
}

export function CourseDetailPage({ user }: { user: User | null }) {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const course = useQuery({
    queryKey: ["public", "course", slug],
    queryFn: () => getPublicCourse(slug),
    retry: false,
  });
  const enrol = useMutation({
    mutationFn: enrollInLesson,
    onSuccess: (assignmentId) => navigate(`/assignments/${assignmentId}`),
  });

  return (
    <div className="public-page course-detail-page">
      <QueryBoundary
        query={course}
        loading="Loading the course…"
        error="This course does not exist or is not published."
      >
        {(data) => (
          <>
            <section className="course-detail-head">
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                  <li>
                    <Link to="/courses">Courses</Link>
                  </li>
                  <li>
                    <span aria-current="page">{data.title}</span>
                  </li>
                </ol>
              </nav>
              <span className="eyebrow">{data.trade}</span>
              <h1>{data.title}</h1>
              <p className="course-lead">{data.summary}</p>
              <div className="course-access-callout">
                <AccessBadge access={data.access} />
                <p>{ACCESS_INFO[data.access].explain}</p>
                {data.access === "members" ? (
                  user ? (
                    <Link className="button button-secondary" to="/learn">
                      Go to my lessons
                    </Link>
                  ) : (
                    <Link className="button button-secondary" to="/class">
                      I have a class code
                    </Link>
                  )
                ) : !user && data.access === "account" ? (
                  <div className="button-row">
                    <Link className="button button-primary" to="/register">
                      Create a free account
                    </Link>
                    <Link
                      className="button button-secondary"
                      to="/login"
                      state={{ from: `/courses/${data.slug}` }}
                    >
                      Sign in
                    </Link>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="course-detail-body">
              <div className="course-detail-main">
                {data.description ? (
                  <>
                    <h2>About this course</h2>
                    <p className="course-description">{data.description}</p>
                  </>
                ) : null}
                {data.outcomes.length ? (
                  <>
                    <h2>What you will be able to do</h2>
                    <ul className="course-outcomes">
                      {data.outcomes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <h2>Lessons</h2>
                {data.lessons.length === 0 ? (
                  <p className="field-note">Lessons for this course are being prepared.</p>
                ) : (
                  <ol className="course-lessons">
                    {data.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <div>
                          {lesson.module ? <small>{lesson.module}</small> : null}
                          <strong>{lesson.title}</strong>
                          <p>{lesson.summary}</p>
                          <small>
                            About {lesson.minutes} min · {lesson.language}
                          </small>
                        </div>
                        <div className="course-lesson-actions">
                          {lesson.canTry ? (
                            <Link
                              className="button button-primary"
                              to={`/courses/${data.slug}/lessons/${lesson.id}/try`}
                            >
                              Try it now
                            </Link>
                          ) : null}
                          {user && lesson.canEnrol ? (
                            <button
                              type="button"
                              className="button button-secondary"
                              disabled={enrol.isPending}
                              onClick={() => enrol.mutate(lesson.id)}
                            >
                              {enrol.isPending && enrol.variables === lesson.id
                                ? "Adding…"
                                : "Add to my lessons"}
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                {enrol.isError ? (
                  <p className="form-error" role="alert">
                    {describeApiError(enrol.error, "The lesson could not be added. Try again.")}
                  </p>
                ) : null}
              </div>

              <aside className="course-detail-facts" aria-label="Course details">
                <dl>
                  <div>
                    <dt>Level</dt>
                    <dd>{data.levelLabel}</dd>
                  </div>
                  {data.ageGroup ? (
                    <div>
                      <dt>Age group</dt>
                      <dd>{data.ageGroup}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Time</dt>
                    <dd>
                      {data.durationHours
                        ? `About ${data.durationHours} hour${data.durationHours === 1 ? "" : "s"}`
                        : `About ${data.minutes} minutes`}
                      , {data.lessonCount} lesson{data.lessonCount === 1 ? "" : "s"}
                    </dd>
                  </div>
                  {data.language ? (
                    <div>
                      <dt>Language</dt>
                      <dd>{data.language}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>How it is taught</dt>
                    <dd>{data.deliveryLabel}</dd>
                  </div>
                  <div>
                    <dt>Provided by</dt>
                    <dd>{data.provider}</dd>
                  </div>
                </dl>
                {data.prerequisites.length ? (
                  <>
                    <h2>Before you start</h2>
                    <ul>
                      {data.prerequisites.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {data.requirements.length ? (
                  <>
                    <h2>What you need</h2>
                    <ul>
                      {data.requirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <h2>Certificates</h2>
                <p>
                  {data.recognition ||
                    "OPedu does not issue certificates. Your practice record shows what you did in the virtual workshop."}{" "}
                  <Link to="/disclaimer">Read the disclaimer</Link>.
                </p>
              </aside>
            </section>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
