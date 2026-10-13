import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { describeApiError } from "../api/client";
import type { AuthoredScenario, CompetencyOption } from "../api/content";
import { ContentStatusBadge, ListEditor } from "../components/authoring/AuthoringFields";
import { useCurrentUser } from "../auth/useAuth";
import {
  useAuthoredAssetPackages,
  useAuthoredScenario,
  useAuthoringCourses,
  useAuthoringLesson,
  useCloneAuthoredScenario,
  useGradingPolicies,
  usePublishAuthoredScenario,
  useTransitionAuthoredScenario,
  useUpdateAuthoredScenario,
} from "../learning/useContentAuthoring";

type Hint = { code: string; order?: number; text: string; points_penalty: number };
type Action = { action_code: string; label: string; is_primary: boolean; tolerance?: unknown };

/** The fields the Studio edits; every other key on a step is preserved as authored. */
type Step = Record<string, unknown> & {
  order: number;
  code: string;
  title: string;
  instruction: string;
  action_code: string;
  competency_codes: string[];
  safety_critical: boolean;
  points: number;
  feedback: string;
  feedback_rules: Record<string, string>;
  hints: Hint[];
  acceptable_actions: Action[];
};

type Definition = Record<string, unknown> & {
  steps: Step[];
  renderers?: Record<string, Record<string, unknown>>;
};

const SPATIAL = ["desktop_3d", "markerless_ar"] as const;
const HINT_PENALTY = 2;

function asStep(raw: Record<string, unknown>, index: number): Step {
  const feedbackRules =
    raw.feedback_rules && typeof raw.feedback_rules === "object"
      ? (raw.feedback_rules as Record<string, string>)
      : {};
  return {
    ...raw,
    order: index + 1,
    code: String(raw.code ?? `step-${index + 1}`),
    title: String(raw.title ?? ""),
    instruction: String(raw.instruction ?? ""),
    action_code: String(raw.action_code ?? ""),
    competency_codes: Array.isArray(raw.competency_codes) ? raw.competency_codes.map(String) : [],
    safety_critical: raw.safety_critical === true,
    points: typeof raw.points === "number" ? raw.points : 10,
    feedback: String(raw.feedback ?? feedbackRules.correct ?? ""),
    feedback_rules: feedbackRules,
    hints: Array.isArray(raw.hints) ? (raw.hints as Hint[]) : [],
    acceptable_actions: Array.isArray(raw.acceptable_actions)
      ? (raw.acceptable_actions as Action[])
      : [],
  };
}

function asDefinition(raw: Record<string, unknown>): Definition {
  const steps = Array.isArray(raw.steps) ? (raw.steps as Array<Record<string, unknown>>) : [];
  return { ...raw, steps: steps.map(asStep) };
}

/** Renames the primary action in place so tolerances and alternates stay attached to it. */
function withActionCode(step: Step, actionCode: string): Step {
  const actions = step.acceptable_actions.length
    ? step.acceptable_actions.map((action) =>
        action.action_code === step.action_code || action.is_primary
          ? { ...action, action_code: actionCode, is_primary: true }
          : action,
      )
    : [{ action_code: actionCode, label: step.title || actionCode, is_primary: true }];
  return { ...step, action_code: actionCode, acceptable_actions: actions };
}

function newStep(order: number, defaultCodes: string[]): Step {
  return asStep(
    {
      code: `step-${order}`,
      title: "",
      instruction: "",
      action_code: `complete_step_${order}`,
      competency_codes: defaultCodes,
      safety_critical: false,
      points: 10,
    },
    order - 1,
  );
}

function snapshot(input: {
  title: string;
  definition: Definition;
  gradingPolicy: number;
  assetPackage: number | null;
}) {
  return JSON.stringify(input);
}

type StepEditorProps = {
  step: Step;
  index: number;
  total: number;
  competencies: CompetencyOption[];
  onChange: (step: Step) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

function StepEditor({
  step,
  index,
  total,
  competencies,
  onChange,
  onMove,
  onRemove,
}: StepEditorProps) {
  const unknownCodes = step.competency_codes.filter(
    (code) => !competencies.some((competency) => competency.code === code),
  );
  const setRule = (outcome: string, message: string) =>
    onChange({ ...step, feedback_rules: { ...step.feedback_rules, [outcome]: message } });

  return (
    <fieldset className={`studio-step${step.safety_critical ? " is-safety-critical" : ""}`}>
      <legend>
        Step {index + 1}
        {step.safety_critical ? <span className="studio-safety-tag">Safety-critical</span> : null}
      </legend>
      <div className="studio-step-tools">
        <button
          type="button"
          className="studio-icon-button"
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          Move up
        </button>
        <button
          type="button"
          className="studio-icon-button"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          Move down
        </button>
        <button
          type="button"
          className="studio-icon-button"
          disabled={total === 1}
          onClick={onRemove}
        >
          Remove step
        </button>
      </div>
      <label>
        What the learner does
        <input
          value={step.title}
          onChange={(event) => onChange({ ...step, title: event.target.value })}
          placeholder="Open the DC isolator"
          required
          maxLength={180}
        />
      </label>
      <label>
        Instruction shown to the learner
        <textarea
          rows={2}
          value={step.instruction}
          onChange={(event) => onChange({ ...step, instruction: event.target.value })}
          placeholder="Switch the DC isolator beside the inverter to OFF."
          required
        />
      </label>
      <div className="studio-field-row">
        <label>
          Action code
          <input
            value={step.action_code}
            onChange={(event) =>
              onChange(
                withActionCode(step, event.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase()),
              )
            }
            required
            aria-describedby={`action-hint-${index}`}
          />
          <span className="field-note" id={`action-hint-${index}`}>
            The identifier the 2D button or 3D object sends. In a 3D model, name the clickable part{" "}
            <code>ACTION_{step.action_code || "code"}</code>.
          </span>
        </label>
        <label>
          Points
          <input
            type="number"
            min={0}
            max={100}
            value={step.points}
            onChange={(event) => onChange({ ...step, points: Number(event.target.value) })}
          />
        </label>
      </div>
      <fieldset className="studio-chip-group">
        <legend>Competencies this step shows evidence for</legend>
        {competencies.map((competency) => {
          const checked = step.competency_codes.includes(competency.code);
          return (
            <label key={competency.code} className={`studio-chip${checked ? " is-checked" : ""}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange({
                    ...step,
                    competency_codes: event.target.checked
                      ? [...step.competency_codes, competency.code]
                      : step.competency_codes.filter((code) => code !== competency.code),
                  })
                }
              />
              <span title={competency.title}>{competency.code}</span>
            </label>
          );
        })}
        {unknownCodes.length ? (
          <p className="form-error">
            Not in this course: {unknownCodes.join(", ")}.{" "}
            <button
              type="button"
              className="studio-link-button"
              onClick={() =>
                onChange({
                  ...step,
                  competency_codes: step.competency_codes.filter(
                    (code) => !unknownCodes.includes(code),
                  ),
                })
              }
            >
              Remove them
            </button>
          </p>
        ) : null}
      </fieldset>
      <label className="studio-check">
        <input
          type="checkbox"
          checked={step.safety_critical}
          onChange={(event) => onChange({ ...step, safety_critical: event.target.checked })}
        />
        <span>
          Safety-critical: doing this out of order is a safety error and costs more points
        </span>
      </label>
      <details className="studio-step-feedback">
        <summary>Feedback and hints</summary>
        <label>
          When the learner gets it right
          <input
            value={step.feedback}
            onChange={(event) =>
              onChange({
                ...step,
                feedback: event.target.value,
                feedback_rules: { ...step.feedback_rules, correct: event.target.value },
              })
            }
            placeholder="DC isolator open. The array side is still live."
          />
        </label>
        <label>
          After a wrong action
          <input
            value={step.feedback_rules.incorrect ?? ""}
            onChange={(event) => setRule("incorrect", event.target.value)}
            placeholder="Check the instruction again before acting."
          />
        </label>
        {step.safety_critical ? (
          <label>
            After a safety error
            <input
              value={step.feedback_rules.safety ?? ""}
              onChange={(event) => setRule("safety", event.target.value)}
              placeholder="Stop. Restore the safe sequence before continuing."
            />
          </label>
        ) : null}
        <ListEditor
          label="Hints"
          hint={`Learners may ask for each hint once; each costs ${HINT_PENALTY} points.`}
          items={step.hints.map((hint) => hint.text)}
          addLabel="Add hint"
          onChange={(texts) =>
            onChange({
              ...step,
              hints: texts.map((text, i) => ({
                code: step.hints[i]?.code ?? `hint-${i + 1}`,
                text,
                points_penalty: step.hints[i]?.points_penalty ?? HINT_PENALTY,
              })),
            })
          }
        />
      </details>
    </fieldset>
  );
}

export function ContentAuthoringPage({ canPublish }: { canPublish: boolean }) {
  const scenarioId = Number(useParams().scenarioId ?? 0);
  const navigate = useNavigate();
  const currentUser = useCurrentUser().data;
  const scenario = useAuthoredScenario(scenarioId);
  const lesson = useAuthoringLesson(scenario.data?.lesson ?? 0);
  const courses = useAuthoringCourses();
  const policies = useGradingPolicies();
  const packages = useAuthoredAssetPackages();
  const update = useUpdateAuthoredScenario();
  const clone = useCloneAuthoredScenario();
  const publish = usePublishAuthoredScenario();
  const transition = useTransitionAuthoredScenario();

  const [title, setTitle] = useState("");
  const [definition, setDefinition] = useState<Definition>({ steps: [] });
  const [gradingPolicy, setGradingPolicy] = useState(0);
  const [assetPackage, setAssetPackage] = useState<number | null>(null);
  const [saved, setSaved] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [rawError, setRawError] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  useEffect(() => {
    const data = scenario.data;
    if (!data) return;
    const parsed = asDefinition(data.definition);
    setTitle(data.title);
    setDefinition(parsed);
    setGradingPolicy(data.grading_policy);
    setAssetPackage(data.asset_package);
    setSaved(
      snapshot({
        title: data.title,
        definition: parsed,
        gradingPolicy: data.grading_policy,
        assetPackage: data.asset_package,
      }),
    );
    setRawJson(JSON.stringify(data.definition, null, 2));
  }, [scenario.data]);

  const isDirty = snapshot({ title, definition, gradingPolicy, assetPackage }) !== saved;
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const course = courses.data?.find((item) => item.id === lesson.data?.course);
  const competencies = useMemo(() => course?.competencies ?? [], [course]);
  const lessonCodes = useMemo(
    () =>
      competencies
        .filter((competency) => lesson.data?.competencies.includes(competency.id))
        .map((competency) => competency.code),
    [competencies, lesson.data],
  );
  const coursePackages = (packages.data ?? []).filter(
    (item) => item.course === lesson.data?.course && item.status === "published",
  );

  if (scenario.isPending) return <p className="panel-status dashboard">Loading the practical…</p>;
  if (scenario.isError || !scenario.data) {
    return (
      <section className="dashboard studio-page">
        <p className="form-error" role="alert">
          This practical could not be loaded. It may belong to another school.
        </p>
        <Link to="/authoring">Back to the Studio</Link>
      </section>
    );
  }

  const data: AuthoredScenario = scenario.data;
  const editable = data.status === "draft";
  const renderers = definition.renderers ?? {};
  const spatialEnabled = SPATIAL.some((name) => renderers[name]?.enabled === true);
  const markerEnabled = renderers.marker_ar?.enabled === true;
  const isOwnWork = data.authoredBy === currentUser?.id;

  const setSteps = (steps: Step[]) =>
    setDefinition((current) => ({
      ...current,
      steps: steps.map((step, index) => ({ ...step, order: index + 1 })),
    }));
  const setRenderer = (name: string, values: Record<string, unknown>) =>
    setDefinition((current) => ({
      ...current,
      renderers: {
        ...(current.renderers ?? {}),
        [name]: { ...(current.renderers?.[name] ?? {}), ...values },
      },
    }));

  const save = () =>
    update.mutate(
      {
        id: data.id,
        title,
        definition,
        grading_policy: gradingPolicy,
        asset_package: assetPackage,
      },
      {
        onSuccess: (result) => {
          setRawJson(JSON.stringify(result.definition, null, 2));
        },
      },
    );

  const mutationError = update.error ?? transition.error ?? publish.error ?? clone.error;

  return (
    <section className="dashboard studio-page">
      <Link
        className="studio-back-link"
        to={lesson.data ? `/authoring/lessons/${lesson.data.id}` : "/authoring"}
      >
        ← {lesson.data ? lesson.data.title : "All lessons"}
      </Link>
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">Practical scenario · version {data.version}</div>
          <h1>{data.title}</h1>
          <p>
            <ContentStatusBadge status={data.status} />{" "}
            {lesson.data && lesson.data.status !== "published"
              ? "The lesson must be published before this practical can be."
              : null}
          </p>
        </div>
      </div>

      {data.status === "draft" && data.reviewNotes ? (
        <div className="returned-banner" role="status">
          <strong>Returned for revision</strong>
          <p>{data.reviewNotes}</p>
        </div>
      ) : null}
      {!editable ? (
        <p className="studio-locked-note" role="status">
          Submitted and published versions are locked so learners' evidence always matches what they
          practised. Start a new version to make changes.{" "}
          <button
            type="button"
            className="studio-link-button"
            disabled={clone.isPending}
            onClick={() =>
              clone.mutate(data.id, {
                onSuccess: (result) =>
                  navigate(`/authoring/scenarios/${(result as AuthoredScenario).id}`),
              })
            }
          >
            Start a new version
          </button>
        </p>
      ) : null}

      <div className="studio-editor-grid">
        <form
          className="studio-form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <fieldset disabled={!editable} className="studio-plain-fieldset">
            <label>
              Practical title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={180}
              />
            </label>

            <h2 className="studio-form-heading">Procedure steps</h2>
            <p className="field-note">
              Steps run in this order. A learner completes each one before the next unlocks.
            </p>
            {definition.steps.map((step, index) => (
              <StepEditor
                key={`${step.code}-${index}`}
                step={step}
                index={index}
                total={definition.steps.length}
                competencies={competencies}
                onChange={(next) =>
                  setSteps(definition.steps.map((item, i) => (i === index ? next : item)))
                }
                onMove={(direction) => {
                  const steps = [...definition.steps];
                  const [moved] = steps.splice(index, 1);
                  steps.splice(index + direction, 0, moved);
                  setSteps(steps);
                }}
                onRemove={() => setSteps(definition.steps.filter((_, i) => i !== index))}
              />
            ))}
            {editable ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  setSteps([...definition.steps, newStep(definition.steps.length + 1, lessonCodes)])
                }
              >
                Add step
              </button>
            ) : null}

            <h2 className="studio-form-heading">Delivery</h2>
            <fieldset className="studio-delivery">
              <legend>How learners practise</legend>
              <label className="studio-check">
                <input
                  type="radio"
                  name="delivery"
                  checked={!spatialEnabled}
                  onChange={() => {
                    SPATIAL.forEach((name) => setRenderer(name, { enabled: false }));
                    setRenderer("marker_ar", { enabled: false });
                  }}
                />
                <span>
                  <strong>Accessible 2D only.</strong> Works on any phone and needs no 3D model.
                </span>
              </label>
              <label className="studio-check">
                <input
                  type="radio"
                  name="delivery"
                  checked={spatialEnabled}
                  onChange={() => SPATIAL.forEach((name) => setRenderer(name, { enabled: true }))}
                />
                <span>
                  <strong>2D plus 3D and AR.</strong> Needs a published 3D asset package. 2D stays
                  available as the fallback.
                </span>
              </label>
              {spatialEnabled ? (
                <>
                  <label>
                    3D asset package
                    <select
                      value={assetPackage ?? ""}
                      onChange={(event) =>
                        setAssetPackage(event.target.value ? Number(event.target.value) : null)
                      }
                    >
                      <option value="">Choose a published package</option>
                      {coursePackages.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} v{item.version}
                        </option>
                      ))}
                    </select>
                    {!coursePackages.length ? (
                      <span className="field-note">
                        No published package for this course yet.{" "}
                        <Link to="/authoring/assets">Upload one</Link>.
                      </span>
                    ) : null}
                  </label>
                  <label className="studio-check">
                    <input
                      type="checkbox"
                      checked={markerEnabled}
                      onChange={(event) =>
                        setRenderer("marker_ar", {
                          enabled: event.target.checked,
                          targetType: "qr-fiducial",
                          manualControlledRigFallback: true,
                        })
                      }
                    />
                    <span>Also allow printed-marker AR on the training rig</span>
                  </label>
                  {markerEnabled ? (
                    <label>
                      Marker code printed on the rig
                      <input
                        value={String(renderers.marker_ar?.targetValue ?? "")}
                        onChange={(event) =>
                          setRenderer("marker_ar", { targetValue: event.target.value })
                        }
                      />
                    </label>
                  ) : null}
                </>
              ) : null}
            </fieldset>
            <label>
              Grading policy
              <select
                value={gradingPolicy}
                onChange={(event) => setGradingPolicy(Number(event.target.value))}
              >
                {(policies.data ?? []).map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name} (pass at {policy.passThreshold}%)
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          {mutationError ? (
            <p className="form-error" role="alert">
              {describeApiError(mutationError, "That change could not be saved.")}
            </p>
          ) : null}
          {editable ? (
            <div className="studio-form-actions studio-sticky-actions">
              <button className="button button-primary" disabled={update.isPending || !isDirty}>
                {update.isPending ? "Saving…" : "Save draft"}
              </button>
              {isDirty ? (
                <span className="studio-unsaved">Unsaved changes</span>
              ) : update.isSuccess ? (
                <span className="form-success">Saved and re-checked</span>
              ) : null}
            </div>
          ) : null}

          <details className="authoring-advanced">
            <summary>Advanced: view or paste the scenario definition</summary>
            <p className="field-note">
              The same data the form edits. Paste a definition and apply it to replace the form.
            </p>
            <textarea
              rows={16}
              value={rawJson}
              disabled={!editable}
              spellCheck={false}
              onChange={(event) => setRawJson(event.target.value)}
              aria-label="Scenario definition JSON"
            />
            {editable ? (
              <button
                type="button"
                className="button button-secondary studio-small-button"
                onClick={() => {
                  try {
                    setDefinition(asDefinition(JSON.parse(rawJson) as Record<string, unknown>));
                    setRawError("");
                  } catch {
                    setRawError("This is not valid JSON, so nothing was changed.");
                  }
                }}
              >
                Apply to the form
              </button>
            ) : null}
            {rawError ? (
              <p className="form-error" role="alert">
                {rawError}
              </p>
            ) : null}
          </details>
        </form>

        <aside className="studio-side">
          <section className="studio-side-panel" aria-live="polite">
            <h2>Publication checks</h2>
            {isDirty ? (
              <p className="field-note">Save to re-run the checks on your changes.</p>
            ) : null}
            {data.publicationChecks.ready ? (
              <p className="form-success">Every automated check passes.</p>
            ) : (
              <ul className="studio-check-errors">
                {data.publicationChecks.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
            {data.status === "draft" ? (
              <button
                type="button"
                className="button button-primary button-full"
                disabled={transition.isPending || isDirty || !data.publicationChecks.ready}
                onClick={() => transition.mutate({ id: data.id, action: "submit" })}
              >
                Submit for review
              </button>
            ) : null}
            {canPublish && (data.status === "review" || data.status === "approved") ? (
              <div className="studio-review-actions">
                <label>
                  Review notes
                  <textarea
                    rows={3}
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                    placeholder="What you checked, or what must change."
                  />
                </label>
                {data.status === "review" ? (
                  <button
                    type="button"
                    className="button button-primary button-full"
                    disabled={transition.isPending || isOwnWork || !data.publicationChecks.ready}
                    onClick={() =>
                      transition.mutate({ id: data.id, action: "approve", reviewNotes })
                    }
                  >
                    Approve practical
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button-primary button-full"
                    disabled={publish.isPending}
                    onClick={() => publish.mutate(data.id)}
                  >
                    Publish practical
                  </button>
                )}
                {isOwnWork && data.status === "review" ? (
                  <p className="field-note">
                    You built this practical, so another reviewer must approve it.
                  </p>
                ) : null}
                <button
                  type="button"
                  className="button button-secondary button-full"
                  disabled={transition.isPending || !reviewNotes.trim()}
                  onClick={() =>
                    transition.mutate({ id: data.id, action: "return_to_draft", reviewNotes })
                  }
                >
                  Return to author with notes
                </button>
              </div>
            ) : null}
            {canPublish && data.status === "published" ? (
              <button
                type="button"
                className="button button-secondary button-full"
                disabled={transition.isPending}
                onClick={() => transition.mutate({ id: data.id, action: "retire" })}
              >
                Retire this version
              </button>
            ) : null}
          </section>

          <section className="studio-side-panel" aria-label="Learner preview">
            <h2>Learner preview</h2>
            <p className="field-note">
              What learners see in accessible 2D. No evidence is recorded.
            </p>
            <ol className="studio-preview-steps">
              {definition.steps.map((step, index) => (
                <li key={`${step.code}-${index}`}>
                  <strong>{step.title || "Untitled step"}</strong>
                  <span>{step.instruction || "No instruction yet."}</span>
                  {step.safety_critical ? (
                    <span className="studio-safety-tag">Safety-critical</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </section>
  );
}
