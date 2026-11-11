/**
 * Studio editors for what makes a practical interactive: decision options and their
 * consequences, fault cases, the pre-lesson check, free-order hazard hunts, and the 3D scene.
 *
 * Everything here edits the scenario definition the server already validates, so a draft saved
 * from these forms gets the same publication checks as one written by hand.
 */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  newPropId,
  PROP_CATALOGUE,
  PROP_GROUPS,
  type PartRole,
  type StateSpec,
} from "../../procedure/propCatalogue";
import {
  actionCode,
  asChoices,
  asMistakes,
  type Choice,
  type EditableDefinition,
  type Mistake,
} from "../../procedure/authoring";

export type { EditableDefinition };

type Json = Record<string, unknown>;

const EFFECTS: Array<[string, string]> = [
  ["none", "Message only"],
  ["spark", "Spark"],
  ["blown_fuse", "Blown fuse"],
  ["wrong_reading", "Wrong or no reading"],
  ["hazard", "Hazard warning"],
  ["damage", "Equipment damage"],
];

function ActionSuggestions({ id, codes }: { id: string; codes: string[] }) {
  return (
    <datalist id={id}>
      {codes.map((code) => (
        <option key={code} value={code} />
      ))}
    </datalist>
  );
}

function MistakeRows({
  mistakes,
  suggestions,
  listId,
  onChange,
  addLabel = "Add a wrong action",
  fixedCodes = [],
}: {
  mistakes: Record<string, Mistake>;
  suggestions: string[];
  listId: string;
  onChange(next: Record<string, Mistake>): void;
  addLabel?: string;
  /** Codes whose rows cannot be renamed, such as a decision's wrong options. */
  fixedCodes?: string[];
}) {
  const entries = Object.entries(mistakes);
  const rename = (from: string, to: string) => {
    const next: Record<string, Mistake> = {};
    for (const [code, value] of entries) next[code === from ? to : code] = value;
    onChange(next);
  };
  return (
    <div className="studio-rows">
      <ActionSuggestions id={listId} codes={suggestions} />
      {entries.map(([code, mistake], index) => (
        <div className="studio-row" key={`${index}-${code}`}>
          <label>
            Action
            <input
              list={listId}
              value={code}
              readOnly={fixedCodes.includes(code)}
              onChange={(event) => rename(code, actionCode(event.target.value))}
            />
          </label>
          <label>
            What happens
            <select
              value={mistake.effect}
              onChange={(event) =>
                onChange({ ...mistakes, [code]: { ...mistake, effect: event.target.value } })
              }
            >
              {EFFECTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="studio-row-wide">
            What the learner is told
            <textarea
              rows={2}
              value={mistake.message}
              onChange={(event) =>
                onChange({ ...mistakes, [code]: { ...mistake, message: event.target.value } })
              }
            />
          </label>
          <button
            type="button"
            className="studio-icon-button"
            onClick={() => onChange(Object.fromEntries(entries.filter(([key]) => key !== code)))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button button-secondary studio-small-button"
        onClick={() => {
          let code = "wrong_action";
          let suffix = 2;
          while (code in mistakes) code = `wrong_action_${suffix++}`;
          onChange({ ...mistakes, [code]: { effect: "none", message: "" } });
        }}
      >
        {addLabel}
      </button>
    </div>
  );
}

/** Inside a step: the options a learner chooses between, and what wrong actions lead to. */
export function StepChoicesEditor({
  step,
  index,
  suggestions,
  onChange,
  onSetCorrect,
}: {
  step: Json;
  index: number;
  suggestions: string[];
  onChange(step: Json): void;
  /** Makes an option the step's correct action, keeping tolerances attached. */
  onSetCorrect(code: string): void;
}) {
  const choices = asChoices(step.choices);
  const mistakes = asMistakes(step.mistakes);
  const correct = String(step.action_code ?? "");
  const setChoices = (next: Choice[]) => onChange({ ...step, choices: next });
  const wrongOptions = choices.filter((choice) => choice.action_code !== correct);
  const missingMessages = wrongOptions.filter((choice) => !mistakes[choice.action_code]);

  return (
    <details className="studio-step-feedback" open={choices.length > 0}>
      <summary>
        Options and consequences
        {choices.length ? ` · ${choices.length} options` : ""}
        {Object.keys(mistakes).length ? ` · ${Object.keys(mistakes).length} consequences` : ""}
      </summary>
      <label className="studio-check">
        <input
          type="checkbox"
          checked={choices.length > 0}
          onChange={(event) =>
            setChoices(
              event.target.checked
                ? [
                    { action_code: correct, label: String(step.title || "The right option") },
                    { action_code: `${correct}_other`, label: "" },
                  ]
                : [],
            )
          }
        />
        <span>The learner chooses between options (a decision, a setting, a diagnosis)</span>
      </label>
      {choices.length ? (
        <fieldset className="studio-rows">
          <legend>Options: tick the right one</legend>
          {choices.map((choice, position) => (
            <div className="studio-row" key={position}>
              <label className="studio-row-radio">
                <input
                  type="radio"
                  name={`correct-${index}`}
                  checked={choice.action_code === correct}
                  onChange={() => onSetCorrect(choice.action_code)}
                />
                <span className="sr-only">Right answer</span>
              </label>
              <label className="studio-row-wide">
                What the learner sees
                <input
                  value={choice.label}
                  onChange={(event) =>
                    setChoices(
                      choices.map((item, i) =>
                        i === position ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                  required
                />
              </label>
              <label>
                Action code
                <input
                  value={choice.action_code}
                  onChange={(event) => {
                    const code = actionCode(event.target.value);
                    const next = choices.map((item, i) =>
                      i === position ? { ...item, action_code: code } : item,
                    );
                    if (choice.action_code === correct) {
                      onChange({ ...step, choices: next });
                      onSetCorrect(code);
                    } else setChoices(next);
                  }}
                />
              </label>
              <button
                type="button"
                className="studio-icon-button"
                disabled={choice.action_code === correct || choices.length <= 2}
                onClick={() => setChoices(choices.filter((_, i) => i !== position))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button button-secondary studio-small-button"
            onClick={() =>
              setChoices([
                ...choices,
                { action_code: `${correct}_option_${choices.length + 1}`, label: "" },
              ])
            }
          >
            Add option
          </button>
        </fieldset>
      ) : null}
      <h4 className="studio-subheading">When the learner does something wrong</h4>
      <p className="field-note">
        Say what really happens: a spark, a blown fuse, a reading that makes no sense. Scoring is
        unchanged; the consequence is what the learner sees and hears.
      </p>
      {missingMessages.length ? (
        <button
          type="button"
          className="studio-link-button"
          onClick={() =>
            onChange({
              ...step,
              mistakes: {
                ...mistakes,
                ...Object.fromEntries(
                  missingMessages.map((choice) => [
                    choice.action_code,
                    { effect: "none", message: "" },
                  ]),
                ),
              },
            })
          }
        >
          Add a message for each wrong option ({missingMessages.length})
        </button>
      ) : null}
      <MistakeRows
        mistakes={mistakes}
        suggestions={suggestions}
        listId={`step-actions-${index}`}
        fixedCodes={wrongOptions.map((choice) => choice.action_code)}
        onChange={(next) => onChange({ ...step, mistakes: next })}
      />
    </details>
  );
}

/** Ordered steps or a free-order hunt, and the things that look wrong but are fine. */
export function BehaviourEditor({
  definition,
  onChange,
}: {
  definition: EditableDefinition;
  onChange(definition: EditableDefinition): void;
}) {
  const free = definition.sequence === "free";
  const distractors = asChoices(definition.distractors);
  const globalMistakes = asMistakes(definition.mistakes);
  const setDistractors = (next: Choice[], messages = globalMistakes) =>
    onChange({ ...definition, distractors: next, mistakes: messages });

  return (
    <fieldset className="studio-delivery">
      <legend>How the practical runs</legend>
      <label className="studio-check">
        <input
          type="radio"
          name="sequence"
          checked={!free}
          onChange={() => onChange({ ...definition, sequence: "ordered" })}
        />
        <span>
          <strong>In order.</strong> Each step unlocks the next, like a real procedure.
        </span>
      </label>
      <label className="studio-check">
        <input
          type="radio"
          name="sequence"
          checked={free}
          onChange={() => onChange({ ...definition, sequence: "free" })}
        />
        <span>
          <strong>In any order.</strong> For hazard hunts and inspections: every step is something
          to find.
        </span>
      </label>
      <h4 className="studio-subheading">Things that look wrong but are fine</h4>
      <p className="field-note">
        Offered beside the real answers. Choosing one costs a mistake and shows your message, e.g.
        “The first-aid box is where it should be.”
      </p>
      <div className="studio-rows">
        {distractors.map((item, position) => (
          <div className="studio-row" key={position}>
            <label className="studio-row-wide">
              What the learner sees
              <input
                value={item.label}
                onChange={(event) =>
                  setDistractors(
                    distractors.map((entry, i) =>
                      i === position ? { ...entry, label: event.target.value } : entry,
                    ),
                  )
                }
              />
            </label>
            <label>
              Action code
              <input
                value={item.action_code}
                onChange={(event) => {
                  const code = actionCode(event.target.value);
                  const { [item.action_code]: message, ...rest } = globalMistakes;
                  setDistractors(
                    distractors.map((entry, i) =>
                      i === position ? { ...entry, action_code: code } : entry,
                    ),
                    message ? { ...rest, [code]: message } : rest,
                  );
                }}
              />
            </label>
            <label className="studio-row-wide">
              Message
              <input
                value={globalMistakes[item.action_code]?.message ?? ""}
                onChange={(event) =>
                  setDistractors(distractors, {
                    ...globalMistakes,
                    [item.action_code]: { effect: "none", message: event.target.value },
                  })
                }
              />
            </label>
            <button
              type="button"
              className="studio-icon-button"
              onClick={() => {
                const { [item.action_code]: _removed, ...rest } = globalMistakes;
                void _removed;
                setDistractors(
                  distractors.filter((_, i) => i !== position),
                  rest,
                );
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button button-secondary studio-small-button"
          onClick={() =>
            setDistractors([
              ...distractors,
              { action_code: `spot_safe_${distractors.length + 1}`, label: "" },
            ])
          }
        >
          Add something that is fine
        </button>
      </div>
    </fieldset>
  );
}

type VariantDraft = { code: string; label?: string; steps?: Record<string, Json> };

/** Equivalent fault cases: each attempt gets one, so repeating a lesson is never a click-through. */
export function FaultCasesEditor({
  definition,
  onChange,
}: {
  definition: EditableDefinition;
  onChange(definition: EditableDefinition): void;
}) {
  const variants = (
    Array.isArray(definition.variants) ? definition.variants : []
  ) as VariantDraft[];
  const setVariants = (next: VariantDraft[]) =>
    onChange({ ...definition, variants: next.length ? next : undefined });
  const updateVariant = (position: number, next: VariantDraft) =>
    setVariants(variants.map((item, i) => (i === position ? next : item)));

  return (
    <div className="studio-rows">
      <p className="field-note">
        A fault case changes what is right at some steps: a different reading, a different breaker,
        a different diagnosis. Each new attempt gets a case the learner did not have last time.
        Leave this empty for a practical that is always the same.
      </p>
      {variants.map((variant, position) => (
        <fieldset className="studio-step" key={position}>
          <legend>
            Fault case {position + 1}
            <button
              type="button"
              className="studio-icon-button"
              onClick={() => setVariants(variants.filter((_, i) => i !== position))}
            >
              Remove case
            </button>
          </legend>
          <div className="studio-field-row">
            <label>
              Name (only authors and instructors see it)
              <input
                value={variant.label ?? ""}
                onChange={(event) =>
                  updateVariant(position, { ...variant, label: event.target.value })
                }
              />
            </label>
            <label>
              Code
              <input
                value={variant.code}
                onChange={(event) =>
                  updateVariant(position, {
                    ...variant,
                    code: event.target.value.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
                  })
                }
              />
            </label>
          </div>
          {Object.entries(variant.steps ?? {}).map(([stepCode, override]) => (
            <VariantStepEditor
              key={stepCode}
              step={definition.steps.find((item) => item.code === stepCode)}
              stepCode={stepCode}
              override={override}
              onChange={(next) =>
                updateVariant(position, {
                  ...variant,
                  steps: { ...(variant.steps ?? {}), [stepCode]: next },
                })
              }
              onRemove={() => {
                const { [stepCode]: _gone, ...rest } = variant.steps ?? {};
                void _gone;
                updateVariant(position, { ...variant, steps: rest });
              }}
            />
          ))}
          <label>
            Change another step in this case
            <select
              value=""
              onChange={(event) => {
                const stepCode = event.target.value;
                if (!stepCode) return;
                updateVariant(position, {
                  ...variant,
                  steps: { ...(variant.steps ?? {}), [stepCode]: {} },
                });
              }}
            >
              <option value="">Choose a step</option>
              {definition.steps
                .filter((step) => !(String(step.code) in (variant.steps ?? {})))
                .map((step) => (
                  <option key={String(step.code)} value={String(step.code)}>
                    {String(step.order)}. {String(step.title || step.code)}
                  </option>
                ))}
            </select>
          </label>
        </fieldset>
      ))}
      <button
        type="button"
        className="button button-secondary studio-small-button"
        onClick={() =>
          setVariants([...variants, { code: `case-${variants.length + 1}`, label: "", steps: {} }])
        }
      >
        Add fault case
      </button>
    </div>
  );
}

function VariantStepEditor({
  step,
  stepCode,
  override,
  onChange,
  onRemove,
}: {
  step: Json | undefined;
  stepCode: string;
  override: Json;
  onChange(next: Json): void;
  onRemove(): void;
}) {
  const choices = asChoices(step?.choices);
  const metadata = (override.metadata as Json) ?? {};
  const tolerance = (override.tolerances as Json[] | undefined)?.[0];
  const correct = String(override.action_code ?? step?.action_code ?? "");
  const mistakes = asMistakes(override.mistakes);

  // Writing only what the author set, so the base step still supplies everything else.
  const set = (changes: Json) => {
    const next: Json = { ...override, ...changes };
    for (const [key, value] of Object.entries(next)) {
      if (value === "" || value === undefined) delete next[key];
    }
    onChange(next);
  };
  const setCorrect = (code: string) =>
    set({
      action_code: code,
      acceptable_actions: [
        {
          action_code: code,
          label: String(step?.title ?? code),
          is_primary: true,
          tolerance: tolerance ?? null,
        },
      ],
    });
  const setReading = (changes: Json) => {
    const nextMetadata = { ...metadata, ...changes };
    for (const [key, value] of Object.entries(nextMetadata)) {
      if (value === "" || value === undefined) delete nextMetadata[key];
    }
    set({ metadata: Object.keys(nextMetadata).length ? nextMetadata : undefined });
  };
  const setTolerance = (minimum: string, maximum: string) => {
    if (minimum === "" && maximum === "") {
      set({ tolerances: undefined, acceptable_actions: undefined });
      return;
    }
    const next = {
      code: `${stepCode}-reading`,
      measurement: String(step?.title ?? "Reading"),
      minimum_value: minimum,
      maximum_value: maximum,
      unit: String(metadata.unit ?? ""),
    };
    set({
      tolerances: [next],
      acceptable_actions: [
        {
          action_code: correct,
          label: String(step?.title ?? correct),
          is_primary: true,
          tolerance: next,
        },
      ],
    });
  };

  return (
    <div className="studio-variant-step">
      <div className="studio-variant-step-head">
        <strong>{String(step?.title || stepCode)}</strong>
        <button type="button" className="studio-icon-button" onClick={onRemove}>
          Stop changing this step
        </button>
      </div>
      <label>
        Instruction in this case (leave empty to keep the step's own)
        <input
          value={String(override.instruction ?? "")}
          placeholder={String(step?.instruction ?? "")}
          onChange={(event) => set({ instruction: event.target.value })}
        />
      </label>
      <div className="studio-field-row">
        <label>
          Reading shown
          <input
            value={
              metadata.reading === undefined || metadata.reading === null
                ? ""
                : String(metadata.reading)
            }
            inputMode="decimal"
            onChange={(event) =>
              setReading({
                reading: event.target.value === "" ? undefined : Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          Unit
          <input
            value={String(metadata.unit ?? "")}
            onChange={(event) => setReading({ unit: event.target.value })}
            placeholder="V"
          />
        </label>
        <label>
          Display text (optional)
          <input
            value={String(metadata.display ?? "")}
            onChange={(event) => setReading({ display: event.target.value })}
            placeholder="OL"
          />
        </label>
      </div>
      <div className="studio-field-row">
        <label>
          Accept readings from
          <input
            value={String(tolerance?.minimum_value ?? "")}
            inputMode="decimal"
            onChange={(event) =>
              setTolerance(event.target.value, String(tolerance?.maximum_value ?? ""))
            }
          />
        </label>
        <label>
          to
          <input
            value={String(tolerance?.maximum_value ?? "")}
            inputMode="decimal"
            onChange={(event) =>
              setTolerance(String(tolerance?.minimum_value ?? ""), event.target.value)
            }
          />
        </label>
      </div>
      {choices.length ? (
        <label>
          The right option in this case
          <select value={correct} onChange={(event) => setCorrect(event.target.value)}>
            {choices.map((choice) => (
              <option key={choice.action_code} value={choice.action_code}>
                {choice.label || choice.action_code}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Feedback when right in this case
        <input
          value={String(override.feedback ?? "")}
          onChange={(event) =>
            set({
              feedback: event.target.value,
              feedback_rules: event.target.value ? { correct: event.target.value } : undefined,
            })
          }
        />
      </label>
      {choices.length ? (
        <>
          <h4 className="studio-subheading">Why each other option is wrong in this case</h4>
          <MistakeRows
            mistakes={{
              ...Object.fromEntries(
                choices
                  .filter((choice) => choice.action_code !== correct)
                  .map((choice) => [choice.action_code, { effect: "none", message: "" }]),
              ),
              ...mistakes,
            }}
            suggestions={choices.map((choice) => choice.action_code)}
            listId={`variant-${stepCode}`}
            fixedCodes={choices.map((choice) => choice.action_code)}
            addLabel="Add another wrong action"
            onChange={(next) =>
              set({
                mistakes: Object.fromEntries(
                  Object.entries(next).filter(([, value]) => value.message.trim()),
                ),
              })
            }
          />
        </>
      ) : null}
    </div>
  );
}

type Question = {
  code: string;
  prompt: string;
  options: Array<{ code: string; label: string }>;
  answer: string;
  explanation: string;
};

/** The short multiple-choice check before the practical, marked on the server. */
export function KnowledgeCheckEditor({
  definition,
  onChange,
}: {
  definition: EditableDefinition;
  onChange(definition: EditableDefinition): void;
}) {
  const check = definition.knowledge_check as { questions?: Question[] } | undefined;
  const questions = check?.questions ?? [];
  const setQuestions = (next: Question[]) =>
    onChange({ ...definition, knowledge_check: next.length ? { questions: next } : undefined });
  const update = (position: number, next: Question) =>
    setQuestions(questions.map((item, i) => (i === position ? next : item)));

  return (
    <div className="studio-rows">
      <p className="field-note">
        Learners answer before an assessed attempt and see an explanation for anything they get
        wrong. It does not count towards the score. Without questions, learners tick three readiness
        statements instead.
      </p>
      {questions.map((question, position) => (
        <fieldset className="studio-step" key={question.code}>
          <legend>
            Question {position + 1}
            <button
              type="button"
              className="studio-icon-button"
              onClick={() => setQuestions(questions.filter((_, i) => i !== position))}
            >
              Remove question
            </button>
          </legend>
          <label>
            Question
            <input
              value={question.prompt}
              onChange={(event) => update(position, { ...question, prompt: event.target.value })}
              required
            />
          </label>
          <fieldset className="studio-rows">
            <legend>Answers: tick the right one</legend>
            {question.options.map((option, index) => (
              <div className="studio-row" key={option.code}>
                <label className="studio-row-radio">
                  <input
                    type="radio"
                    name={`answer-${question.code}`}
                    checked={question.answer === option.code}
                    onChange={() => update(position, { ...question, answer: option.code })}
                  />
                  <span className="sr-only">Right answer</span>
                </label>
                <label className="studio-row-wide">
                  <span className="sr-only">Answer {index + 1}</span>
                  <input
                    value={option.label}
                    onChange={(event) =>
                      update(position, {
                        ...question,
                        options: question.options.map((item, i) =>
                          i === index ? { ...item, label: event.target.value } : item,
                        ),
                      })
                    }
                    required
                  />
                </label>
                <button
                  type="button"
                  className="studio-icon-button"
                  disabled={question.options.length <= 2 || question.answer === option.code}
                  onClick={() =>
                    update(position, {
                      ...question,
                      options: question.options.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button button-secondary studio-small-button"
              onClick={() =>
                update(position, {
                  ...question,
                  options: [
                    ...question.options,
                    { code: `option-${Date.now().toString(36)}`, label: "" },
                  ],
                })
              }
            >
              Add answer
            </button>
          </fieldset>
          <label>
            Explanation shown when someone gets it wrong
            <textarea
              rows={2}
              value={question.explanation}
              onChange={(event) =>
                update(position, { ...question, explanation: event.target.value })
              }
            />
          </label>
        </fieldset>
      ))}
      <button
        type="button"
        className="button button-secondary studio-small-button"
        onClick={() =>
          setQuestions([
            ...questions,
            {
              code: `question-${questions.length + 1}-${Date.now().toString(36)}`,
              prompt: "",
              options: [
                { code: "a", label: "" },
                { code: "b", label: "" },
                { code: "c", label: "" },
              ],
              answer: "a",
              explanation: "",
            },
          ])
        }
      >
        Add question
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------------------------

type SceneProp = {
  id: string;
  kind: string;
  position: [number, number];
  rotation?: number;
  label?: string;
  state?: Json;
  reading_step?: string;
  reading_mode?: string;
};
type Binding = {
  action?: string | string[];
  tool?: string;
  label?: string;
  accepts?: Record<string, string | string[]>;
};
type Effect = { when: string; set: Record<string, Json> };
type SceneDraft = {
  version?: number;
  layout?: "bench" | "floor";
  props: SceneProp[];
  bindings: Record<string, Binding>;
  effects?: Effect[];
};

const SURFACE = { bench: { width: 8.2, depth: 4.6 }, floor: { width: 9, depth: 5.4 } };

function listText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(", ") : (value ?? "");
}

function listValue(text: string): string | string[] {
  const parts = text
    .split(",")
    .map((item) => actionCode(item.trim()))
    .filter(Boolean);
  return parts.length > 1 ? parts : (parts[0] ?? "");
}

function roleOf(binding: Binding | undefined): PartRole | "none" {
  if (!binding) return "none";
  if (binding.tool) return "tool";
  if (binding.accepts) return "target";
  return "action";
}

/** Top-down layout: drag props to place them. Keyboard users edit the numbers instead. */
function LayoutBoard({
  scene,
  selected,
  onSelect,
  onMove,
}: {
  scene: SceneDraft;
  selected: string | null;
  onSelect(id: string): void;
  onMove(id: string, position: [number, number]): void;
}) {
  const surface = SURFACE[scene.layout ?? "bench"];
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);
  const toScene = (event: ReactPointerEvent): [number, number] | null => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return null;
    const x = ((event.clientX - box.left) / box.width - 0.5) * surface.width;
    const z = ((event.clientY - box.top) / box.height - 0.5) * surface.depth;
    const clamp = (value: number, half: number) =>
      Math.round(Math.max(-half, Math.min(half, value)) * 10) / 10;
    return [clamp(x, surface.width / 2 - 0.2), clamp(z, surface.depth / 2 - 0.2)];
  };

  return (
    <svg
      ref={svg}
      className="studio-layout"
      viewBox={`${-surface.width / 2} ${-surface.depth / 2} ${surface.width} ${surface.depth}`}
      role="img"
      aria-label="Top-down layout of the scene"
      onPointerMove={(event) => {
        if (!dragging.current) return;
        const position = toScene(event);
        if (position) onMove(dragging.current, position);
      }}
      onPointerUp={() => {
        dragging.current = null;
      }}
      onPointerLeave={() => {
        dragging.current = null;
      }}
    >
      <rect
        x={-surface.width / 2}
        y={-surface.depth / 2}
        width={surface.width}
        height={surface.depth}
        className="studio-layout-surface"
      />
      <text x={0} y={surface.depth / 2 - 0.12} className="studio-layout-front">
        front (learner)
      </text>
      {scene.props.map((prop) => (
        <g
          key={prop.id}
          transform={`translate(${prop.position[0]} ${prop.position[1]})`}
          className={prop.id === selected ? "is-selected" : undefined}
          onPointerDown={(event) => {
            (event.target as Element).setPointerCapture?.(event.pointerId);
            dragging.current = prop.id;
            onSelect(prop.id);
          }}
        >
          <circle r={0.42} />
          <text y={0.08}>{(prop.label || prop.id).slice(0, 14)}</text>
        </g>
      ))}
    </svg>
  );
}

function StateValueInput({
  spec,
  value,
  anchors,
  onChange,
}: {
  spec: StateSpec | undefined;
  value: unknown;
  anchors: string[];
  onChange(value: unknown): void;
}) {
  if (!spec) {
    return <input value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />;
  }
  if (spec.type === "boolean") {
    return (
      <select
        value={String(value === true)}
        onChange={(event) => onChange(event.target.value === "true")}
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (spec.type === "number") {
    return (
      <input
        inputMode="decimal"
        value={value === undefined ? "" : String(value)}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : Number(event.target.value))
        }
      />
    );
  }
  const options = spec.type === "choice" ? spec.values : anchors;
  return (
    <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">{spec.type === "anchor" ? "Nowhere (put away)" : "Choose"}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

/** Builds the 3D scene from the shared prop library: placement, what each part does, effects. */
export function SceneEditor({
  definition,
  suggestions,
  onChange,
}: {
  definition: EditableDefinition;
  suggestions: string[];
  onChange(definition: EditableDefinition): void;
}) {
  const scene = definition.scene as SceneDraft | undefined;
  const [selected, setSelected] = useState<string | null>(scene?.props[0]?.id ?? null);
  const [newKind, setNewKind] = useState("battery");

  if (!scene) {
    return (
      <div className="studio-rows">
        <p className="field-note">
          Without a scene, the 3D view shows a labelled block for every action, which works but
          teaches little. Build the bench from the prop library so learners pick up the real tools.
        </p>
        <button
          type="button"
          className="button button-secondary studio-small-button"
          onClick={() =>
            onChange({
              ...definition,
              scene: { version: 1, layout: "bench", props: [], bindings: {}, effects: [] },
            })
          }
        >
          Start a scene
        </button>
      </div>
    );
  }

  const setScene = (next: SceneDraft) => onChange({ ...definition, scene: next });
  const prop = scene.props.find((item) => item.id === selected) ?? null;
  const spec = prop ? PROP_CATALOGUE[prop.kind] : undefined;
  const effects = scene.effects ?? [];
  const tools = Object.values(scene.bindings)
    .map((binding) => binding.tool)
    .filter((tool): tool is string => Boolean(tool));
  const anchors = scene.props.flatMap((item) =>
    (PROP_CATALOGUE[item.kind]?.parts ?? [])
      .filter((part) => part.role === "target")
      .map((part) => `${item.id}.${part.name}`),
  );
  const steps = definition.steps;

  const setProp = (id: string, changes: Partial<SceneProp>) =>
    setScene({
      ...scene,
      props: scene.props.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    });
  const setBinding = (key: string, binding: Binding | null) => {
    const bindings = { ...scene.bindings };
    if (binding) bindings[key] = binding;
    else delete bindings[key];
    setScene({ ...scene, bindings });
  };
  const removeProp = (id: string) => {
    const bindings = Object.fromEntries(
      Object.entries(scene.bindings).filter(([key]) => !key.startsWith(`${id}.`)),
    );
    setScene({
      ...scene,
      props: scene.props.filter((item) => item.id !== id),
      bindings,
      effects: effects
        .map((effect) => ({
          ...effect,
          set: Object.fromEntries(Object.entries(effect.set).filter(([key]) => key !== id)),
        }))
        .filter((effect) => Object.keys(effect.set).length),
    });
    setSelected(scene.props.find((item) => item.id !== id)?.id ?? null);
  };

  return (
    <div className="studio-scene">
      <ActionSuggestions id="scene-actions" codes={suggestions} />
      <div className="studio-scene-bar">
        <label>
          Surface
          <select
            value={scene.layout ?? "bench"}
            onChange={(event) =>
              setScene({ ...scene, layout: event.target.value as "bench" | "floor" })
            }
          >
            <option value="bench">Workbench</option>
            <option value="floor">Workshop floor</option>
          </select>
        </label>
        <label>
          Add equipment
          <select value={newKind} onChange={(event) => setNewKind(event.target.value)}>
            {PROP_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {Object.entries(PROP_CATALOGUE)
                  .filter(([, item]) => item.group === group)
                  .map(([kind, item]) => (
                    <option key={kind} value={kind}>
                      {item.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button button-secondary studio-small-button"
          onClick={() => {
            const id = newPropId(
              newKind,
              scene.props.map((item) => item.id),
            );
            const catalogue = PROP_CATALOGUE[newKind];
            const bindings = { ...scene.bindings };
            // Tools are useful straight away; actions and targets wait for the author.
            for (const part of catalogue.parts) {
              if (part.role === "tool" && part.tool) {
                bindings[`${id}.${part.name}`] = { tool: part.tool, label: part.label };
              }
            }
            setScene({
              ...scene,
              props: [
                ...scene.props,
                { id, kind: newKind, position: [0, 0], label: catalogue.label },
              ],
              bindings,
            });
            setSelected(id);
          }}
        >
          Add
        </button>
        <button
          type="button"
          className="studio-link-button"
          onClick={() => {
            const { scene: _removed, ...rest } = definition;
            void _removed;
            onChange(rest as EditableDefinition);
          }}
        >
          Remove the scene
        </button>
      </div>

      <LayoutBoard
        scene={scene}
        selected={selected}
        onSelect={setSelected}
        onMove={(id, position) => setProp(id, { position })}
      />

      {prop && spec ? (
        <fieldset className="studio-step">
          <legend>
            {spec.label} <code>{prop.id}</code>
            <button
              type="button"
              className="studio-icon-button"
              onClick={() => removeProp(prop.id)}
            >
              Remove
            </button>
          </legend>
          <div className="studio-field-row">
            <label>
              Label learners see
              <input
                value={prop.label ?? ""}
                onChange={(event) => setProp(prop.id, { label: event.target.value })}
              />
            </label>
            <label>
              Left–right
              <input
                type="number"
                step={0.1}
                value={prop.position[0]}
                onChange={(event) =>
                  setProp(prop.id, { position: [Number(event.target.value), prop.position[1]] })
                }
              />
            </label>
            <label>
              Back–front
              <input
                type="number"
                step={0.1}
                value={prop.position[1]}
                onChange={(event) =>
                  setProp(prop.id, { position: [prop.position[0], Number(event.target.value)] })
                }
              />
            </label>
            <label>
              Turn (degrees)
              <input
                type="number"
                step={15}
                value={prop.rotation ?? 0}
                onChange={(event) =>
                  setProp(prop.id, { rotation: Number(event.target.value) || undefined })
                }
              />
            </label>
          </div>
          {spec.showsReading ? (
            <div className="studio-field-row">
              <label>
                Shows the reading of step
                <select
                  value={prop.reading_step ?? ""}
                  onChange={(event) =>
                    setProp(prop.id, { reading_step: event.target.value || undefined })
                  }
                >
                  <option value="">None</option>
                  {steps.map((step) => (
                    <option key={String(step.code)} value={String(step.code)}>
                      {String(step.order)}. {String(step.title || step.code)}
                    </option>
                  ))}
                </select>
              </label>
              {prop.kind === "multimeter" ? (
                <label>
                  On dial setting
                  <select
                    value={prop.reading_mode ?? "dcv"}
                    onChange={(event) =>
                      setProp(prop.id, {
                        reading_mode: event.target.value === "dcv" ? undefined : event.target.value,
                      })
                    }
                  >
                    <option value="dcv">DC volts</option>
                    <option value="acv">AC volts</option>
                    <option value="ohm">Resistance</option>
                    <option value="amp">Current</option>
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          <h4 className="studio-subheading">What each part does</h4>
          <div className="studio-rows">
            {spec.parts.map((part) => {
              const key = `${prop.id}.${part.name}`;
              const binding = scene.bindings[key];
              const role = roleOf(binding);
              return (
                <div className="studio-row" key={key}>
                  <label>
                    {part.label}
                    <select
                      value={role}
                      onChange={(event) => {
                        const next = event.target.value;
                        setBinding(
                          key,
                          next === "none"
                            ? null
                            : next === "tool"
                              ? { tool: part.tool ?? part.name, label: part.label }
                              : next === "target"
                                ? { accepts: {} }
                                : { action: "" },
                        );
                      }}
                    >
                      <option value="none">Does nothing</option>
                      <option value="action">Touching it is an action</option>
                      <option value="tool">It is a tool to pick up</option>
                      <option value="target">A tool is used on it</option>
                    </select>
                  </label>
                  {role === "action" ? (
                    <label className="studio-row-wide">
                      Action code (several, comma-separated: the first not yet done)
                      <input
                        list="scene-actions"
                        value={listText(binding?.action)}
                        onChange={(event) =>
                          setBinding(key, { action: listValue(event.target.value) })
                        }
                      />
                    </label>
                  ) : null}
                  {role === "tool" ? (
                    <label className="studio-row-wide">
                      Tool name
                      <input
                        value={binding?.tool ?? ""}
                        onChange={(event) =>
                          setBinding(key, { ...binding, tool: actionCode(event.target.value) })
                        }
                      />
                    </label>
                  ) : null}
                  {role === "target" ? (
                    <div className="studio-row-wide studio-accepts">
                      {[...new Set([...tools, ...Object.keys(binding?.accepts ?? {})])].map(
                        (tool) => (
                          <label key={tool}>
                            With the <strong>{tool}</strong>
                            <input
                              list="scene-actions"
                              value={listText(binding?.accepts?.[tool])}
                              placeholder="does nothing"
                              onChange={(event) => {
                                const accepts = { ...(binding?.accepts ?? {}) };
                                const value = listValue(event.target.value);
                                if (value === "" || (Array.isArray(value) && !value.length))
                                  delete accepts[tool];
                                else accepts[tool] = value;
                                setBinding(key, { accepts });
                              }}
                            />
                          </label>
                        ),
                      )}
                      {!tools.length ? (
                        <span className="field-note">Add a tool to the scene first.</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <p className="field-note">Add equipment, then select it on the layout to set it up.</p>
      )}

      <h4 className="studio-subheading">What changes when a step is done</h4>
      <p className="field-note">
        For example: when <code>apply_lock</code> is done, the board shows as locked. Probes and
        clamps move to where they were attached.
      </p>
      <div className="studio-rows">
        {effects.flatMap((effect, effectIndex) =>
          Object.entries(effect.set).flatMap(([propId, changes]) =>
            Object.entries(changes).map(([stateKey, value]) => {
              const target = scene.props.find((item) => item.id === propId);
              const states = target ? (PROP_CATALOGUE[target.kind]?.states ?? []) : [];
              const stateSpec = states.find((item) => item.key === stateKey);
              // `when` null removes the row.
              const replace = (
                when: string | null,
                nextProp: string,
                nextKey: string,
                nextValue: unknown,
              ) => {
                const others = effects
                  .map((item, i) =>
                    i !== effectIndex
                      ? item
                      : {
                          ...item,
                          set: Object.fromEntries(
                            Object.entries(item.set)
                              .map(([id, values]) => [
                                id,
                                Object.fromEntries(
                                  Object.entries(values).filter(
                                    ([key]) => !(id === propId && key === stateKey),
                                  ),
                                ),
                              ])
                              .filter(([, values]) => Object.keys(values as Json).length),
                          ),
                        },
                  )
                  .filter((item) => Object.keys(item.set).length);
                if (when !== null) {
                  others.push({ when, set: { [nextProp]: { [nextKey]: nextValue } } });
                }
                setScene({ ...scene, effects: mergeEffects(others) });
              };
              return (
                <div className="studio-row" key={`${effectIndex}-${propId}-${stateKey}`}>
                  <label>
                    When
                    <input
                      list="scene-actions"
                      value={effect.when}
                      onChange={(event) =>
                        replace(actionCode(event.target.value), propId, stateKey, value)
                      }
                    />
                  </label>
                  <label>
                    Equipment
                    <select
                      value={propId}
                      onChange={(event) =>
                        replace(effect.when, event.target.value, stateKey, value)
                      }
                    >
                      {scene.props.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label || item.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Shows
                    <select
                      value={stateKey}
                      onChange={(event) => replace(effect.when, propId, event.target.value, value)}
                    >
                      {[...states.map((item) => item.key), ...(stateSpec ? [] : [stateKey])].map(
                        (key) => (
                          <option key={key} value={key}>
                            {states.find((item) => item.key === key)?.label ?? key}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    As
                    <StateValueInput
                      spec={stateSpec}
                      value={value}
                      anchors={anchors}
                      onChange={(next) => replace(effect.when, propId, stateKey, next)}
                    />
                  </label>
                  <button
                    type="button"
                    className="studio-icon-button"
                    onClick={() => replace(null, propId, stateKey, value)}
                  >
                    Remove
                  </button>
                </div>
              );
            }),
          ),
        )}
        <button
          type="button"
          className="button button-secondary studio-small-button"
          disabled={!scene.props.some((item) => PROP_CATALOGUE[item.kind]?.states.length)}
          onClick={() => {
            const target = scene.props.find((item) => PROP_CATALOGUE[item.kind]?.states.length);
            if (!target) return;
            const state = PROP_CATALOGUE[target.kind].states[0];
            const initial =
              state.type === "boolean" ? true : state.type === "choice" ? state.values[0] : null;
            setScene({
              ...scene,
              effects: mergeEffects([
                ...effects,
                {
                  when: String(steps[0]?.action_code ?? ""),
                  set: { [target.id]: { [state.key]: initial } },
                },
              ]),
            });
          }}
        >
          Add a change
        </button>
      </div>
    </div>
  );
}

/** One effect per action, so the stored scene stays easy to read. */
function mergeEffects(effects: Effect[]): Effect[] {
  const byAction = new Map<string, Effect>();
  for (const effect of effects) {
    const current = byAction.get(effect.when) ?? { when: effect.when, set: {} };
    for (const [propId, values] of Object.entries(effect.set)) {
      current.set[propId] = { ...(current.set[propId] ?? {}), ...values };
    }
    byAction.set(effect.when, current);
  }
  return [...byAction.values()];
}
