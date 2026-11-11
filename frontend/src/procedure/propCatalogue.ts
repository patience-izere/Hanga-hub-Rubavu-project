/**
 * What the Studio offers an author for each prop in the shared library.
 *
 * Kept in step with `components/simulation/sceneProps.tsx`: each part named here is a `<Part>`
 * in that prop, and each state is one the prop draws. `role` is only the suggested use; the
 * author decides what a part does in their lesson.
 */

export type PartRole = "action" | "tool" | "target";

export type StateSpec =
  | { key: string; label: string; type: "boolean" }
  | { key: string; label: string; type: "number" }
  | { key: string; label: string; type: "choice"; values: string[] }
  /** Another prop's part, e.g. where a probe or a clamp is attached. */
  | { key: string; label: string; type: "anchor" };

export type PropSpec = {
  label: string;
  group: "Electrical" | "Automotive" | "Workshop" | "General";
  parts: Array<{ name: string; label: string; role: PartRole; tool?: string }>;
  states: StateSpec[];
  /** The prop can show a reading taken from a step's metadata. */
  showsReading?: boolean;
};

const FOUND: StateSpec = { key: "found", label: "Marked as found", type: "boolean" };

export const PROP_CATALOGUE: Record<string, PropSpec> = {
  battery: {
    label: "12 V battery",
    group: "Automotive",
    parts: [
      { name: "terminal_neg", label: "Negative (−) terminal", role: "target" },
      { name: "terminal_pos", label: "Positive (+) terminal", role: "target" },
    ],
    states: [],
  },
  multimeter: {
    label: "Multimeter",
    group: "Electrical",
    parts: [
      { name: "mode_dcv", label: "Dial: DC volts", role: "action" },
      { name: "mode_acv", label: "Dial: AC volts", role: "action" },
      { name: "mode_ohm", label: "Dial: resistance", role: "action" },
      { name: "mode_amp", label: "Dial: current", role: "action" },
      { name: "probe_black", label: "Black probe", role: "tool", tool: "probe_black" },
      { name: "probe_red", label: "Red probe", role: "tool", tool: "probe_red" },
      { name: "display", label: "Display", role: "action" },
    ],
    states: [
      { key: "mode", label: "Dial setting", type: "choice", values: ["dcv", "acv", "ohm", "amp"] },
      { key: "black", label: "Black probe is on", type: "anchor" },
      { key: "red", label: "Red probe is on", type: "anchor" },
      { key: "live", label: "Shows the step's reading", type: "boolean" },
      { key: "resting", label: "Resting voltage shown before then", type: "number" },
    ],
    showsReading: true,
  },
  glasses: {
    label: "Safety glasses",
    group: "Workshop",
    parts: [{ name: "body", label: "Glasses", role: "action" }],
    states: [{ key: "worn", label: "Worn", type: "boolean" }],
  },
  key: {
    label: "Ignition key",
    group: "Automotive",
    parts: [{ name: "body", label: "Key", role: "action" }],
    states: [{ key: "position", label: "Position", type: "choice", values: ["on", "off", "run"] }],
  },
  jump_leads: {
    label: "Jump leads",
    group: "Automotive",
    parts: [
      { name: "clamp_red", label: "Red clamp", role: "tool", tool: "red_clamp" },
      { name: "clamp_black", label: "Black clamp", role: "tool", tool: "black_clamp" },
    ],
    states: [
      { key: "red_a", label: "First red clamp is on", type: "anchor" },
      { key: "red_b", label: "Second red clamp is on", type: "anchor" },
      { key: "black_a", label: "First black clamp is on", type: "anchor" },
      { key: "black_b", label: "Second black clamp is on", type: "anchor" },
    ],
  },
  earth_point: {
    label: "Engine block (earth point)",
    group: "Automotive",
    parts: [{ name: "body", label: "Bare metal", role: "target" }],
    states: [],
  },
  engine: {
    label: "Engine with drive belt",
    group: "Automotive",
    parts: [{ name: "belt", label: "Belt and pulleys", role: "action" }],
    states: [
      { key: "running", label: "Running", type: "boolean" },
      { key: "checked", label: "Checked clear", type: "boolean" },
    ],
  },
  fusebox: {
    label: "Fuse box",
    group: "Automotive",
    parts: [
      { name: "body", label: "Box", role: "target" },
      { name: "fuse_f1", label: "Fuse F1", role: "action" },
      { name: "fuse_f2", label: "Fuse F2", role: "action" },
      { name: "fuse_f3", label: "Fuse F3", role: "action" },
      { name: "fuse_f4", label: "Fuse F4", role: "action" },
    ],
    states: [
      { key: "selected", label: "Selected fuse", type: "choice", values: ["f1", "f2", "f3", "f4"] },
      { key: "pulled", label: "Fuse pulled out", type: "boolean" },
      { key: "inspected", label: "Inspected", type: "boolean" },
      { key: "fitted", label: "New fuse fitted", type: "boolean" },
      { key: "working", label: "Circuit working", type: "boolean" },
    ],
  },
  fuse_tools: {
    label: "Fuse puller and screwdriver",
    group: "Automotive",
    parts: [
      { name: "puller", label: "Fuse puller", role: "tool", tool: "puller" },
      { name: "screwdriver", label: "Screwdriver", role: "tool", tool: "screwdriver" },
    ],
    states: [],
  },
  spare_fuses: {
    label: "Spare fuses",
    group: "Automotive",
    parts: [
      { name: "fuse_10", label: "10 A fuse", role: "action" },
      { name: "fuse_15", label: "15 A fuse", role: "action" },
      { name: "fuse_20", label: "20 A fuse", role: "action" },
      { name: "wire", label: "Piece of wire", role: "action" },
    ],
    states: [],
  },
  consumer_unit: {
    label: "Distribution board",
    group: "Electrical",
    parts: [
      { name: "body", label: "Board", role: "target" },
      ...["b1", "b2", "b3", "b4", "b5", "b6"].map((code) => ({
        name: `breaker_${code}`,
        label: `Breaker ${code.toUpperCase()}`,
        role: "action" as const,
      })),
    ],
    states: [
      {
        key: "selected",
        label: "Selected breaker",
        type: "choice",
        values: ["b1", "b2", "b3", "b4", "b5", "b6"],
      },
      { key: "off", label: "Selected breaker off", type: "boolean" },
      { key: "locked", label: "Locked off and tagged", type: "boolean" },
      { key: "checked", label: "Shown as proved dead", type: "boolean" },
    ],
  },
  lock_kit: {
    label: "Lock-off kit",
    group: "Electrical",
    parts: [{ name: "body", label: "Lock and tag", role: "tool", tool: "lock" }],
    states: [],
  },
  voltage_tester: {
    label: "Voltage tester",
    group: "Electrical",
    parts: [{ name: "body", label: "Tester", role: "tool", tool: "tester" }],
    states: [],
  },
  proving_unit: {
    label: "Proving unit",
    group: "Electrical",
    parts: [{ name: "body", label: "Proving unit", role: "target" }],
    states: [{ key: "proved", label: "Times the tester was proved", type: "number" }],
  },
  socket: {
    label: "Wall socket",
    group: "Electrical",
    parts: [{ name: "body", label: "Socket", role: "target" }],
    states: [{ key: "tested", label: "Shows the tester reading", type: "boolean" }],
    showsReading: true,
  },
  cable_run: {
    label: "Cable run",
    group: "Electrical",
    parts: [
      { name: "end_a", label: "End A", role: "target" },
      { name: "end_b", label: "End B", role: "target" },
    ],
    states: [],
  },
  spill: {
    label: "Oil spill",
    group: "Workshop",
    parts: [{ name: "body", label: "Spill", role: "action" }],
    states: [FOUND],
  },
  cable: {
    label: "Extension cable",
    group: "Workshop",
    parts: [{ name: "body", label: "Cable", role: "action" }],
    states: [{ key: "frayed", label: "Damaged", type: "boolean" }, FOUND],
  },
  extinguisher: {
    label: "Fire extinguisher",
    group: "Workshop",
    parts: [{ name: "body", label: "Extinguisher", role: "action" }],
    states: [{ key: "blocked", label: "Blocked by boxes", type: "boolean" }, FOUND],
  },
  fuel_can: {
    label: "Fuel can",
    group: "Workshop",
    parts: [{ name: "body", label: "Can", role: "action" }],
    states: [{ key: "open", label: "Cap off", type: "boolean" }, FOUND],
  },
  loose_tools: {
    label: "Tools on the floor",
    group: "Workshop",
    parts: [{ name: "body", label: "Tools", role: "action" }],
    states: [FOUND],
  },
  workbench: {
    label: "Workbench",
    group: "Workshop",
    parts: [{ name: "body", label: "Bench", role: "action" }],
    states: [FOUND],
  },
  first_aid: {
    label: "First-aid box",
    group: "Workshop",
    parts: [{ name: "body", label: "First-aid box", role: "action" }],
    states: [FOUND],
  },
  block: {
    label: "Labelled block",
    group: "General",
    parts: [{ name: "body", label: "Block", role: "action" }],
    states: [{ key: "done", label: "Done", type: "boolean" }],
  },
};

export const PROP_GROUPS = ["Electrical", "Automotive", "Workshop", "General"] as const;

/** A short id for a new prop, unique in the scene: `meter`, `meter_2`, … */
export function newPropId(kind: string, taken: string[]): string {
  const base = kind.split("_")[0];
  let candidate = base;
  let suffix = 2;
  while (taken.includes(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}
