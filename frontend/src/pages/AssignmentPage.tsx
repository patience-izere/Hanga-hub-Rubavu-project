import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, describeApiError } from "../api/client";
import type { Assignment, KnowledgeCheckSubmission } from "../api/learning";
import {
  useAssignment,
  useKnowledgeCheck,
  useSaveKnowledgeCheck,
  useStartAssignment,
} from "../learning/useAssignments";
import { downloadAssignmentAssets, removeAssignmentAssets } from "../offline/outbox";
import { dueRelative, dueState, formatDue } from "../learning/progress";
import { useLocale } from "../i18n/LocaleProvider";
import "../styles/engagement.css";

/** Lessons authored before quizzes existed keep the self-declared readiness check. */
const READINESS_STATEMENTS: Array<[string, string]> = [
  ["ppe", "I can identify the required personal protective equipment."],
  ["isolation", "I know the equipment must be made safe before measurement."],
  ["meter", "I can select the correct meter mode and range."],
];

function KnowledgeCheck({
  assignment,
  saved,
}: {
  assignment: Assignment;
  saved: KnowledgeCheckSubmission | null | undefined;
}) {
  const save = useSaveKnowledgeCheck(assignment.id);
  const { t } = useLocale();
  const questions = assignment.scenario.knowledge_check ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [readiness, setReadiness] = useState<Record<string, boolean>>({});

  if (saved) {
    const results = saved.results ?? [];
    const wrong = results.filter((item) => !item.correct);
    return (
      <div className="brief-check-done" role="status">
        <p className="knowledge-check-complete">
          {questions.length
            ? t("brief.quizDone", { right: results.length - wrong.length, total: results.length })
            : `Saved · ${Number(saved.score)}% readiness. It helps you prepare; it is not part of your score.`}
        </p>
        {wrong.length ? (
          <ul className="brief-explanations">
            {wrong.map((item) => {
              const question = questions.find((entry) => entry.code === item.questionCode);
              const answer = question?.options.find((option) => option.code === item.correctOption);
              return (
                <li key={item.questionCode}>
                  <strong>{question?.prompt}</strong>
                  <span>
                    {t("brief.answer", { answer: answer?.label ?? "" })} {item.explanation}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    );
  }

  if (questions.length) {
    const complete = questions.every((question) => answers[question.code]);
    return (
      <form
        className="brief-quiz"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(
            questions.map((question) => ({
              questionCode: question.code,
              response: answers[question.code],
            })),
          );
        }}
      >
        {questions.map((question, index) => (
          <fieldset key={question.code}>
            <legend>
              {index + 1}. {question.prompt}
            </legend>
            {question.options.map((option) => (
              <label
                key={option.code}
                className={answers[question.code] === option.code ? "is-chosen" : undefined}
              >
                <input
                  type="radio"
                  name={question.code}
                  value={option.code}
                  checked={answers[question.code] === option.code}
                  onChange={() =>
                    setAnswers((current) => ({ ...current, [question.code]: option.code }))
                  }
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        ))}
        {save.isError ? (
          <p className="form-error" role="alert">
            {describeApiError(save.error, "Your answers could not be saved.")}
          </p>
        ) : null}
        <button className="button button-primary" disabled={!complete || save.isPending}>
          {save.isPending ? t("brief.checking") : t("brief.checkAnswers")}
        </button>
      </form>
    );
  }

  return (
    <form
      className="brief-quiz"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(
          READINESS_STATEMENTS.map(([questionCode]) => ({
            questionCode,
            response: readiness[questionCode] === true,
          })),
        );
      }}
    >
      {READINESS_STATEMENTS.map(([code, label]) => (
        <label key={code} className="brief-statement">
          <input
            type="checkbox"
            checked={readiness[code] === true}
            onChange={(event) =>
              setReadiness((current) => ({ ...current, [code]: event.target.checked }))
            }
          />
          {label}
        </label>
      ))}
      <button className="button button-secondary" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save knowledge check"}
      </button>
    </form>
  );
}

export function AssignmentPage() {
  const assignmentId = Number(useParams().assignmentId);
  const navigate = useNavigate();
  const { t } = useLocale();
  const assignment = useAssignment(assignmentId);
  const start = useStartAssignment(assignmentId);
  const knowledgeCheck = useKnowledgeCheck(assignmentId);
  const [offlineStatus, setOfflineStatus] = useState("");
  const [offlineInstalled, setOfflineInstalled] = useState(false);
  const [installedVersion, setInstalledVersion] = useState<number | null>(null);
  const [assetQuality, setAssetQuality] = useState<"low" | "medium" | "high">("low");
  const [storageAvailableMb, setStorageAvailableMb] = useState<number | null>(null);

  useEffect(() => {
    let installed: string | null = null;
    try {
      installed = localStorage.getItem(`opedu:installed-assignment:${assignmentId}`);
    } catch {
      installed = null;
    }
    setOfflineInstalled(Boolean(installed));
    if (installed) {
      try {
        setInstalledVersion(
          (JSON.parse(installed) as { scenarioVersion?: number }).scenarioVersion ?? null,
        );
      } catch {
        setInstalledVersion(null);
      }
    }
    void navigator.storage?.estimate().then((estimate) => {
      if (estimate.quota) {
        setStorageAvailableMb(
          Math.max(0, Math.round((estimate.quota - (estimate.usage ?? 0)) / 1_048_576)),
        );
      }
    });
  }, [assignmentId]);

  if (assignment.isPending) {
    return <p className="panel-status">Loading lesson…</p>;
  }
  if (assignment.isError || !assignment.data) {
    return (
      <section className="lesson-page">
        <p className="form-error" role="alert">
          This assignment is unavailable.
        </p>
        <Link to="/learn">Return to my learning</Link>
      </section>
    );
  }

  const data = assignment.data;
  const { lesson, latest_attempt: latestAttempt } = data;
  const due = dueState(data);
  const assessedHistory = (data.attempt_history ?? []).filter((attempt) => !attempt.is_practice);
  const used = assessedHistory.length;
  const offlineStale =
    offlineInstalled && installedVersion !== null && installedVersion !== data.scenario.version;
  const activeAttempt = start.data?.status === "in_progress" ? start.data : latestAttempt;
  const attemptOpen = activeAttempt?.status === "in_progress";
  const remaining = Math.max(0, data.attempt_limit - used);
  const opensAt = data.available_at ? new Date(data.available_at) : null;
  const notOpenYet = opensAt !== null && opensAt > new Date();
  const checkDone = Boolean(knowledgeCheck.data);
  const bestScore = assessedHistory.reduce<number | null>(
    (best, attempt) => (attempt.score === null ? best : Math.max(best ?? 0, Number(attempt.score))),
    null,
  );
  const packageFiles = data.scenario.asset_package?.files ?? [];
  const qualityScene =
    packageFiles.find((file) =>
      [`scene-${assetQuality}`, `${assetQuality}-scene`].includes(file.role),
    ) ?? packageFiles.find((file) => file.role === "primary-scene");
  const downloadFiles = packageFiles.filter(
    (file) =>
      file === qualityScene || (!file.path.endsWith(".glb") && !file.path.endsWith(".gltf")),
  );
  const lessonAssets = [
    "/",
    "/manifest.webmanifest",
    "/opedu-icon.svg",
    ...downloadFiles.map((file) => ({ url: file.url, sha256: file.sha256 })),
  ];
  const downloadMb = downloadFiles.reduce((total, file) => total + file.byte_size, 0) / 1_048_576;
  const markerTarget =
    data.scenario.renderer_config?.marker_ar?.targetValue ||
    `OPEDU-${lesson.slug}-V${lesson.content_version}`;
  const requiredTools = [
    ...new Map(
      lesson.procedure_steps.flatMap((step) => step.tools ?? []).map((tool) => [tool.code, tool]),
    ).values(),
  ];
  const otherOpen = start.error instanceof ApiError && start.error.code === "other_attempt_open";

  function begin(practice: boolean) {
    start.mutate(practice, { onSuccess: (attempt) => navigate(`/attempts/${attempt.id}`) });
  }

  return (
    <section className="lesson-page brief">
      <Link className="back-link" to="/learn">
        ← {t("brief.back")}
      </Link>
      <header className="brief-header">
        <div>
          <div className="eyebrow">
            {lesson.trade} · {lesson.course_title}
          </div>
          <h1>{lesson.title}</h1>
          <p>{lesson.summary}</p>
        </div>
        <dl className="brief-facts">
          <div>
            <dt>{t("brief.time")}</dt>
            <dd>{t("brief.minutes", { n: lesson.estimated_minutes })}</dd>
          </div>
          <div>
            <dt>{t("brief.steps")}</dt>
            <dd>{lesson.procedure_steps.length}</dd>
          </div>
          {data.due_at ? (
            <div className={`due-${due}`}>
              <dt>{due === "overdue" ? "Overdue" : "Due"}</dt>
              <dd>
                {formatDue(data.due_at)}
                <small>{dueRelative(data.due_at)}</small>
              </dd>
            </div>
          ) : null}
          <div className={remaining === 0 && !attemptOpen ? "due-overdue" : undefined}>
            <dt>{t("brief.attempts")}</dt>
            <dd>
              {t("brief.attemptsUsed", { used, limit: data.attempt_limit })}
              <small>
                {remaining === 0
                  ? attemptOpen
                    ? "This is your last attempt"
                    : "No attempts left"
                  : t("brief.attemptsLeft", { n: remaining })}
              </small>
            </dd>
          </div>
          {bestScore !== null ? (
            <div>
              <dt>{t("brief.yourBest")}</dt>
              <dd>{Math.round(bestScore)}%</dd>
            </div>
          ) : null}
        </dl>
      </header>

      {data.instructions ? (
        <article className="lesson-panel instructions-panel">
          <h2>{t("brief.instructions")}</h2>
          <p>{data.instructions}</p>
        </article>
      ) : null}

      <ol className="brief-steps">
        <li className="brief-card">
          <span className="brief-number" aria-hidden="true">
            1
          </span>
          <div>
            <h2>{t("brief.whatYouDo")}</h2>
            <ul>
              {lesson.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
            {data.scenario.has_variants ? (
              <p className="field-note">{t("brief.variantsNote")}</p>
            ) : null}
            {lesson.competencies.length ? (
              <details>
                <summary>{t("brief.skills")}</summary>
                <ul className="brief-skills">
                  {lesson.competencies.map((competency) => (
                    <li key={competency.id}>
                      <strong>{competency.title}</strong>
                      <small>
                        {competency.code} · {competency.mastery_threshold}% needed
                      </small>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {lesson.prerequisites.length ? (
              <p className="field-note">
                Do first: {lesson.prerequisites.map((item) => item.title).join(", ")}
              </p>
            ) : null}
          </div>
        </li>
        <li className="brief-card is-safety">
          <span className="brief-number" aria-hidden="true">
            2
          </span>
          <div>
            <h2>{t("brief.staySafe")}</h2>
            <ul>
              {lesson.safety_notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            {requiredTools.length ? (
              <p className="field-note">
                {t("brief.youWillUse", {
                  tools: requiredTools.map((tool) => tool.name).join(", "),
                })}
              </p>
            ) : null}
          </div>
        </li>
        <li className="brief-card">
          <span className="brief-number" aria-hidden="true">
            3
          </span>
          <div className="knowledge-check-panel">
            <h2>{t("brief.quickCheck")}</h2>
            <KnowledgeCheck assignment={data} saved={knowledgeCheck.data} />
          </div>
        </li>
      </ol>

      <div className="lesson-launch">
        <div>
          <h2>
            {attemptOpen
              ? activeAttempt.is_practice
                ? "Practice run in progress"
                : "Attempt ready"
              : remaining === 0
                ? "No attempts left"
                : notOpenYet
                  ? "Not open yet"
                  : t("brief.readyTitle")}
          </h2>
          <p>
            {attemptOpen
              ? `Your ${activeAttempt.is_practice ? "practice run" : `attempt ${activeAttempt.id}`} is saved. You can pick up where you left off.`
              : notOpenYet
                ? `Your instructor opens this lesson on ${opensAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`
                : t("brief.readyText")}
            {!attemptOpen && !notOpenYet && remaining === 0
              ? ` You have used all ${data.attempt_limit} assessed attempts. You can still practise, or ask your instructor for another attempt.`
              : ""}
          </p>
          {start.isError ? (
            <p className="form-error" role="alert">
              {otherOpen
                ? describeApiError(start.error, "Finish your open attempt first.")
                : describeApiError(start.error, "The attempt could not be started. Try again.")}
            </p>
          ) : null}
        </div>
        <div className="launch-actions">
          {attemptOpen ? (
            <Link className="button button-primary" to={`/attempts/${activeAttempt.id}`}>
              {activeAttempt.resume_state?.completedSteps?.length
                ? t("brief.resumeSimulation")
                : t("brief.openSimulation")}
            </Link>
          ) : notOpenYet ? null : (
            <>
              <button
                className="button button-light"
                type="button"
                disabled={start.isPending}
                onClick={() => begin(true)}
              >
                {t("brief.practise")}
              </button>
              {remaining > 0 ? (
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => begin(false)}
                  disabled={start.isPending || !checkDone}
                >
                  {start.isPending
                    ? t("brief.starting")
                    : checkDone
                      ? t("brief.startAssessed")
                      : t("brief.checkFirst")}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Device preparation is collapsed: most learners on a prepared device never need it. */}
      <details className="lesson-panel offline-panel" open={offlineStale}>
        <summary>
          <span className="eyebrow">Low-connectivity preparation</span>
          <span className="offline-summary-title">
            Prepare this device for offline use
            {offlineInstalled ? <span className="offline-badge">Downloaded</span> : null}
            {offlineStale ? <span className="offline-badge is-stale">Update needed</span> : null}
          </span>
        </summary>
        <p>
          Save this lesson on the device so it works without a connection. Open the simulation once
          while online as well. About {Math.max(1, Math.round(downloadMb))} MB.
        </p>
        <label>
          Offline asset quality
          <select
            value={assetQuality}
            onChange={(event) => setAssetQuality(event.target.value as "low" | "medium" | "high")}
          >
            <option value="low">Low · best for shared low-memory devices</option>
            <option value="medium">Medium · balanced</option>
            <option value="high">High · capable devices</option>
          </select>
        </label>
        <button
          className="button button-secondary"
          type="button"
          onClick={async () => {
            setOfflineStatus("Downloading lesson assets…");
            try {
              const result = await downloadAssignmentAssets(lessonAssets);
              if (!result.failed.length) {
                try {
                  localStorage.setItem(
                    `opedu:installed-assignment:${assignmentId}`,
                    JSON.stringify({
                      scenarioVersion: data.scenario.version,
                      assetPackageVersion: data.scenario.asset_package?.version ?? null,
                      installedAt: new Date().toISOString(),
                      files: data.scenario.asset_package?.files.map((file) => ({
                        url: file.url,
                        sha256: file.sha256,
                      })),
                    }),
                  );
                } catch {
                  // The files are cached either way; only the "Downloaded" label is lost.
                }
                setOfflineInstalled(true);
                setInstalledVersion(data.scenario.version);
              }
              setOfflineStatus(
                result.failed.length
                  ? `${result.downloaded} of ${result.total} files saved. Reconnect to retry the remaining files.`
                  : `${result.downloaded} files saved for offline use.`,
              );
            } catch (error) {
              setOfflineStatus(error instanceof Error ? error.message : "Download failed.");
            }
          }}
        >
          Prepare for offline use
        </button>
        {offlineInstalled ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={async () => {
              const removed = await removeAssignmentAssets(lessonAssets);
              try {
                localStorage.removeItem(`opedu:installed-assignment:${assignmentId}`);
              } catch {
                // Nothing stored.
              }
              setOfflineInstalled(false);
              setInstalledVersion(null);
              setOfflineStatus(`${removed} downloaded lesson files removed from this device.`);
            }}
          >
            Remove offline lesson
          </button>
        ) : null}
        <a
          className="table-link"
          href={`/markers/battery?value=${encodeURIComponent(markerTarget)}`}
          target="_blank"
        >
          Print the Camera AR marker
        </a>
        {offlineStatus ? <p role="status">{offlineStatus}</p> : null}
        {offlineStale ? (
          <p className="form-error" role="alert">
            The downloaded lesson is stale. Re-download scenario version {data.scenario.version}{" "}
            before beginning a new offline attempt.
          </p>
        ) : null}
        {storageAvailableMb !== null ? (
          <small>{storageAvailableMb} MB storage available</small>
        ) : null}
      </details>
    </section>
  );
}
