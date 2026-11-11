import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { EditableDefinition } from "../../procedure/authoring";
import {
  FaultCasesEditor,
  KnowledgeCheckEditor,
  SceneEditor,
  StepChoicesEditor,
} from "./InteractionEditors";

function Harness({
  initial,
  children,
}: {
  initial: EditableDefinition;
  children: (
    definition: EditableDefinition,
    set: (next: EditableDefinition) => void,
  ) => React.ReactNode;
}) {
  const [definition, setDefinition] = useState(initial);
  return (
    <>
      {children(definition, setDefinition)}
      <pre data-testid="out">{JSON.stringify(definition)}</pre>
    </>
  );
}

const out = () => JSON.parse(screen.getByTestId("out").textContent ?? "{}") as EditableDefinition;

const base: EditableDefinition = {
  steps: [{ order: 1, code: "meter", title: "Set the meter", action_code: "set_dc" }],
};

describe("StepChoicesEditor", () => {
  it("turns a step into a decision and gives a wrong option a consequence", () => {
    render(
      <Harness initial={base}>
        {(definition, set) => (
          <StepChoicesEditor
            step={definition.steps[0]}
            index={0}
            suggestions={[]}
            onChange={(step) => set({ ...definition, steps: [step] })}
            onSetCorrect={(code) =>
              set({ ...definition, steps: [{ ...definition.steps[0], action_code: code }] })
            }
          />
        )}
      </Harness>,
    );
    fireEvent.click(screen.getByLabelText(/learner chooses between options/i));
    const step = out().steps[0];
    expect(step.choices).toEqual([
      { action_code: "set_dc", label: "Set the meter" },
      { action_code: "set_dc_other", label: "" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /add a message for each wrong option/i }));
    fireEvent.change(screen.getByLabelText("What happens"), { target: { value: "blown_fuse" } });
    expect(out().steps[0].mistakes).toEqual({
      set_dc_other: { effect: "blown_fuse", message: "" },
    });
  });
});

describe("FaultCasesEditor", () => {
  it("adds a case that changes a step's reading and accepted range", () => {
    render(
      <Harness initial={base}>
        {(definition, set) => <FaultCasesEditor definition={definition} onChange={set} />}
      </Harness>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add fault case" }));
    fireEvent.change(screen.getByLabelText(/change another step/i), { target: { value: "meter" } });
    fireEvent.change(screen.getByLabelText("Reading shown"), { target: { value: "12.1" } });
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "V" } });
    fireEvent.change(screen.getByLabelText("Accept readings from"), { target: { value: "11.9" } });
    fireEvent.change(screen.getByLabelText("to"), { target: { value: "12.3" } });
    const variant = (
      out().variants as Array<{ code: string; steps: Record<string, Record<string, unknown>> }>
    )[0];
    expect(variant.code).toBe("case-1");
    const override = variant.steps.meter;
    expect(override.metadata).toEqual({ reading: 12.1, unit: "V" });
    expect(override.tolerances).toEqual([
      expect.objectContaining({ minimum_value: "11.9", maximum_value: "12.3", unit: "V" }),
    ]);
  });
});

describe("KnowledgeCheckEditor", () => {
  it("writes questions with an answer among their options", () => {
    render(
      <Harness initial={base}>
        {(definition, set) => <KnowledgeCheckEditor definition={definition} onChange={set} />}
      </Harness>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Why?" } });
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1]);
    const question = (
      out().knowledge_check as { questions: Array<{ prompt: string; answer: string }> }
    ).questions[0];
    expect(question.prompt).toBe("Why?");
    expect(question.answer).toBe("b");
  });
});

describe("SceneEditor", () => {
  it("adds equipment with its tools ready and binds a part to an action", () => {
    render(
      <Harness initial={base}>
        {(definition, set) => (
          <SceneEditor definition={definition} suggestions={["set_dc"]} onChange={set} />
        )}
      </Harness>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start a scene" }));
    fireEvent.change(screen.getByLabelText("Add equipment"), { target: { value: "multimeter" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const part = screen.getByLabelText("Dial: DC volts");
    fireEvent.change(part, { target: { value: "action" } });
    const row = part.closest(".studio-row") as HTMLElement;
    fireEvent.change(within(row).getByLabelText(/action code/i), { target: { value: "set_dc" } });
    const scene = out().scene as {
      props: Array<{ id: string; kind: string }>;
      bindings: Record<string, unknown>;
    };
    expect(scene.props).toEqual([
      expect.objectContaining({ id: "multimeter", kind: "multimeter" }),
    ]);
    expect(scene.bindings["multimeter.mode_dcv"]).toEqual({ action: "set_dc" });
    expect(scene.bindings["multimeter.probe_red"]).toEqual({
      tool: "probe_red",
      label: "Red probe",
    });
  });
});
