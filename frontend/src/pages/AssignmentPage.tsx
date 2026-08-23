import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  useAssignment,
  useKnowledgeCheck,
  useSaveKnowledgeCheck,
  useStartAssignment,
} from "../learning/useAssignments";
import { downloadAssignmentAssets, removeAssignmentAssets } from "../offline/outbox";

export function AssignmentPage() {
  const assignmentId = Number(useParams().assignmentId);
  const navigate = useNavigate();
  const assignment = useAssignment(assignmentId);
  const start = useStartAssignment(assignmentId);
  const knowledgeCheck = useKnowledgeCheck(assignmentId);
  const saveKnowledgeCheck = useSaveKnowledgeCheck(assignmentId);
  const [readiness, setReadiness] = useState<Record<string, boolean>>({});
  const [offlineStatus, setOfflineStatus] = useState("");
  const [offlineInstalled, setOfflineInstalled] = useState(false);
  const [installedVersion, setInstalledVersion] = useState<number | null>(null);
  const [assetQuality, setAssetQuality] = useState<"low" | "medium" | "high">("low");
  const [storageAvailableMb, setStorageAvailableMb] = useState<number | null>(null);

  useEffect(() => {
    const installed = localStorage.getItem(`opedu:installed-assignment:${assignmentId}`);
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

  const { lesson, latest_attempt: latestAttempt } = assignment.data;
  const offlineStale =
    offlineInstalled &&
    installedVersion !== null &&
    installedVersion !== assignment.data.scenario.version;
  const activeAttempt = start.data || latestAttempt;
  const packageFiles = assignment.data.scenario.asset_package?.files ?? [];
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
    ...downloadFiles.map((file) => ({
      url: file.url,
      sha256: file.sha256,
    })),
  ];
  const markerTarget =
    assignment.data.scenario.renderer_config?.marker_ar?.targetValue ||
    `OPEDU-${lesson.slug}-V${lesson.content_version}`;
  const requiredTools = [
    ...new Map(
      lesson.procedure_steps.flatMap((step) => step.tools).map((tool) => [tool.code, tool]),
    ).values(),
  ];

  return (
    <section className="lesson-page">
      <Link className="back-link" to="/learn">
        ← My learning
      </Link>
      <div className="lesson-header">
        <div>
          <div className="eyebrow">
            {lesson.trade} · {lesson.course_title}
          </div>
          <h1>{lesson.title}</h1>
          <p>{lesson.summary}</p>
        </div>
        <div className="lesson-duration">
          <strong>{lesson.estimated_minutes}</strong>
          <span>minutes</span>
        </div>
      </div>
      <div className="lesson-content-grid">
        <article className="lesson-panel">
          <h2>Learning objectives</h2>
          <ol>
            {lesson.objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ol>
        </article>
        <article className="lesson-panel safety-panel">
          <h2>Safety before action</h2>
          <ul>
            {lesson.safety_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </article>
        <article className="lesson-panel">
          <h2>Prerequisites</h2>
          {lesson.prerequisites.length ? (
            <ul>
              {lesson.prerequisites.map((prerequisite) => (
                <li key={prerequisite.id}>{prerequisite.title}</li>
              ))}
            </ul>
          ) : (
            <p>No prior OPedu lesson is required.</p>
          )}
        </article>
        <article className="lesson-panel">
          <h2>Required training tools</h2>
          {requiredTools.length ? (
            <ul>
              {requiredTools.map((tool) => (
                <li key={tool.code}>
                  <strong>{tool.name}</strong>
                  {tool.description ? ` — ${tool.description}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p>The instructor will confirm the approved training rig and any physical tools.</p>
          )}
        </article>
      </div>
      <article className="competency-panel">
        <h2>Competencies assessed</h2>
        {lesson.competencies.map((competency) => (
          <div className="competency-row" key={competency.id}>
            <span>{competency.code}</span>
            <div>
              <strong>{competency.title}</strong>
              <p>{competency.description}</p>
            </div>
            <small>{competency.mastery_threshold}% mastery</small>
          </div>
        ))}
      </article>
      <article className="knowledge-check-panel">
        <span className="eyebrow">Pre-lesson knowledge check</span>
        <h2>Confirm the safety reasoning before practice</h2>
        {knowledgeCheck.data ? (
          <p className="knowledge-check-complete" role="status">
            Saved · {Number(knowledgeCheck.data.score)}% readiness. This check informs guidance; it
            does not replace practical assessment.
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveKnowledgeCheck.mutate(
                ["ppe", "isolation", "meter"].map((questionCode) => ({
                  questionCode,
                  response: readiness[questionCode] === true,
                })),
              );
            }}
          >
            {[
              ["ppe", "I can identify the required personal protective equipment."],
              ["isolation", "I know the equipment must be made safe before measurement."],
              ["meter", "I can select the correct meter mode and range."],
            ].map(([code, label]) => (
              <label key={code}>
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
            <button className="button button-secondary" disabled={saveKnowledgeCheck.isPending}>
              {saveKnowledgeCheck.isPending ? "Saving…" : "Save knowledge check"}
            </button>
          </form>
        )}
      </article>
      <article className="lesson-panel">
        <span className="eyebrow">Low-connectivity preparation</span>
        <h2>Download this practical lesson</h2>
        <p>
          Save the app shell and available 3D assets on this device. Open the simulation once while
          online to also store its latest steps and evidence state.
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
                localStorage.setItem(
                  `opedu:installed-assignment:${assignmentId}`,
                  JSON.stringify({
                    scenarioVersion: assignment.data.scenario.version,
                    assetPackageVersion: assignment.data.scenario.asset_package?.version ?? null,
                    installedAt: new Date().toISOString(),
                    files: assignment.data.scenario.asset_package?.files.map((file) => ({
                      url: file.url,
                      sha256: file.sha256,
                    })),
                  }),
                );
                setOfflineInstalled(true);
                setInstalledVersion(assignment.data.scenario.version);
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
              localStorage.removeItem(`opedu:installed-assignment:${assignmentId}`);
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
          Print the approved Camera AR marker
        </a>
        {offlineStatus ? <p role="status">{offlineStatus}</p> : null}
        {offlineStale ? (
          <p className="form-error" role="alert">
            The downloaded lesson is stale. Re-download scenario version{" "}
            {assignment.data.scenario.version} before beginning a new offline attempt.
          </p>
        ) : null}
        {storageAvailableMb !== null ? (
          <small>{storageAvailableMb} MB storage available</small>
        ) : null}
      </article>
      <div className="lesson-launch">
        <div>
          <h2>
            {activeAttempt?.status === "in_progress" ? "Attempt ready" : "Ready to practise?"}
          </h2>
          <p>
            {activeAttempt?.status === "in_progress"
              ? `Attempt ${activeAttempt.id} is saved and ready for the 3D procedure workspace.`
              : "Starting creates a resumable learning attempt before the simulation opens."}
          </p>
        </div>
        {activeAttempt?.status === "in_progress" ? (
          <Link className="button button-primary" to={`/attempts/${activeAttempt.id}`}>
            {activeAttempt.resume_state?.completedSteps?.length
              ? "Resume simulation"
              : "Open simulation"}
          </Link>
        ) : (
          <button
            className="button button-primary"
            onClick={() =>
              start.mutate(undefined, {
                onSuccess: (attempt) => navigate(`/attempts/${attempt.id}`),
              })
            }
            disabled={start.isPending || !knowledgeCheck.data}
          >
            {start.isPending
              ? "Starting…"
              : knowledgeCheck.data
                ? "Start learning attempt"
                : "Complete knowledge check first"}
          </button>
        )}
      </div>
    </section>
  );
}
