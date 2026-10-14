import { Link, useParams } from "react-router-dom";

import type { AttemptDetail } from "../api/learning";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { attemptOutcomeLabel } from "../learning/labels";
import { attemptPassed } from "../learning/progress";
import { useAttempt } from "../learning/useAssignments";

const MASTERY_LABELS: Record<string, string> = {
  mastered: "Mastered",
  developing: "Developing",
  not_demonstrated: "Not demonstrated",
  requires_review: "Requires review",
};

/**
 * A completed attempt's evidence.
 *
 * Lives on its own route rather than inside the simulation so a learner can come back to a
 * result later, from the progress view or an instructor's feedback notification.
 */
function resultHeading(attempt: AttemptDetail, stepCount: number, incorrectCount: number) {
  const mistakes = `${incorrectCount} recorded incorrect ${incorrectCount === 1 ? "action" : "actions"}`;
  if (attempt.status === "requires_review") {
    return {
      kicker: "Waiting for instructor review",
      summary: `You completed all ${stepCount} procedure steps with ${mistakes}. A safety-critical error was recorded, so your instructor reviews this attempt before it counts towards your progress.`,
    };
  }
  if (attempt.status === "abandoned") {
    const evidenced = attempt.resume_state?.completedSteps?.length ?? 0;
    return {
      kicker: "Attempt ended",
      summary: `This attempt was ended after ${evidenced} of ${stepCount} steps, so it was not scored. Its evidence stays in your history.`,
    };
  }
  return {
    kicker: "Attempt complete",
    summary: `You completed all ${stepCount} procedure steps with ${mistakes}.`,
  };
}

export function AttemptResultBody({ attempt }: { attempt: AttemptDetail }) {
  const lesson = attempt.assignment.lesson;
  // Out-of-tolerance measurements are mistakes too; the server scores both.
  const incorrectCount = attempt.events.filter(
    (event) => event.event_type === "incorrect_action" || event.event_type === "tolerance_failed",
  ).length;
  const evidencedSteps = attempt.resume_state?.completedSteps?.length ?? 0;
  const stepTitles = new Map(lesson.procedure_steps.map((step) => [step.code, step.title]));
  const heading = resultHeading(attempt, lesson.procedure_steps.length, incorrectCount);
  const passed = attemptPassed({
    outcome: attempt.outcome,
    score: attempt.score,
    scenario: attempt.assignment.scenario,
  });
  const threshold = attempt.assignment.scenario?.grading_policy?.pass_threshold;
  const stepsToReview = (attempt.step_results ?? []).filter(
    (result) =>
      result.outcome !== "passed" || result.hints_used > 0 || result.safety_violations > 0,
  );

  return (
    <div className="result-card">
      <span className="result-kicker">{heading.kicker}</span>
      <div className="result-score" aria-label={`Score ${attempt.score ?? "pending"} percent`}>
        <strong>{attempt.score === null ? "—" : Number(attempt.score)}</strong>
        <span>%</span>
      </div>
      <h1>{lesson.title}</h1>
      <p>{heading.summary}</p>

      <div className="result-evidence">
        <div>
          <strong>{evidencedSteps}</strong>
          <span>steps evidenced</span>
        </div>
        <div>
          <strong>{incorrectCount}</strong>
          <span>actions to review</span>
        </div>
        <div>
          {/* Outcome comes from the server's grading policy, never a score-string comparison. */}
          <strong className={passed === false ? "result-negative" : undefined}>
            {attemptOutcomeLabel(attempt.outcome)}
          </strong>
          <span>result</span>
        </div>
      </div>

      <p className="result-note">
        Your score is calculated on the server from the actions you saved, and safety-order errors
        carry a larger penalty.
        {threshold != null ? ` The pass mark for this lesson is ${threshold}%.` : ""}
      </p>

      {(attempt.competency_results ?? []).length > 0 ? (
        <div className="result-feedback">
          <strong>Competency evidence</strong>
          <ul className="result-competencies">
            {attempt.competency_results.map((result) => (
              <li key={result.competency_code} className={`mastery-${result.mastery_state}`}>
                <span>{result.competency_code}</span>
                <span>
                  {Math.round(Number(result.mastery_percentage))}% of {result.mastery_threshold}%
                  needed
                </span>
                <strong>
                  {MASTERY_LABELS[result.mastery_state] ??
                    result.mastery_state.replaceAll("_", " ")}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stepsToReview.length > 0 ? (
        <div className="result-feedback">
          <strong>Steps to review</strong>
          <ul>
            {stepsToReview.map((result) => (
              <li key={result.step_code}>
                {stepTitles.get(result.step_code) ?? result.step_code}:{" "}
                {result.outcome.replaceAll("_", " ")} · {result.hints_used}{" "}
                {result.hints_used === 1 ? "hint" : "hints"} · {result.safety_violations} safety{" "}
                {result.safety_violations === 1 ? "violation" : "violations"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {attempt.recommendation && (
        <div className="result-recommendation">
          <strong>Recommended next action</strong>
          <p>{attempt.recommendation.rationale}</p>
          {attempt.recommendation.override_kind ? (
            <p>
              Instructor decision: {attempt.recommendation.override_kind.replaceAll("_", " ")}.{" "}
              {attempt.recommendation.override_reason}
            </p>
          ) : null}
          <small>Rule: {attempt.recommendation.rule_version}</small>
        </div>
      )}

      {attempt.feedback.length > 0 && (
        <div className="result-feedback">
          <strong>Instructor feedback</strong>
          {attempt.feedback.map((item) => (
            <blockquote key={item.id}>{item.feedback}</blockquote>
          ))}
        </div>
      )}

      <Link className="button button-primary" to="/learn">
        Return to my learning
      </Link>
      <Link className="button button-secondary" to={`/assignments/${attempt.assignment.id}`}>
        Back to the lesson
      </Link>
      <Link
        className="button button-secondary"
        to={`/research/survey?scenarioVersion=${attempt.scenario_version}`}
      >
        Complete optional pilot evaluation
      </Link>
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
