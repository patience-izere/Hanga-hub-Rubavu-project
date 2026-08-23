import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  getResearchConsentPolicy,
  submitResearchSurvey,
  withdrawResearchResponses,
  type ResearchConsentPolicy,
} from "../api/research";
import { getPilotStudies, recordPilotObservation } from "../api/pilot";

const susItems = [
  "I would like to use this learning system frequently.",
  "I found the learning system unnecessarily complex.",
  "I thought the learning system was easy to use.",
  "I would need technical support to use this learning system.",
  "The functions in this learning system were well integrated.",
  "I found too much inconsistency in this learning system.",
  "Most learners would learn to use this system quickly.",
  "I found the learning system cumbersome to use.",
  "I felt confident using the learning system.",
  "I needed to learn many things before I could use the system.",
];

const tamItems = [
  ["usefulness", "useful", "The system was useful for learning the technical procedure."],
  ["usefulness", "understanding", "The system helped me understand the procedure steps."],
  ["ease", "easy", "The system was easy to use."],
  ["ease", "learnable", "I learned the controls quickly."],
  [
    "enjoyment",
    "enjoyable",
    "The learning experience was enjoyable without distracting from the task.",
  ],
  ["enjoyment", "engaging", "The guidance kept me engaged with the practical task."],
  ["intention", "reuse", "I would use this system for another suitable practical lesson."],
  ["intention", "recommend", "I would recommend it for an appropriate supervised lesson."],
] as const;

export function ResearchSurveyPage() {
  const [search] = useSearchParams();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [withdrawn, setWithdrawn] = useState(false);
  const [consentPolicy, setConsentPolicy] = useState<ResearchConsentPolicy | null>(null);
  const [consentPolicyError, setConsentPolicyError] = useState(false);
  const [activePilotId, setActivePilotId] = useState<number | null>(null);
  const scenarioVersion = search.get("scenarioVersion") ?? "";
  const complete =
    susItems.every((_, index) => answers[`sus_${index + 1}`]) &&
    tamItems.every(([, code]) => answers[`tam_${code}`]);

  useEffect(() => {
    void getResearchConsentPolicy()
      .then(setConsentPolicy)
      .catch(() => setConsentPolicyError(true));
  }, []);

  useEffect(() => {
    void getPilotStudies()
      .then((pilots) => {
        const matched = pilots.results.find((pilot) => {
          const snapshot = pilot.protocol_snapshot as {
            scenario?: { version?: number };
          };
          return (
            pilot.status === "collecting" &&
            (!scenarioVersion || String(snapshot.scenario?.version ?? "") === scenarioVersion)
          );
        });
        setActivePilotId(matched?.id ?? null);
      })
      .catch(() => setActivePilotId(null));
  }, [scenarioVersion]);

  return (
    <section className="survey-page">
      <span className="eyebrow">Optional pilot evaluation</span>
      <h1>Tell us how the learning experience worked</h1>
      <p>
        Your operational account is converted to a pseudonymous participant code. Responses are used
        only under the approved pilot consent and retention process.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setStatus("saving");
          try {
            if (!consentPolicy) throw new Error("Consent policy is unavailable.");
            const susResponses = susItems.map((_, index) => answers[`sus_${index + 1}`]);
            const tamResponses = Object.fromEntries(
              ["usefulness", "ease", "enjoyment", "intention"].map((construct) => [
                construct,
                tamItems
                  .filter(([itemConstruct]) => itemConstruct === construct)
                  .map(([, code]) => answers[`tam_${code}`]),
              ]),
            );
            await Promise.all(
              activePilotId
                ? [
                    recordPilotObservation(activePilotId, {
                      instrument: "sus",
                      responses: { items: susResponses },
                      consent_accepted: true,
                    }),
                    recordPilotObservation(activePilotId, {
                      instrument: "tam",
                      responses: tamResponses,
                      consent_accepted: true,
                    }),
                  ]
                : [
                    submitResearchSurvey({
                      instrument: "sus",
                      responses: Object.fromEntries(
                        susItems.map((_, index) => [
                          `item_${index + 1}`,
                          answers[`sus_${index + 1}`],
                        ]),
                      ),
                      consent_version: consentPolicy.version,
                      consent_accepted: true,
                      scenario_version: scenarioVersion,
                    }),
                    submitResearchSurvey({
                      instrument: "tam",
                      responses: Object.fromEntries(
                        tamItems.map(([, code]) => [code, answers[`tam_${code}`]]),
                      ),
                      consent_version: consentPolicy.version,
                      consent_accepted: true,
                      scenario_version: scenarioVersion,
                    }),
                  ],
            );
            setStatus("saved");
          } catch {
            setStatus("error");
          }
        }}
      >
        <fieldset>
          <legend>System Usability Scale</legend>
          {susItems.map((item, index) => (
            <Rating
              key={item}
              code={`sus_${index + 1}`}
              label={`${index + 1}. ${item}`}
              answers={answers}
              setAnswers={setAnswers}
            />
          ))}
        </fieldset>
        <fieldset>
          <legend>Acceptance and usefulness</legend>
          {tamItems.map(([, code, label]) => (
            <Rating
              key={code}
              code={`tam_${code}`}
              label={label}
              answers={answers}
              setAnswers={setAnswers}
            />
          ))}
        </fieldset>
        <label className="survey-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          I consent to these responses being stored for the approved OPedu pilot evaluation and
          understand that participation is voluntary.
        </label>
        {consentPolicy ? (
          <>
            <p>
              Consent version {consentPolicy.version} · configured retention up to{" "}
              {consentPolicy.retention_days} days · policy status {consentPolicy.status}. Read the{" "}
              <Link to={consentPolicy.privacy_path}>privacy overview</Link> before deciding.
            </p>
            {activePilotId ? (
              <p role="status">These responses are linked to the active frozen pilot protocol.</p>
            ) : (
              <p>
                No active pilot protocol matches this scenario; responses use the general evaluation
                record.
              </p>
            )}
          </>
        ) : consentPolicyError ? (
          <p className="form-error" role="alert">
            The current consent policy is unavailable. Research responses cannot be submitted.
          </p>
        ) : (
          <p role="status">Loading the current consent policy…</p>
        )}
        <button
          className="button button-primary"
          disabled={
            !complete ||
            !consent ||
            !consentPolicy ||
            consentPolicy.status !== "approved" ||
            status === "saving"
          }
        >
          {status === "saving" ? "Saving responses…" : "Submit evaluation"}
        </button>
        {consentPolicy?.status === "draft" ? (
          <p className="form-error" role="alert">
            Pilot research collection is disabled until the institution approves this consent
            policy.
          </p>
        ) : null}
        {status === "saved" && (
          <p role="status">Thank you. Your pseudonymized responses were saved.</p>
        )}
        {status === "error" && (
          <p className="form-error" role="alert">
            Responses could not be saved. Nothing was discarded from your learning attempt.
          </p>
        )}
      </form>
      <section className="lesson-panel">
        <h2>Withdraw research responses</h2>
        <p>
          This removes this account's pseudonymized pilot survey responses. Learning and assessment
          evidence is operational school data and follows the separately approved school policy.
        </p>
        <button
          className="button button-secondary"
          type="button"
          onClick={async () => {
            await withdrawResearchResponses();
            setWithdrawn(true);
          }}
        >
          Withdraw my pilot responses
        </button>
        {withdrawn ? <p role="status">Your pilot survey responses were removed.</p> : null}
      </section>
    </section>
  );
}

function Rating({
  code,
  label,
  answers,
  setAnswers,
}: {
  code: string;
  label: string;
  answers: Record<string, number>;
  setAnswers: Dispatch<SetStateAction<Record<string, number>>>;
}) {
  return (
    <div className="survey-rating">
      <p>{label}</p>
      <div role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value}>
            <input
              type="radio"
              name={code}
              value={value}
              checked={answers[code] === value}
              onChange={() => setAnswers((current) => ({ ...current, [code]: value }))}
              required
            />
            {value}
          </label>
        ))}
      </div>
    </div>
  );
}
