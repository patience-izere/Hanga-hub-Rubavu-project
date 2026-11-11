/**
 * The steps of one fault case, worked out on the device.
 *
 * Mirrors `resolved_steps` in `mechlab/lab/scenario_runtime.py`, which stays the authority for
 * every recorded attempt. The Studio preview uses this so an author can try each fault case of an
 * unsaved draft.
 */

import type { ProcedureStep } from "../api/learning";

export type Variant = {
  code: string;
  label?: string;
  steps?: Record<string, Record<string, unknown>>;
};

export function variantsOf(definition: Record<string, unknown>): Variant[] {
  const raw = definition.variants;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is Variant =>
      Boolean(item) && typeof item === "object" && typeof (item as Variant).code === "string",
  );
}

/** Fills in what a learner-facing step needs, for steps typed by hand in the Studio. */
export function asProcedureStep(raw: Record<string, unknown>, index: number): ProcedureStep {
  const actionCode = String(raw.action_code ?? "");
  const actions =
    Array.isArray(raw.acceptable_actions) && raw.acceptable_actions.length
      ? (raw.acceptable_actions as ProcedureStep["acceptable_actions"])
      : [
          {
            action_code: actionCode,
            label: String(raw.title ?? actionCode),
            is_primary: true,
            tolerance: null,
          },
        ];
  const feedbackRules =
    raw.feedback_rules && typeof raw.feedback_rules === "object"
      ? (raw.feedback_rules as Record<string, string>)
      : {};
  return {
    id: index,
    order: index + 1,
    code: String(raw.code ?? `step-${index + 1}`),
    title: String(raw.title ?? ""),
    instruction: String(raw.instruction ?? ""),
    action_code: actionCode,
    feedback: String(raw.feedback ?? feedbackRules.correct ?? ""),
    safety_critical: raw.safety_critical === true,
    points: typeof raw.points === "number" ? raw.points : 10,
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    acceptable_actions: actions,
    hints: Array.isArray(raw.hints) ? (raw.hints as ProcedureStep["hints"]) : [],
    tolerances: Array.isArray(raw.tolerances)
      ? (raw.tolerances as ProcedureStep["tolerances"])
      : [],
    tools: Array.isArray(raw.tools) ? (raw.tools as ProcedureStep["tools"]) : [],
    hazards: Array.isArray(raw.hazards) ? (raw.hazards as ProcedureStep["hazards"]) : [],
    feedback_rules: { correct: String(raw.feedback ?? ""), ...feedbackRules },
    competency_codes: Array.isArray(raw.competency_codes) ? raw.competency_codes.map(String) : [],
    choices: Array.isArray(raw.choices) ? (raw.choices as ProcedureStep["choices"]) : [],
    mistakes:
      raw.mistakes && typeof raw.mistakes === "object"
        ? (raw.mistakes as ProcedureStep["mistakes"])
        : {},
  };
}

/** The scenario's steps with one fault case's differences applied. */
export function resolvedSteps(
  definition: Record<string, unknown>,
  variantCode = "",
): ProcedureStep[] {
  const steps = Array.isArray(definition.steps)
    ? (definition.steps as Array<Record<string, unknown>>)
    : [];
  const overrides = variantsOf(definition).find((item) => item.code === variantCode)?.steps ?? {};
  return steps.map((step, index) => {
    const override = overrides[String(step.code)];
    if (!override || typeof override !== "object") return asProcedureStep(step, index);
    const merged: Record<string, unknown> = {
      ...step,
      ...override,
      metadata: {
        ...((step.metadata as Record<string, unknown>) ?? {}),
        ...((override.metadata as Record<string, unknown>) ?? {}),
      },
      // A fault case changes what is right, never which step it is.
      code: step.code,
      order: step.order,
    };
    return asProcedureStep(merged, index);
  });
}
