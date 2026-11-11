import { useMemo, useRef, useState, type ReactNode } from "react";

import type { ProcedureStep, RendererMode, SceneDefinition } from "../../api/learning";
import {
  evaluateAction,
  formatDuration,
  type ActionOption,
  type Sequence,
} from "../../procedure/engine";
import { ProcedureWorkspace, type WorkspaceFeedback } from "./ProcedureWorkspace";

export type LocalPracticeProps = {
  title: string;
  kicker: string;
  back?: { to: string; label: string };
  steps: ProcedureStep[];
  sequence: Sequence;
  scene?: SceneDefinition | null;
  distractors?: ActionOption[];
  /** Shown once every step is done, below the time and mistake count. */
  finish?: ReactNode;
  /** Extra controls under the instruction card while practising, e.g. a fault-case picker. */
  extra?: ReactNode;
};

function canDraw3d() {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * A procedure run entirely on the device, with nothing sent to the server: the visitor demo and
 * the Studio's "try it" preview. The rules are the ones offline practice uses.
 */
export function LocalPractice({
  title,
  kicker,
  back,
  steps,
  sequence,
  scene,
  distractors,
  finish,
  extra,
}: LocalPracticeProps) {
  const [completed, setCompleted] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState<WorkspaceFeedback | null>(null);
  const [mode, setMode] = useState<RendererMode>("desktop_3d");
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const counter = useRef(0);
  const webgl = useMemo(canDraw3d, []);
  const activeMode = webgl ? mode : "accessible_2d";

  function act(action: string) {
    const outcome = evaluateAction(steps, completed, action, sequence);
    counter.current += 1;
    if (!outcome.correct) setMistakes((value) => value + 1);
    if (outcome.correct && !outcome.repeated) {
      setCompleted(outcome.completedCodes);
      if (outcome.nextStep === null) setFinishedAt(Date.now());
    }
    setFeedback({
      id: counter.current,
      correct: outcome.correct,
      message: outcome.message,
      consequence: outcome.consequence,
      action,
    });
  }

  function restart() {
    setCompleted([]);
    setMistakes(0);
    setFeedback(null);
    setFinishedAt(null);
    setStartedAt(new Date().toISOString());
  }

  const done = steps.length > 0 && completed.length === steps.length;
  const seconds = finishedAt ? (finishedAt - new Date(startedAt).getTime()) / 1000 : 0;

  return (
    <ProcedureWorkspace
      title={title}
      kicker={kicker}
      back={back}
      steps={steps}
      completedCodes={completed}
      sequence={sequence}
      scene={scene}
      distractors={distractors}
      independent={false}
      mode={activeMode}
      modes={[
        { mode: "desktop_3d", available: webgl, recommended: webgl },
        { mode: "accessible_2d", available: true, recommended: !webgl },
      ]}
      onModeChange={setMode}
      busy={false}
      feedback={feedback}
      onAction={act}
      seed="local"
      startedAt={done ? null : startedAt}
      hint={extra}
      footer={
        done ? (
          <div className="demo-finish">
            <strong>
              Done in {formatDuration(seconds)} with {mistakes}{" "}
              {mistakes === 1 ? "mistake" : "mistakes"}.
            </strong>
            {finish}
            <button className="button-link" type="button" onClick={restart}>
              Try again
            </button>
          </div>
        ) : (
          <small>
            Mistakes so far: {mistakes}.{" "}
            <button className="button-link" type="button" onClick={restart}>
              Start over
            </button>
          </small>
        )
      }
    />
  );
}
