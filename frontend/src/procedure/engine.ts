/**
 * How a procedure responds to an action, without a server.
 *
 * The server is the authority for every recorded attempt. The same rules are needed on the
 * device for two cases: practising offline (evidence is queued and scored later) and the
 * visitor demo (nothing is recorded at all). Keeping them in one place stops the two drifting.
 */

import type { Consequence, ProcedureStep } from "../api/learning";

export type Sequence = "ordered" | "free";

export type LocalEvaluation = {
  correct: boolean;
  /** The step the action completed, or the step it was a mistake against. */
  step: ProcedureStep | null;
  completedCodes: string[];
  nextStep: ProcedureStep | null;
  consequence: Consequence | null;
  message: string;
  /** In a free-order procedure, repeating a finished step is neither progress nor a mistake. */
  repeated: boolean;
};

function accepts(step: ProcedureStep, action: string): boolean {
  return step.acceptable_actions?.length
    ? step.acceptable_actions.some((item) => item.action_code === action)
    : step.action_code === action;
}

export function evaluateAction(
  steps: ProcedureStep[],
  completed: string[],
  action: string,
  sequence: Sequence = "ordered",
  globalMistakes: Record<string, Consequence> = {},
): LocalEvaluation {
  const outstanding = steps.filter((step) => !completed.includes(step.code));
  const first = outstanding[0] ?? null;
  if (!first) {
    return {
      correct: true,
      step: null,
      completedCodes: completed,
      nextStep: null,
      consequence: null,
      message: "Every step is done.",
      repeated: false,
    };
  }
  if (
    sequence === "free" &&
    steps.some((step) => completed.includes(step.code) && accepts(step, action))
  ) {
    return {
      correct: true,
      step: null,
      completedCodes: completed,
      nextStep: first,
      consequence: null,
      message: "You have already done that one.",
      repeated: true,
    };
  }
  const target =
    sequence === "free" ? (outstanding.find((step) => accepts(step, action)) ?? first) : first;
  if (accepts(target, action)) {
    const completedCodes = steps
      .filter((step) => completed.includes(step.code) || step.code === target.code)
      .map((step) => step.code);
    return {
      correct: true,
      step: target,
      completedCodes,
      nextStep: steps.find((step) => !completedCodes.includes(step.code)) ?? null,
      consequence: null,
      message: target.feedback_rules?.correct ?? target.feedback ?? "Step completed.",
      repeated: false,
    };
  }
  const consequence = target.mistakes?.[action] ?? globalMistakes[action] ?? null;
  return {
    correct: false,
    step: target,
    completedCodes: completed,
    nextStep: first,
    consequence,
    message:
      consequence?.message ??
      (target.safety_critical
        ? (target.feedback_rules?.safety ??
          "Safety sequence interrupted. Follow the current instruction before continuing.")
        : (target.feedback_rules?.incorrect ??
          "That is not the next step. Read the instruction and try again.")),
    repeated: false,
  };
}

export type ActionOption = { action_code: string; label: string };

/** The buttons that stand in for one step: its options when it is a decision, else itself. */
export function stepOptions(step: ProcedureStep): ActionOption[] {
  if (step.choices?.length) return step.choices;
  return [{ action_code: step.action_code, label: step.title }];
}

/**
 * Every action a learner could take, in an order that is stable for one attempt but gives away
 * nothing about the procedure. Used when prompts are hidden and for free-order procedures.
 */
export function allOptions(
  steps: ProcedureStep[],
  extra: ActionOption[] = [],
  seed: number | string = 0,
): ActionOption[] {
  const seen = new Map<string, ActionOption>();
  for (const option of [...steps.flatMap(stepOptions), ...extra]) {
    if (!seen.has(option.action_code)) seen.set(option.action_code, option);
  }
  const rank = (code: string) =>
    Array.from(`${seed}:${code}`).reduce(
      (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
      7,
    );
  return [...seen.values()].sort((left, right) => rank(left.action_code) - rank(right.action_code));
}

/** Action codes of finished steps: what the scene uses to show the state of the workshop. */
export function completedActionCodes(steps: ProcedureStep[], completed: string[]): Set<string> {
  return new Set(
    steps.filter((step) => completed.includes(step.code)).map((step) => step.action_code),
  );
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
