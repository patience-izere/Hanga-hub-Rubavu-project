import { useState } from "react";

import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { auditLabel } from "@/school/auditLabels";
import { useSchoolAudit } from "@/school/useSchoolAdmin";

function payloadSummary(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload).filter(([, value]) => value !== null && value !== "");
  if (entries.length === 0) return "";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
}

/**
 * The governance trail.
 *
 * Audit events are immutable and written by every membership, invitation, content and grading
 * mutation. This is read-only by design: there is no edit or delete path, in the API or here.
 */
export function SchoolAuditPage() {
  const [eventType, setEventType] = useState("");
  const audit = useSchoolAudit(eventType);

  return (
    <section className="dashboard audit-page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Governance</span>
          <h1>Audit log.</h1>
          <p>
            An immutable record of every membership, invitation, content and assessment change in
            your school. Entries cannot be edited or removed.
          </p>
        </div>
      </div>

      <QueryBoundary
        query={audit}
        loading="Loading the audit trail…"
        error="The audit trail could not be loaded."
      >
        {(data) => (
          <>
            <div className="audit-controls">
              <label>
                Event type
                <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
                  <option value="">All events</option>
                  {data.eventTypes.map((type) => (
                    <option key={type} value={type}>
                      {auditLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
              <span className="audit-count">{data.events.length} entries</span>
            </div>

            {data.events.length === 0 ? (
              <p className="field-note">
                {eventType
                  ? "No entries of that type yet."
                  : "Nothing has been recorded for this school yet."}
              </p>
            ) : (
              <ul className="audit-list">
                {data.events.map((event) => {
                  const summary = payloadSummary(event.payload);
                  return (
                    <li key={event.id}>
                      <div className="audit-main">
                        <strong>{auditLabel(event.eventType)}</strong>
                        <small>
                          {event.actorName}
                          {event.targetType ? ` · ${event.targetType} ${event.targetId}` : ""}
                        </small>
                        {summary ? <p className="audit-payload">{summary}</p> : null}
                      </div>
                      <time dateTime={event.occurredAt}>
                        {new Date(event.occurredAt).toLocaleString()}
                      </time>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
