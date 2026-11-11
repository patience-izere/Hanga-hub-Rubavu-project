import { useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { AttemptDetail } from "../api/learning";
import { useCurrentUser } from "../auth/useAuth";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { attemptOutcomeLabel } from "../learning/labels";
import { attemptPassed } from "../learning/progress";
import { useAttempt, useStartAssignment } from "../learning/useAssignments";
import { useLocale, type MessageValues } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages";
import { formatDuration } from "../procedure/engine";
import { cue } from "../procedure/sensory";
import "../styles/engagement.css";

const MASTERY_LABELS: Record<string, string> = {
  mastered: "Mastered",
  developing: "Still developing",
  not_demonstrated: "Not shown yet",
  requires_review: "Waiting for review",
};

/**
 * A completed attempt's evidence.
 *
 * Lives on its own route rather than inside the simulation so a learner can come back to a
 * result later, from the progress view or an instructor's feedback notification.
 */
function resultHeading(
  attempt: AttemptDetail,
  passed: boolean | null,
  mistakes: number,
  t: (key: MessageKey, values?: MessageValues) => string,
) {
  const steps = attempt.assignment.lesson.procedure_steps.length;
  if (attempt.status === "requires_review") {
    return {
      kicker: "Waiting for instructor review",
      title: "Your instructor will look at this one",
      summary: `You finished all ${steps} steps, but a safety step went wrong along the way. Your instructor reviews the attempt before it counts.`,
    };
  }
  if (attempt.status === "abandoned") {
    const evidenced = attempt.resume_state?.completedSteps?.length ?? 0;
    return {
      kicker: "Attempt ended",
      title: "You stopped this one early",
      summary: `It was ended after ${evidenced} of ${steps} steps, so it was not scored.`,
    };
  }
  return {
    kicker: attempt.is_practice ? t("result.practiceComplete") : t("result.attemptComplete"),
    title:
      passed === false
        ? t("result.notYet")
        : mistakes === 0
          ? t("result.cleanRun")
          : t("result.wellDone"),
    summary:
      mistakes === 0
        ? t("result.noMistakes", { steps })
        : mistakes === 1
          ? t("result.oneMistake", { steps })
          : t("result.manyMistakes", { steps, count: mistakes }),
  };
}

function TryAgain({ attempt }: { attempt: AttemptDetail }) {
  const navigate = useNavigate();
  const { t } = useLocale();
  const start = useStartAssignment(attempt.assignment.id);
  const used = (attempt.assignment.attempt_history ?? []).filter(
    (item) => !item.is_practice,
  ).length;
  const assessedLeft = used < attempt.assignment.attempt_limit;
  const go = (practice: boolean) =>
    start.mutate(practice, { onSuccess: (next) => navigate(`/attempts/${next.id}`) });
  return (
    <div className="result-actions">
      <button
        className="button button-primary"
        type="button"
        disabled={start.isPending}
        onClick={() => go(true)}
      >
        {t("result.practiseAgain")}
      </button>
      {!attempt.is_practice && assessedLeft && attempt.status !== "requires_review" ? (
        <Link className="button button-secondary" to={`/assignments/${attempt.assignment.id}`}>
          {t("result.tryAssessed")}
        </Link>
      ) : null}
      {start.isError ? (
        <p className="form-error" role="alert">
          Finish the attempt you already have open first, from the lesson page.
        </p>
      ) : null}
    </div>
  );
}

export function AttemptResultBody({ attempt }: { attempt: AttemptDetail }) {
  const user = useCurrentUser().data;
  const { t } = useLocale();
  const lesson = attempt.assignment.lesson;
  // Out-of-tolerance measurements are mistakes too; the server scores both.
  const mistakeEvents = attempt.events.filter(
    (event) => event.event_type === "incorrect_action" || event.event_type === "tolerance_failed",
  );
  const incorrectCount = mistakeEvents.length;
  const evidencedSteps = attempt.resume_state?.completedSteps?.length ?? 0;
  const passed = attemptPassed({
    outcome: attempt.outcome,
    score: attempt.score,
    scenario: attempt.assignment.scenario,
  });
  const heading = resultHeading(attempt, passed, incorrectCount, t);
  const threshold = attempt.assignment.scenario?.grading_policy?.pass_threshold;
  const results = new Map((attempt.step_results ?? []).map((result) => [result.step_code, result]));
  const competencyTitles = new Map(lesson.competencies.map((item) => [item.code, item.title]));
  const seconds =
    attempt.completed_at && attempt.started_at
      ? (new Date(attempt.completed_at).getTime() - new Date(attempt.started_at).getTime()) / 1000
      : null;
  const certificateEarned =
    !attempt.is_practice &&
    attempt.review_decision !== "not_yet_competent" &&
    (attempt.review_decision === "competent" ||
      (attempt.status === "completed" && passed === true));

  const celebrated = useRef(false);
  useEffect(() => {
    if (celebrated.current || attempt.status !== "completed") return;
    celebrated.current = true;
    if (passed) cue("complete");
  }, [attempt.status, passed]);

  return (
    <div className={`result-card${passed ? " is-passed" : ""}`}>
      <span className="result-kicker">{heading.kicker}</span>
      {attempt.is_practice ? (
        <span className="result-practice">{t("result.practiceBadge")}</span>
      ) : null}
      <h1>{heading.title}</h1>
      <div className="result-score" aria-label={`Score ${attempt.score ?? "pending"} percent`}>
        <strong>{attempt.score === null ? "—" : Math.round(Number(attempt.score))}</strong>
        <span>%</span>
      </div>
      <p className="result-lesson">{lesson.title}</p>
      <p>{heading.summary}</p>

      {attempt.review_decision ? (
        <div className="result-feedback" role="status">
          <strong>
            {attempt.review_decision === "competent"
              ? "Your instructor reviewed this attempt and accepted the result"
              : "Your instructor reviewed this attempt: practise it again before it counts"}
          </strong>
          {attempt.review_note ? <blockquote>{attempt.review_note}</blockquote> : null}
          {attempt.reviewed_by_name ? <small>{attempt.reviewed_by_name}</small> : null}
        </div>
      ) : null}

      <div className="result-evidence">
        <div>
          <strong>{evidencedSteps}</strong>
          <span>{t("result.stepsDone")}</span>
        </div>
        <div>
          <strong>{incorrectCount}</strong>
          <span>{t("result.mistakes")}</span>
        </div>
        <div>
          <strong>{seconds === null ? "—" : formatDuration(seconds)}</strong>
          <span>{t("result.time")}</span>
        </div>
        <div>
          {/* Outcome comes from the server's grading policy, never a score-string comparison. */}
          <strong className={passed === false ? "result-negative" : undefined}>
            {attemptOutcomeLabel(attempt.outcome)}
          </strong>
          <span>{t("result.result")}</span>
        </div>
      </div>

      <TryAgain attempt={attempt} />

      {certificateEarned ? (
        <Link className="result-certificate" to={`/learn/attempts/${attempt.id}/certificate`}>
          <span aria-hidden="true">★</span> {t("result.certificate")}
        </Link>
      ) : null}

      {attempt.status !== "abandoned" ? (
        <section className="result-replay" aria-labelledby="replay-title">
          <h2 id="replay-title">{t("result.stepByStep")}</h2>
          <ol>
            {lesson.procedure_steps.map((step) => {
              const result = results.get(step.code);
              const stepMistakes = mistakeEvents.filter(
                (event) => event.payload.expectedStepCode === step.code,
              );
              const clean = result?.outcome === "passed" && stepMistakes.length === 0;
              return (
                <li key={step.code} className={clean ? "is-clean" : "is-review"}>
                  <span className="replay-mark" aria-hidden="true">
                    {clean ? "✓" : "!"}
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    {clean ? (
                      <small>
                        {t("result.rightFirst")}
                        {result?.hints_used ? " (+ hint)" : ""}
                      </small>
                    ) : (
                      <small>
                        {stepMistakes.length} {stepMistakes.length === 1 ? "mistake" : "mistakes"}
                        {result?.safety_violations ? " · safety step" : ""}
                        {result?.hints_used
                          ? ` · ${result.hints_used} ${result.hints_used === 1 ? "hint" : "hints"}`
                          : ""}
                      </small>
                    )}
                    {stepMistakes
                      .map((event) => step.mistakes?.[String(event.payload.action)]?.message)
                      .filter(Boolean)
                      .slice(0, 1)
                      .map((message) => (
                        <p key={message}>{message}</p>
                      ))}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="result-note">
            Your score is worked out on the server from the actions you took. Safety mistakes cost
            more.
            {threshold != null ? ` You need ${threshold}% to pass this lesson.` : ""}
          </p>
        </section>
      ) : null}

      {(attempt.competency_results ?? []).length > 0 ? (
        <div className="result-feedback">
          <strong>Skills</strong>
          <ul className="result-competencies">
            {attempt.competency_results.map((result) => (
              <li key={result.competency_code} className={`mastery-${result.mastery_state}`}>
                <span>
                  {competencyTitles.get(result.competency_code) ?? result.competency_code}
                </span>
                <span>
                  {Math.round(Number(result.mastery_percentage))}% of {result.mastery_threshold}%
                  needed
                </span>
                <strong>
                  {result.mastery_state === "requires_review" && attempt.review_decision
                    ? "Reviewed by your instructor"
                    : (MASTERY_LABELS[result.mastery_state] ??
                      result.mastery_state.replaceAll("_", " "))}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {attempt.recommendation && !attempt.is_practice ? (
        <div className="result-recommendation">
          <strong>What to do next</strong>
          <p>{attempt.recommendation.rationale}</p>
          {attempt.recommendation.override_kind ? (
            <p>
              Instructor decision: {attempt.recommendation.override_kind.replaceAll("_", " ")}.{" "}
              {attempt.recommendation.override_reason}
            </p>
          ) : null}
        </div>
      ) : null}

      {attempt.feedback.length > 0 && (
        <div className="result-feedback">
          <strong>Instructor feedback</strong>
          {attempt.feedback.map((item) => (
            <blockquote key={item.id}>{item.feedback}</blockquote>
          ))}
        </div>
      )}

      <div className="result-links">
        <Link to="/learn">{t("result.backToLearning")}</Link>
        <Link to={`/assignments/${attempt.assignment.id}`}>{t("result.backToLesson")}</Link>
        {user?.features?.research ? (
          <Link to={`/research/survey?scenarioVersion=${attempt.scenario_version}`}>
            Complete optional pilot evaluation
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function AttemptResultPage() {
  const attemptId = Number(useParams().attemptId);
  const attempt = useAttempt(attemptId);

  return (
    <section className="result-page">
      <QueryBoundary
        query={attempt}
        loading="Loading your result…"
        error="This result is unavailable."
      >
        {(data) =>
          data.status === "in_progress" ? (
            <div className="result-card">
              <h1>This attempt is still open</h1>
              <p>Return to the workshop to finish it, then your result will appear here.</p>
              <Link className="button button-primary" to={`/attempts/${data.id}`}>
                Resume attempt
              </Link>
            </div>
          ) : (
            <AttemptResultBody attempt={data} />
          )
        }
      </QueryBoundary>
    </section>
  );
}
