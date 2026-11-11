import { Link } from "react-router-dom";

import type { Assignment } from "../api/learning";
import { useCurrentUser } from "../auth/useAuth";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { StatusPill } from "../components/ui/StatusPill";
import {
  attemptsUsed,
  dueRelative,
  dueState,
  formatDue,
  groupAssignments,
  hasAttemptsLeft,
  isCompleted,
  personalBests,
  practiceStreak,
} from "../learning/progress";
import { useAssignments } from "../learning/useAssignments";
import { useLocale } from "../i18n/LocaleProvider";
import "../styles/engagement.css";

function AssignmentCard({ assignment, best }: { assignment: Assignment; best?: number }) {
  const { t } = useLocale();
  const state = dueState(assignment);
  const used = attemptsUsed(assignment);
  const inProgress = assignment.latest_attempt?.status === "in_progress";
  const exhausted = !hasAttemptsLeft(assignment);

  return (
    <article className={`assignment-card${state === "overdue" ? " is-overdue" : ""}`}>
      <div className="assignment-meta">
        <span>{assignment.lesson.trade}</span>
        <StatusPill status={assignment.latest_attempt?.status} />
      </div>
      <h3>{assignment.lesson.title}</h3>
      <p>{assignment.lesson.summary}</p>

      {assignment.due_at ? (
        <p className={`assignment-due due-${state}`}>
          <strong>{state === "overdue" ? "Overdue" : "Due"}</strong> {formatDue(assignment.due_at)}
          <small>{dueRelative(assignment.due_at)}</small>
        </p>
      ) : null}

      <dl>
        <div>
          <dt>{t("learn.course")}</dt>
          <dd>{assignment.lesson.course_title}</dd>
        </div>
        <div>
          <dt>{t("learn.attempts")}</dt>
          <dd>
            {used}/{assignment.attempt_limit}
          </dd>
        </div>
        <div>
          <dt>{t("learn.best")}</dt>
          <dd>{best === undefined ? "—" : `${Math.round(best)}%`}</dd>
        </div>
      </dl>

      <Link className="button button-primary" to={`/assignments/${assignment.id}`}>
        {inProgress
          ? t("learn.continueLesson")
          : exhausted
            ? t("learn.practiseAgain")
            : t("learn.openLesson")}
      </Link>
    </article>
  );
}

export function LearnerDashboardPage() {
  const user = useCurrentUser().data;
  const displayName = user?.firstName || user?.username || "learner";
  const assignments = useAssignments();
  const { t } = useLocale();

  return (
    <section className="dashboard">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">{t("learn.eyebrow")}</div>
          <h1>{t("learn.greeting", { name: displayName })}</h1>
          <p>{t("learn.lead")}</p>
        </div>
        <Link className="button button-secondary" to="/learn/catalogue">
          {t("learn.findMore")}
        </Link>
      </div>

      <QueryBoundary
        query={assignments}
        loading="Loading assignments…"
        error="Assignments could not be loaded."
        empty={{
          title: "No lessons yet",
          description:
            "Lessons your instructor assigns appear here. You can also pick a lesson yourself.",
          symbol: "⚙",
          action: (
            <Link className="button button-primary" to="/learn/catalogue">
              Find a lesson
            </Link>
          ),
        }}
      >
        {(items) => {
          const resume = items.find(
            (assignment) => assignment.latest_attempt?.status === "in_progress",
          );
          const bests = personalBests(items);
          const streak = practiceStreak(
            items.flatMap((item) =>
              (item.attempt_history ?? []).map((attempt) => attempt.started_at),
            ),
          );
          const finished = items.filter(isCompleted).length;

          return (
            <>
              <ul className="learner-stats" aria-label="Your progress at a glance">
                <li>
                  <strong>{streak}</strong>
                  <span>{streak === 1 ? t("learn.dayInRow") : t("learn.daysInRow")}</span>
                </li>
                <li>
                  <strong>
                    {finished}/{items.length}
                  </strong>
                  <span>{t("learn.lessonsFinished")}</span>
                </li>
                <li>
                  <strong>
                    {bests.size ? `${Math.round(Math.max(...bests.values()))}%` : "—"}
                  </strong>
                  <span>{t("learn.bestScore")}</span>
                </li>
              </ul>

              {resume ? (
                <section className="resume-band">
                  <div>
                    <span className="eyebrow">{t("learn.continueTitle")}</span>
                    <h2>{resume.lesson.title}</h2>
                    <p>
                      {resume.latest_attempt?.is_practice ? "Practice run" : "Attempt"} saved.{" "}
                      {resume.latest_attempt?.resume_state?.completedSteps?.length ?? 0} of{" "}
                      {resume.lesson.procedure_steps.length} steps done.
                    </p>
                  </div>
                  <Link
                    className="button button-primary"
                    to={`/attempts/${resume.latest_attempt?.id}`}
                  >
                    {t("learn.resume")}
                  </Link>
                </section>
              ) : null}

              {groupAssignments(items).map((group) => (
                <section className="assignment-group" key={group.key}>
                  <div className="assignment-group-heading">
                    <h2>{group.title}</h2>
                    <p>{group.description}</p>
                  </div>
                  <div className="assignment-grid">
                    {group.assignments.map((assignment) => (
                      <AssignmentCard
                        key={assignment.id}
                        assignment={assignment}
                        best={bests.get(assignment.lesson.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
