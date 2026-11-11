import { describe, expect, it } from "vitest";

import type { ProcedureStep, SceneDefinition } from "../api/learning";
import { practiceStreak } from "../learning/progress";
import { allOptions, evaluateAction, stepOptions } from "./engine";
import { fallbackScene, highlightFor, resolveClick, sceneState } from "./scene";

function step(code: string, action: string, extra: Partial<ProcedureStep> = {}): ProcedureStep {
  return {
    id: 0,
    order: 1,
    code,
    title: code,
    instruction: `Do ${code}`,
    action_code: action,
    feedback: `${code} done`,
    safety_critical: false,
    points: 10,
    metadata: {},
    acceptable_actions: [{ action_code: action, label: code, is_primary: true, tolerance: null }],
    hints: [],
    tolerances: [],
    tools: [],
    hazards: [],
    feedback_rules: { correct: `${code} done` },
    competency_codes: [],
    ...extra,
  };
}

const steps = [
  step("ppe", "confirm_ppe", {
    safety_critical: true,
    mistakes: { connect_red: { effect: "hazard", message: "Glasses first." } },
  }),
  step("meter", "set_dc", {
    choices: [
      { action_code: "set_dc", label: "DC volts" },
      { action_code: "set_amps", label: "Amps" },
    ],
    mistakes: { set_amps: { effect: "blown_fuse", message: "Fuse blown." } },
  }),
  step("connect", "connect_red"),
];

describe("evaluateAction", () => {
  it("returns the authored consequence for a dangerous action", () => {
    const outcome = evaluateAction(steps, [], "connect_red");
    expect(outcome.correct).toBe(false);
    expect(outcome.consequence?.effect).toBe("hazard");
    expect(outcome.message).toBe("Glasses first.");
    expect(outcome.completedCodes).toEqual([]);
  });

  it("moves to the next step in order", () => {
    const first = evaluateAction(steps, [], "confirm_ppe");
    expect(first.correct).toBe(true);
    expect(first.nextStep?.code).toBe("meter");
    const wrong = evaluateAction(steps, first.completedCodes, "set_amps");
    expect(wrong.consequence?.effect).toBe("blown_fuse");
  });

  it("accepts any outstanding step in a free-order procedure and ignores repeats", () => {
    const found = evaluateAction(steps, [], "connect_red", "free");
    expect(found.correct).toBe(true);
    expect(found.completedCodes).toEqual(["connect"]);
    const again = evaluateAction(steps, found.completedCodes, "connect_red", "free");
    expect(again.repeated).toBe(true);
    expect(again.completedCodes).toEqual(["connect"]);
  });

  it("uses global mistakes for distractors that belong to no step", () => {
    const outcome = evaluateAction(steps, [], "spot_first_aid", "free", {
      spot_first_aid: { effect: "none", message: "That one is fine." },
    });
    expect(outcome.correct).toBe(false);
    expect(outcome.message).toBe("That one is fine.");
  });
});

describe("options", () => {
  it("offers a decision step's choices", () => {
    expect(stepOptions(steps[1]).map((option) => option.label)).toEqual(["DC volts", "Amps"]);
  });

  it("lists every action once in an order that does not give the procedure away", () => {
    const options = allOptions(steps, [{ action_code: "spot_x", label: "X" }], 7);
    expect(new Set(options.map((option) => option.action_code)).size).toBe(options.length);
    expect(options).toHaveLength(5);
    expect(allOptions(steps, [], 7)).toEqual(allOptions(steps, [], 7));
  });
});

const scene: SceneDefinition = {
  props: [
    { id: "key", kind: "key", position: [0, 0] },
    { id: "meter", kind: "multimeter", position: [1, 0] },
    { id: "battery", kind: "battery", position: [2, 0] },
  ],
  bindings: {
    "key.body": { action: ["turn_off", "start"] },
    "meter.probe_red": { tool: "probe_red", label: "Red probe" },
    "battery.terminal_pos": { accepts: { probe_red: "connect_red" } },
  },
  effects: [{ when: "turn_off", set: { key: { position: "off" } } }],
};

describe("scene", () => {
  it("applies the effects of finished actions", () => {
    expect(sceneState(scene, new Set(["turn_off"])).key).toEqual({ position: "off" });
    expect(sceneState(scene, new Set()).key).toEqual({});
  });

  it("fires the first unfinished action of a multi-purpose part", () => {
    expect(resolveClick(scene, "key.body", null, new Set())).toEqual({
      kind: "action",
      action: "turn_off",
    });
    expect(resolveClick(scene, "key.body", null, new Set(["turn_off"]))).toEqual({
      kind: "action",
      action: "start",
    });
  });

  it("needs a tool picked up before a target does anything", () => {
    expect(resolveClick(scene, "battery.terminal_pos", null, new Set()).kind).toBe("needs-tool");
    expect(resolveClick(scene, "meter.probe_red", null, new Set()).kind).toBe("pick");
    expect(resolveClick(scene, "battery.terminal_pos", "probe_red", new Set())).toEqual({
      kind: "action",
      action: "connect_red",
    });
  });

  it("highlights the tool first, then where it goes", () => {
    expect([...highlightFor(scene, "connect_red", null, new Set()).parts]).toEqual([
      "meter.probe_red",
    ]);
    expect([...highlightFor(scene, "connect_red", "probe_red", new Set()).parts]).toEqual([
      "battery.terminal_pos",
    ]);
  });

  it("builds a usable scene for a lesson authored without one", () => {
    const built = fallbackScene(steps);
    expect(built.props).toHaveLength(4);
    expect(Object.values(built.bindings)).toContainEqual({ action: "set_amps" });
  });
});

describe("practiceStreak", () => {
  const now = new Date(2026, 10, 10, 9);
  it("counts consecutive days ending today or yesterday", () => {
    const days = [10, 9, 8, 6].map((day) => new Date(2026, 10, day, 15).toISOString());
    expect(practiceStreak(days, now)).toBe(3);
    expect(practiceStreak(days.slice(1), now)).toBe(2);
    expect(practiceStreak([new Date(2026, 10, 7).toISOString()], now)).toBe(0);
  });
});
