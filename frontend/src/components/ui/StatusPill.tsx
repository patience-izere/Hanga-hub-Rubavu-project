import { assignmentStatusLabel } from "../../learning/labels";

type StatusPillProps = {
  /** Attempt status, or `undefined` when the learner has not started an attempt. */
  status: string | undefined;
};

export function StatusPill({ status }: StatusPillProps) {
  return (
    <span className={`status status-${status || "new"}`}>{assignmentStatusLabel(status)}</span>
  );
}
