/** Helpers shared by the Studio's scenario editors. */

type Json = Record<string, unknown>;
export type EditableDefinition = Json & { steps: Json[] };
export type Choice = { action_code: string; label: string };
export type Mistake = { effect: string; message: string };

/** Action codes are lower-case letters, digits and underscores. */
export function actionCode(value: string): string {
  return value.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
}

export function asChoices(value: unknown): Choice[] {
  return Array.isArray(value) ? (value as Choice[]) : [];
}

export function asMistakes(value: unknown): Record<string, Mistake> {
  return value && typeof value === "object" ? (value as Record<string, Mistake>) : {};
}

/** Every action code mentioned anywhere in the definition, for suggestions. */
export function allActionCodes(definition: EditableDefinition): string[] {
  const codes = new Set<string>();
  for (const step of definition.steps) {
    if (step.action_code) codes.add(String(step.action_code));
    for (const choice of asChoices(step.choices)) codes.add(choice.action_code);
    for (const code of Object.keys(asMistakes(step.mistakes))) codes.add(code);
  }
  for (const item of asChoices(definition.distractors)) codes.add(item.action_code);
  return [...codes].filter(Boolean).sort();
}
