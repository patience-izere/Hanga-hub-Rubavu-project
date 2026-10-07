/**
 * Plain-language names for audit event types.
 *
 * The stored `event_type` is a stable machine identifier and must not change; this is only the
 * presentation of it. Unknown types are humanised rather than hidden, so a newly audited action
 * still reads sensibly before anyone updates this map.
 */
const AUDIT_LABELS: Record<string, string> = {
  "account.password_changed": "Password changed",
  "membership.invitation_created": "Invitation sent",
  "membership.invitation_revoked": "Invitation revoked",
  "membership.invitation_accepted": "Invitation accepted",
  "membership.activation_changed": "Membership activation changed",
  "content.lesson_submit": "Lesson submitted for review",
  "content.lesson_approve": "Lesson approved",
  "content.lesson_publish": "Lesson published",
  "content.lesson_return_to_draft": "Lesson returned for revision",
  "content.lesson_retire": "Lesson retired",
  "content.scenario_created": "Scenario created",
  "content.scenario_published": "Scenario published",
  "assessment.feedback_published": "Feedback published to learner",
  "assessment.feedback_saved": "Feedback saved as draft",
  "assignment.created": "Assignment created",
};

export function auditLabel(eventType: string): string {
  if (AUDIT_LABELS[eventType]) return AUDIT_LABELS[eventType];
  const withoutNamespace = eventType.includes(".")
    ? eventType.slice(eventType.indexOf(".") + 1)
    : eventType;
  const spaced = withoutNamespace.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
