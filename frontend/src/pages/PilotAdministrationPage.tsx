import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import type { User } from "../api/client";
import type { PilotInstrument } from "../api/pilot";
import {
  usePilotMutation,
  usePilotOptions,
  usePilotReport,
  usePilotStudies,
} from "../learning/usePilot";

const instruments: PilotInstrument[] = [
  "pre_test",
  "post_test",
  "transfer",
  "sus",
  "tam",
  "learner_interview",
  "instructor_interview",
  "instructor_workload",
];

const approvalDomains = [
  "ethics",
  "privacy",
  "safeguarding",
  "instructor",
  "safety",
  "device",
  "accessibility",
  "security",
  "operations",
  "recovery",
  "evidence",
];

const rehearsalKinds = [
  "instructor_training",
  "custodian_training",
  "outage",
  "fallback",
  "stop",
  "usability_safety",
];

const deviceTemplate = JSON.stringify(
  [
    {
      model: "Replace with measured device",
      os: "Replace with exact OS",
      browser: "Replace with exact browser/version",
      tier: "lowest-supported",
      supported: true,
    },
    {
      model: "Replace with fallback-test device",
      os: "Replace with exact OS",
      browser: "Replace with exact browser/version",
      tier: "unsupported",
      supported: false,
    },
  ],
  null,
  2,
);

const instrumentTemplate = JSON.stringify(
  Object.fromEntries(
    instruments.map((instrument) => [
      instrument,
      {
        version: "Replace with approved version",
        evidenceReference: "Replace with controlled instrument record",
        contentSha256: "0".repeat(64),
      },
    ]),
  ),
  null,
  2,
);

function field(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

export function PilotAdministrationPage({ user }: { user: User }) {
  const studies = usePilotStudies();
  const canAdmin = user.roles.some((role) => role === "platform_admin" || role === "admin");
  const options = usePilotOptions(canAdmin);
  const mutations = usePilotMutation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formError, setFormError] = useState("");
  const selected = studies.data?.results.find((study) => study.id === selectedId) ?? null;
  const report = usePilotReport(selectedId);

  useEffect(() => {
    if (!selectedId && studies.data?.results[0]) setSelectedId(studies.data.results[0].id);
  }, [selectedId, studies.data]);

  async function submit(action: () => Promise<unknown>) {
    setFormError("");
    try {
      await action();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The pilot record could not be saved.");
    }
  }

  function createStudy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void submit(async () => {
      const created = await mutations.create.mutateAsync({
        school: Number(data.get("school")),
        code: field(data, "code"),
        title: field(data, "title"),
        scenario: Number(data.get("scenario")),
        cohort: Number(data.get("cohort")),
        protocol_version: field(data, "protocolVersion"),
        consent_version: field(data, "consentVersion"),
        instruments: JSON.parse(field(data, "instruments")),
        supported_devices: JSON.parse(field(data, "devices")),
        analysis_plan: {
          primaryOutcome: "paired_pre_post_change",
          missingDataPolicy: "report_all_missing_by_instrument",
          exclusionPolicy: "exclude_only_predeclared_invalid_records",
          uncertaintyMethod: "paired_t_95_ci",
        },
        thresholds: {
          susMedianMin: Number(data.get("susMedianMin")),
          recognitionSuccessRateMin: Number(data.get("recognitionSuccessRateMin")),
          recognitionMedianLatencyMsMax: Number(data.get("recognitionMedianLatencyMsMax")),
          completionRateGapMax: Number(data.get("completionRateGapMax")),
          meanScoreGapMax: Number(data.get("meanScoreGapMax")),
          instructorWorkloadMinutesMax: Number(data.get("instructorWorkloadMinutesMax")),
        },
      });
      setSelectedId(created.id);
    });
  }

  return (
    <section className="dashboard pilot-admin">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Batch 11 evidence governance</span>
          <h1>Technical-school pilot control room</h1>
          <p>
            Freeze the protocol before collection, separate learner outcomes from AR reliability,
            expose missing data, and prevent expansion without an independent evidence decision.
          </p>
        </div>
      </div>

      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}

      {canAdmin && options.data ? (
        <details className="lesson-panel pilot-create">
          <summary>Create a draft pilot protocol</summary>
          <form onSubmit={createStudy}>
            <label>
              School
              <select name="school" required>
                {options.data.schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Published scenario
              <select name="scenario" required>
                {options.data.scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.lessonTitle} · v{scenario.version} ·{" "}
                    {scenario.assetPackage || "no asset"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pilot cohort
              <select name="cohort" required>
                {options.data.cohorts.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    {cohort.name} · {cohort.learnerCount} learner(s)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Code
              <input name="code" required pattern="[a-z0-9-]+" placeholder="battery-pilot-2026" />
            </label>
            <label>
              Title
              <input name="title" required placeholder="Battery WebAR controlled pilot" />
            </label>
            <label>
              Protocol version
              <input name="protocolVersion" required placeholder="battery-pilot-v1" />
            </label>
            <label>
              Approved consent version
              <input name="consentVersion" required defaultValue="opedu-pilot-consent-v1" />
            </label>
            <label className="full-width-field">
              Approved instrument definitions (JSON)
              <textarea name="instruments" required rows={18} defaultValue={instrumentTemplate} />
            </label>
            <label className="full-width-field">
              Measured supported and fallback device profiles (JSON)
              <textarea name="devices" required rows={14} defaultValue={deviceTemplate} />
            </label>
            <label>
              Minimum median SUS
              <input name="susMedianMin" type="number" min="0" max="100" defaultValue="70" />
            </label>
            <label>
              Minimum recognition success rate
              <input
                name="recognitionSuccessRateMin"
                type="number"
                min="0"
                max="1"
                step="0.01"
                defaultValue="0.9"
              />
            </label>
            <label>
              Maximum median recognition latency (ms)
              <input
                name="recognitionMedianLatencyMsMax"
                type="number"
                min="0"
                defaultValue="1000"
              />
            </label>
            <label>
              Maximum completion-rate gap
              <input
                name="completionRateGapMax"
                type="number"
                min="0"
                max="1"
                step="0.01"
                defaultValue="0.1"
              />
            </label>
            <label>
              Maximum mean outcome-score gap (percentage points)
              <input name="meanScoreGapMax" type="number" min="0" max="100" defaultValue="10" />
            </label>
            <label>
              Maximum instructor preparation + support minutes
              <input name="instructorWorkloadMinutesMax" type="number" min="0" defaultValue="120" />
            </label>
            <button className="button button-primary" disabled={mutations.create.isPending}>
              Create draft protocol
            </button>
          </form>
        </details>
      ) : null}

      <section className="lesson-panel">
        <h2>Pilot studies</h2>
        {studies.isPending ? <p role="status">Loading pilot governance…</p> : null}
        <label>
          Selected pilot
          <select
            value={selectedId ?? ""}
            onChange={(event) => setSelectedId(Number(event.target.value))}
          >
            <option value="">Choose a pilot</option>
            {(studies.data?.results ?? []).map((study) => (
              <option key={study.id} value={study.id}>
                {study.title} · {study.protocol_version} · {study.status}
              </option>
            ))}
          </select>
        </label>
      </section>

      {selected ? (
        <>
          <section className="lesson-panel pilot-status">
            <span className="eyebrow">Immutable evidence boundary</span>
            <h2>{selected.title}</h2>
            <p>
              Protocol {selected.protocol_version} · status <strong>{selected.status}</strong>
            </p>
            {[...selected.freezeErrors, ...selected.collectionErrors].length ? (
              <ul className="form-error">
                {[...selected.freezeErrors, ...selected.collectionErrors].map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : (
              <p role="status">The current transition prerequisites recorded in software pass.</p>
            )}
            {canAdmin ? (
              <div className="button-row">
                {selected.status === "draft" ? (
                  <button
                    className="button button-primary"
                    onClick={() =>
                      void submit(() =>
                        mutations.transition.mutateAsync({ id: selected.id, action: "freeze" }),
                      )
                    }
                  >
                    Freeze protocol
                  </button>
                ) : null}
                {selected.status === "frozen" ? (
                  <button
                    className="button button-primary"
                    onClick={() =>
                      void submit(() =>
                        mutations.transition.mutateAsync({ id: selected.id, action: "start" }),
                      )
                    }
                  >
                    Start approved collection
                  </button>
                ) : null}
                {selected.status === "collecting" ? (
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      void submit(() =>
                        mutations.transition.mutateAsync({ id: selected.id, action: "close" }),
                      )
                    }
                  >
                    Close collection
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <PilotEvidenceForms
            pilotId={selected.id}
            status={selected.status}
            canAdmin={canAdmin}
            submit={submit}
            mutations={mutations}
          />

          <section className="lesson-panel pilot-report" aria-labelledby="pilot-report-title">
            <span className="eyebrow">Analysis without effectiveness overclaim</span>
            <h2 id="pilot-report-title">Pilot evidence report</h2>
            {report.isPending ? <p role="status">Calculating the frozen analysis…</p> : null}
            {report.data ? (
              <>
                <div className="metric-grid">
                  <article>
                    <span>Expected participants</span>
                    <strong>{report.data.expectedParticipants}</strong>
                  </article>
                  <article>
                    <span>Observed participants</span>
                    <strong>{report.data.observedParticipants}</strong>
                  </article>
                  <article>
                    <span>Median SUS</span>
                    <strong>{report.data.acceptance.susMedian ?? "Missing"}</strong>
                  </article>
                  <article>
                    <span>Overall gate</span>
                    <strong>{report.data.overallGate}</strong>
                  </article>
                </div>
                <table className="evidence-table">
                  <thead>
                    <tr>
                      <th>Gate</th>
                      <th>Status</th>
                      <th>Value</th>
                      <th>Rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(report.data.gates).map(([code, gate]) => (
                      <tr key={code}>
                        <td>{code}</td>
                        <td>{gate.status}</td>
                        <td>
                          {gate.value === null
                            ? "missing"
                            : typeof gate.value === "object"
                              ? JSON.stringify(gate.value)
                              : String(gate.value)}
                        </td>
                        <td>{gate.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h3>Evidence by device tier</h3>
                <table className="evidence-table">
                  <thead>
                    <tr>
                      <th>Tier</th>
                      <th>Started</th>
                      <th>Completion</th>
                      <th>Recognition</th>
                      <th>Latency (ms)</th>
                      <th>False placements</th>
                      <th>Fallbacks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(report.data.byDeviceTier).map(([tier, metrics]) => (
                      <tr key={tier}>
                        <td>{tier}</td>
                        <td>{String(metrics.started ?? 0)}</td>
                        <td>{String(metrics.completionRate ?? "missing")}</td>
                        <td>{String(metrics.recognitionSuccessRate ?? "missing")}</td>
                        <td>{String(metrics.medianRecognitionLatencyMs ?? "missing")}</td>
                        <td>{String(metrics.falsePlacements ?? 0)}</td>
                        <td>{String(metrics.fallbacks ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h3>Operational evidence</h3>
                <dl className="definition-list">
                  {Object.entries(report.data.operations).map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{String(value ?? "missing")}</dd>
                    </div>
                  ))}
                </dl>
                <h3>Missing observations</h3>
                <ul>
                  {Object.entries(report.data.missingByInstrument).map(([name, count]) => (
                    <li key={name}>
                      {name}: {count}
                    </li>
                  ))}
                </ul>
                <p>
                  Excluded records: {report.data.excludedRecords.count}. Exclusions are reported
                  separately and are never silently removed.
                </p>
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </section>
  );
}

function PilotEvidenceForms({
  pilotId,
  status,
  canAdmin,
  submit,
  mutations,
}: {
  pilotId: number;
  status: string;
  canAdmin: boolean;
  submit(action: () => Promise<unknown>): Promise<void>;
  mutations: ReturnType<typeof usePilotMutation>;
}) {
  return (
    <div className="pilot-form-grid">
      {canAdmin ? (
        <EvidenceForm
          title="Approval evidence"
          onSubmit={(data) =>
            submit(() =>
              mutations.approval.mutateAsync({
                id: pilotId,
                input: {
                  domain: field(data, "domain"),
                  status: field(data, "approvalStatus"),
                  approver_name: field(data, "approverName"),
                  approver_role: field(data, "approverRole"),
                  organization: field(data, "organization"),
                  evidence_reference: field(data, "evidenceReference"),
                  scope: field(data, "scope"),
                  decision_at: new Date(field(data, "decisionAt")).toISOString(),
                },
              }),
            )
          }
        >
          <label>
            Domain
            <select name="domain">
              {approvalDomains.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Decision
            <select name="approvalStatus">
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="pending">Pending</option>
            </select>
          </label>
          <TextInput name="approverName" label="Named external approver" />
          <TextInput name="approverRole" label="Approver role" />
          <TextInput name="organization" label="Organization" />
          <TextInput name="evidenceReference" label="Controlled evidence reference" />
          <TextInput name="scope" label="Decision scope" />
          <DateInput name="decisionAt" label="Decision time" />
        </EvidenceForm>
      ) : null}

      <EvidenceForm
        title="Training or rehearsal evidence"
        onSubmit={(data) =>
          submit(() =>
            mutations.rehearsal.mutateAsync({
              id: pilotId,
              input: {
                kind: field(data, "kind"),
                outcome: field(data, "outcome"),
                facilitator: field(data, "facilitator"),
                participant_count: Number(data.get("participantCount")),
                evidence_reference: field(data, "evidenceReference"),
                notes: field(data, "notes"),
                completed_at: new Date(field(data, "completedAt")).toISOString(),
              },
            }),
          )
        }
      >
        <label>
          Rehearsal
          <select name="kind">
            {rehearsalKinds.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Outcome
          <select name="outcome">
            <option value="pass">Pass</option>
            <option value="issues">Issues found</option>
            <option value="fail">Fail</option>
          </select>
        </label>
        <TextInput name="facilitator" label="Facilitator" />
        <label>
          Participants
          <input name="participantCount" type="number" min="1" required />
        </label>
        <TextInput name="evidenceReference" label="Controlled evidence reference" />
        <TextInput name="notes" label="De-identified notes" />
        <DateInput name="completedAt" label="Completed at" />
      </EvidenceForm>

      {status === "collecting" ? (
        <EvidenceForm
          title="Scored or coded observation"
          onSubmit={(data) =>
            submit(() =>
              mutations.observation.mutateAsync({
                id: pilotId,
                input: {
                  instrument: field(data, "instrument") as PilotInstrument,
                  learner_id: Number(data.get("learnerId")) || undefined,
                  responses: JSON.parse(field(data, "responses")),
                  collected_at: new Date(field(data, "collectedAt")).toISOString(),
                },
              }),
            )
          }
        >
          <label>
            Instrument
            <select name="instrument">
              {instruments.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Learner ID when learner-scored
            <input name="learnerId" type="number" min="1" />
          </label>
          <label>
            Validated response object (JSON)
            <textarea name="responses" rows={8} required defaultValue={'{"score": 0}'} />
          </label>
          <details>
            <summary>Validated response examples</summary>
            <p>
              Pre/post: <code>{'{"score": 70}'}</code>. SUS: ten 1–5 ratings. TAM: 1–5 rating arrays
              for usefulness, ease, enjoyment, and intention. Transfer: 0–4 values for sequence,
              accuracy, safety, time, and independence, plus criticalSafetyFailure and
              durationSeconds.
            </p>
            <p>
              Workload records preparationMinutes, supportMinutes, supportIncidents, acceptable,
              downloads, downloadFailures, crashCount, storageUsedMb, and synchronizationIncidents.
              Interviews accept controlled theme codes and a redacted summary only; raw transcripts
              must not be pasted here.
            </p>
          </details>
          <DateInput name="collectedAt" label="Collected at" />
        </EvidenceForm>
      ) : null}

      <EvidenceForm
        title="Safety, usability or operational incident"
        onSubmit={(data) =>
          submit(() =>
            mutations.incident.mutateAsync({
              id: pilotId,
              input: {
                id: Number(data.get("incidentId")) || undefined,
                kind: field(data, "incidentKind"),
                severity: field(data, "severity"),
                status: field(data, "incidentStatus"),
                summary: field(data, "summary"),
                resolution: field(data, "resolution"),
                evidence_reference: field(data, "evidenceReference"),
                safety_critical: data.get("safetyCritical") === "on",
                ar_caused_grading_penalty: data.get("gradingPenalty") === "on",
                occurred_at: new Date(field(data, "occurredAt")).toISOString(),
                resolved_at: field(data, "resolvedAt")
                  ? new Date(field(data, "resolvedAt")).toISOString()
                  : null,
              },
            }),
          )
        }
      >
        <label>
          Existing incident ID when resolving
          <input name="incidentId" type="number" min="1" />
        </label>
        <label>
          Kind
          <select name="incidentKind">
            <option>safety</option>
            <option>usability</option>
            <option>privacy</option>
            <option>technical</option>
            <option>support</option>
          </select>
        </label>
        <label>
          Severity
          <select name="severity">
            <option>low</option>
            <option>medium</option>
            <option>high</option>
            <option>critical</option>
          </select>
        </label>
        <label>
          Status
          <select name="incidentStatus">
            <option>open</option>
            <option>resolved</option>
            <option value="accepted_risk">Accepted risk</option>
          </select>
        </label>
        <TextInput name="summary" label="De-identified summary" />
        <TextInput name="resolution" label="Resolution" required={false} />
        <TextInput name="evidenceReference" label="Evidence reference" required={false} />
        <label>
          <input name="safetyCritical" type="checkbox" /> Safety-critical
        </label>
        <label>
          <input name="gradingPenalty" type="checkbox" /> AR caused a grading penalty
        </label>
        <DateInput name="occurredAt" label="Occurred at" />
        <DateInput name="resolvedAt" label="Resolved at" required={false} />
      </EvidenceForm>

      {canAdmin && status === "closed" ? (
        <EvidenceForm
          title="Independent go/no-go decision"
          onSubmit={(data) =>
            submit(() =>
              mutations.review.mutateAsync({
                id: pilotId,
                input: {
                  decision: field(data, "decision"),
                  reviewer_name: field(data, "reviewerName"),
                  reviewer_role: field(data, "reviewerRole"),
                  organization: field(data, "organization"),
                  evidence_reference: field(data, "evidenceReference"),
                  rationale: field(data, "rationale"),
                  limitations: field(data, "limitations"),
                  independent_confirmed: data.get("independent") === "on",
                  decided_at: new Date(field(data, "decidedAt")).toISOString(),
                },
              }),
            )
          }
        >
          <label>
            Decision
            <select name="decision">
              <option value="limit">Continue with limits</option>
              <option value="reject">Reject expansion</option>
              <option value="expand">Approve expansion</option>
            </select>
          </label>
          <TextInput name="reviewerName" label="Independent reviewer" />
          <TextInput name="reviewerRole" label="Reviewer role" />
          <TextInput name="organization" label="Organization" />
          <TextInput name="evidenceReference" label="Evidence reference" />
          <TextInput name="rationale" label="Rationale" />
          <TextInput name="limitations" label="Limitations" />
          <label>
            <input name="independent" type="checkbox" required /> Reviewer independence confirmed
          </label>
          <DateInput name="decidedAt" label="Decision time" />
        </EvidenceForm>
      ) : null}
    </div>
  );
}

function EvidenceForm({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit(data: FormData): Promise<void>;
  children: ReactNode;
}) {
  return (
    <details className="lesson-panel">
      <summary>{title}</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(new FormData(event.currentTarget));
        }}
      >
        {children}
        <button className="button button-secondary">Record evidence</button>
      </form>
    </details>
  );
}

function TextInput({
  name,
  label,
  required = true,
}: {
  name: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input name={name} required={required} />
    </label>
  );
}

function DateInput({
  name,
  label,
  required = true,
}: {
  name: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input name={name} type="datetime-local" required={required} />
    </label>
  );
}
