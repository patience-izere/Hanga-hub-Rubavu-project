import { useState } from "react";

import { describeApiError } from "../../api/client";
import type { PilotInstrument } from "../../api/pilot";
import { usePilotMutation, usePilotParticipants } from "../../learning/usePilot";

/** Instruments staff record. Learners submit SUS, TAM and their interview themselves. */
const STAFF_INSTRUMENTS: Array<{ value: PilotInstrument; label: string; aboutLearner: boolean }> = [
  { value: "pre_test", label: "Pre-test score", aboutLearner: true },
  { value: "post_test", label: "Post-test score", aboutLearner: true },
  { value: "transfer", label: "Practical transfer rubric", aboutLearner: true },
  { value: "instructor_workload", label: "My workload this session", aboutLearner: false },
  { value: "instructor_interview", label: "My interview themes", aboutLearner: false },
];

const RUBRIC = [
  ["sequence", "Followed the correct sequence"],
  ["accuracy", "Accurate actions and readings"],
  ["safety", "Safe working throughout"],
  ["time", "Completed in a reasonable time"],
  ["independence", "Worked without prompting"],
] as const;

const THEMES = [
  ["access", "Access to devices"],
  ["cognitive_load", "Cognitive load"],
  ["device_limit", "Device limits"],
  ["fallback", "2D fallback"],
  ["instructional_value", "Instructional value"],
  ["language", "Language"],
  ["offline", "Offline use"],
  ["safety", "Safety"],
  ["support", "Support needed"],
  ["tracking", "AR tracking"],
  ["workload", "Workload"],
] as const;

function nowForInput() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function PilotObservationForm({ pilotId }: { pilotId: number }) {
  const participants = usePilotParticipants(pilotId);
  const { observation } = usePilotMutation();
  const [instrument, setInstrument] = useState<PilotInstrument>("pre_test");
  const [learnerId, setLearnerId] = useState(0);
  const [score, setScore] = useState("");
  const [rubric, setRubric] = useState<Record<string, number>>({});
  const [criticalFailure, setCriticalFailure] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState("");
  const [workload, setWorkload] = useState({ preparation: "", support: "", incidents: "0" });
  const [acceptable, setAcceptable] = useState<boolean | null>(null);
  const [themes, setThemes] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [consent, setConsent] = useState(false);
  const [collectedAt, setCollectedAt] = useState(nowForInput);
  const [saved, setSaved] = useState("");

  const selected = STAFF_INSTRUMENTS.find((item) => item.value === instrument)!;
  const learner = participants.data?.find((item) => item.learnerId === learnerId);
  const alreadyRecorded = learner?.recordedInstruments.includes(instrument) ?? false;

  function responses(): Record<string, unknown> {
    switch (instrument) {
      case "pre_test":
      case "post_test":
        return { score: Number(score) };
      case "transfer":
        return {
          ...rubric,
          criticalSafetyFailure: criticalFailure,
          durationSeconds: Math.round(Number(durationMinutes) * 60),
        };
      case "instructor_workload":
        return {
          preparationMinutes: Number(workload.preparation),
          supportMinutes: Number(workload.support),
          supportIncidents: Number(workload.incidents),
          acceptable,
        };
      default:
        return { themes, redactedSummary: summary };
    }
  }

  const ready =
    (!selected.aboutLearner || (learner?.consented && !alreadyRecorded)) &&
    (selected.aboutLearner || consent) &&
    (instrument !== "transfer" || RUBRIC.every(([key]) => rubric[key] !== undefined)) &&
    (instrument !== "instructor_workload" || acceptable !== null) &&
    (instrument !== "instructor_interview" || themes.length > 0);

  return (
    <details className="lesson-panel" open>
      <summary>Record an observation</summary>
      <form
        className="pilot-observation-form"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved("");
          observation.mutate(
            {
              id: pilotId,
              input: {
                instrument,
                learner_id: selected.aboutLearner ? learnerId : undefined,
                consent_accepted: selected.aboutLearner ? undefined : consent,
                responses: responses(),
                collected_at: new Date(collectedAt).toISOString(),
              },
            },
            {
              onSuccess: () => {
                setSaved(`${selected.label} recorded${learner ? ` for ${learner.name}` : ""}.`);
                setScore("");
                setRubric({});
                setThemes([]);
                setSummary("");
              },
            },
          );
        }}
      >
        <label>
          What are you recording?
          <select
            value={instrument}
            onChange={(event) => setInstrument(event.target.value as PilotInstrument)}
          >
            {STAFF_INSTRUMENTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {selected.aboutLearner ? (
          <label>
            Learner
            <select
              value={learnerId}
              onChange={(event) => setLearnerId(Number(event.target.value))}
            >
              <option value={0}>Choose a learner</option>
              {(participants.data ?? []).map((item) => (
                <option key={item.learnerId} value={item.learnerId} disabled={!item.consented}>
                  {item.name}
                  {item.consented ? "" : " (has not consented)"}
                  {item.recordedInstruments.includes(instrument) ? " (already recorded)" : ""}
                </option>
              ))}
            </select>
            <span className="field-note">
              Learners join the pilot from their own Survey page. Only those who consented can be
              recorded.
            </span>
          </label>
        ) : null}

        {instrument === "pre_test" || instrument === "post_test" ? (
          <label>
            Score out of 100
            <input
              type="number"
              min={0}
              max={100}
              value={score}
              onChange={(event) => setScore(event.target.value)}
              required
            />
          </label>
        ) : null}

        {instrument === "transfer" ? (
          <fieldset className="pilot-rubric">
            <legend>Rubric, 0 (not shown) to 4 (independent and correct)</legend>
            {RUBRIC.map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  value={rubric[key] ?? ""}
                  onChange={(event) =>
                    setRubric((current) => ({ ...current, [key]: Number(event.target.value) }))
                  }
                  required
                >
                  <option value="" disabled>
                    Choose
                  </option>
                  {[0, 1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="studio-check">
              <input
                type="checkbox"
                checked={criticalFailure}
                onChange={(event) => setCriticalFailure(event.target.checked)}
              />
              <span>A critical safety failure happened</span>
            </label>
            <label>
              Duration in minutes
              <input
                type="number"
                min={0}
                max={240}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                required
              />
            </label>
          </fieldset>
        ) : null}

        {instrument === "instructor_workload" ? (
          <fieldset className="pilot-rubric">
            <legend>This session</legend>
            <label>
              Preparation minutes
              <input
                type="number"
                min={0}
                value={workload.preparation}
                onChange={(event) => setWorkload({ ...workload, preparation: event.target.value })}
                required
              />
            </label>
            <label>
              Minutes spent supporting learners
              <input
                type="number"
                min={0}
                value={workload.support}
                onChange={(event) => setWorkload({ ...workload, support: event.target.value })}
                required
              />
            </label>
            <label>
              Support incidents
              <input
                type="number"
                min={0}
                value={workload.incidents}
                onChange={(event) => setWorkload({ ...workload, incidents: event.target.value })}
                required
              />
            </label>
            <fieldset className="pilot-inline-choice">
              <legend>Was the workload acceptable?</legend>
              <label className="studio-check">
                <input
                  type="radio"
                  name="acceptable"
                  checked={acceptable === true}
                  onChange={() => setAcceptable(true)}
                />
                <span>Yes</span>
              </label>
              <label className="studio-check">
                <input
                  type="radio"
                  name="acceptable"
                  checked={acceptable === false}
                  onChange={() => setAcceptable(false)}
                />
                <span>No</span>
              </label>
            </fieldset>
          </fieldset>
        ) : null}

        {instrument === "instructor_interview" ? (
          <fieldset className="pilot-rubric">
            <legend>Themes that came up</legend>
            <div className="pilot-theme-grid">
              {THEMES.map(([value, label]) => (
                <label key={value} className="studio-check">
                  <input
                    type="checkbox"
                    checked={themes.includes(value)}
                    onChange={(event) =>
                      setThemes((current) =>
                        event.target.checked
                          ? [...current, value]
                          : current.filter((theme) => theme !== value),
                      )
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <label>
              Short summary with names and identifying details removed
              <textarea
                rows={3}
                maxLength={2000}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>
          </fieldset>
        ) : null}

        {!selected.aboutLearner ? (
          <label className="studio-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              I consent to my own responses being stored under the approved pilot consent, and I
              know I can withdraw them.
            </span>
          </label>
        ) : null}

        <label>
          Collected at
          <input
            type="datetime-local"
            value={collectedAt}
            onChange={(event) => setCollectedAt(event.target.value)}
            required
          />
        </label>

        <button className="button button-secondary" disabled={!ready || observation.isPending}>
          {observation.isPending ? "Recording…" : "Record observation"}
        </button>
        {alreadyRecorded ? (
          <p className="field-note">This learner already has this instrument recorded.</p>
        ) : null}
        {saved ? (
          <p className="form-success" role="status">
            {saved}
          </p>
        ) : null}
        {observation.isError ? (
          <p className="form-error" role="alert">
            {describeApiError(observation.error, "The observation could not be recorded.")}
          </p>
        ) : null}
      </form>
    </details>
  );
}
