/**
 * Reading a lesson's scene description.
 *
 * A scene is data: which props stand where, what clicking each part does, and how finished
 * actions change what the learner sees. The renderer and the tests share these helpers, so the
 * rules about tools, targets and highlights are checked without drawing anything.
 */

import type { ProcedureStep, SceneBinding, SceneDefinition } from "../api/learning";

export type PropState = Record<string, unknown>;

/** Each prop's state after the effects of every finished action have been applied in order. */
export function sceneState(
  scene: SceneDefinition,
  completedActions: Set<string>,
): Record<string, PropState> {
  const state: Record<string, PropState> = {};
  for (const prop of scene.props) state[prop.id] = { ...(prop.state ?? {}) };
  for (const effect of scene.effects ?? []) {
    if (!completedActions.has(effect.when)) continue;
    for (const [propId, changes] of Object.entries(effect.set)) {
      state[propId] = { ...(state[propId] ?? {}), ...changes };
    }
  }
  return state;
}

function isTool(binding: SceneBinding): binding is { tool: string; label?: string } {
  return "tool" in binding;
}

function isTarget(
  binding: SceneBinding,
): binding is { accepts: Record<string, string | string[]> } {
  return "accepts" in binding;
}

function asList(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/** The first action in a list that has not been done yet, or the last one when all have. */
function nextOf(value: string | string[], completedActions: Set<string>): string | undefined {
  const actions = asList(value);
  return actions.find((action) => !completedActions.has(action)) ?? actions.at(-1);
}

export type PartClick =
  | { kind: "action"; action: string }
  | { kind: "pick"; tool: string; label: string }
  | { kind: "drop" }
  | { kind: "needs-tool" }
  | { kind: "wrong-place" }
  | { kind: "none" };

/**
 * What clicking a part means right now.
 *
 * A part bound to several actions fires the first one not yet done, so one ignition key can be
 * "switch off" early in a procedure and "start the engine" later.
 */
export function resolveClick(
  scene: SceneDefinition,
  partKey: string,
  heldTool: string | null,
  completedActions: Set<string>,
): PartClick {
  const binding = scene.bindings[partKey];
  if (!binding) return { kind: "none" };
  if (isTool(binding)) {
    if (heldTool === binding.tool) return { kind: "drop" };
    return { kind: "pick", tool: binding.tool, label: binding.label ?? binding.tool };
  }
  if (isTarget(binding)) {
    if (!heldTool) return { kind: "needs-tool" };
    const accepted = binding.accepts[heldTool];
    const action = accepted ? nextOf(accepted, completedActions) : undefined;
    return action ? { kind: "action", action } : { kind: "wrong-place" };
  }
  const next = nextOf(binding.action, completedActions);
  return next ? { kind: "action", action: next } : { kind: "none" };
}

export type Highlight = { parts: Set<string>; tool: string | null };

/**
 * Which parts to light up for the action a guided learner should take next: the object itself,
 * or the tool to pick up and then the place it goes.
 */
export function highlightFor(
  scene: SceneDefinition,
  action: string | null,
  heldTool: string | null,
  completedActions: Set<string>,
): Highlight {
  const parts = new Set<string>();
  if (!action) return { parts, tool: null };
  let neededTool: string | null = null;
  for (const [partKey, binding] of Object.entries(scene.bindings)) {
    if (isTarget(binding)) {
      const tool = Object.entries(binding.accepts).find(
        ([, value]) => nextOf(value, completedActions) === action,
      )?.[0];
      if (!tool) continue;
      neededTool = tool;
      if (heldTool === tool) parts.add(partKey);
    } else if (!isTool(binding)) {
      const actions = Array.isArray(binding.action) ? binding.action : [binding.action];
      const next = actions.find((item) => !completedActions.has(item));
      if (next === action) parts.add(partKey);
    }
  }
  if (neededTool && heldTool !== neededTool) {
    for (const [partKey, binding] of Object.entries(scene.bindings)) {
      if (isTool(binding) && binding.tool === neededTool) parts.add(partKey);
    }
  }
  return { parts, tool: neededTool };
}

/** Whether an action can be performed by touching something in the scene. */
export function sceneOffers(scene: SceneDefinition | null | undefined, action: string): boolean {
  if (!scene) return false;
  return Object.values(scene.bindings).some((binding) => {
    if (isTarget(binding))
      return Object.values(binding.accepts).some((value) => asList(value).includes(action));
    if (isTool(binding)) return false;
    return Array.isArray(binding.action)
      ? binding.action.includes(action)
      : binding.action === action;
  });
}

export function toolLabel(scene: SceneDefinition, tool: string): string {
  const binding = Object.values(scene.bindings).find(
    (item) => isTool(item) && item.tool === tool,
  ) as { tool: string; label?: string } | undefined;
  return binding?.label ?? tool;
}

export type Reading = { value: number | null; unit: string; text: string };

/**
 * The reading an instrument in the scene should show, taken from the step that measures it.
 * `metadata.display` wins when the author set one, so a meter can show "OL" for no path.
 */
export function readingFor(steps: ProcedureStep[], stepCode: string | undefined): Reading | null {
  const step = steps.find((item) => item.code === stepCode);
  if (!step) return null;
  const raw = step.metadata?.reading;
  const value = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  const unit = String(step.metadata?.unit ?? "");
  const display = step.metadata?.display;
  if (typeof display === "string" && display) return { value, unit, text: display };
  if (value === null || !Number.isFinite(value)) return null;
  const text = Number.isInteger(value) ? `${value} ${unit}` : `${value.toFixed(2)} ${unit}`;
  return { value, unit, text: text.trim() };
}

/**
 * A scene for a lesson that was authored without one: a labelled block for every action, so any
 * procedure can be practised in 3D before custom props exist for it.
 */
export function fallbackScene(steps: ProcedureStep[]): SceneDefinition {
  const options = new Map<string, string>();
  for (const step of steps) {
    for (const option of step.choices?.length
      ? step.choices
      : [{ action_code: step.action_code, label: step.title }]) {
      if (!options.has(option.action_code)) options.set(option.action_code, option.label);
    }
  }
  const entries = [...options.entries()];
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(entries.length))));
  const rows = Math.ceil(entries.length / columns);
  const scene: SceneDefinition = { version: 1, props: [], bindings: {}, effects: [] };
  entries.forEach(([action, label], index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const id = `block_${index + 1}`;
    scene.props.push({
      id,
      kind: "block",
      label,
      position: [(column - (columns - 1) / 2) * 1.7, (row - (rows - 1) / 2) * 1.3],
    });
    scene.bindings[`${id}.body`] = { action };
    scene.effects?.push({ when: action, set: { [id]: { done: true } } });
  });
  return scene;
}
