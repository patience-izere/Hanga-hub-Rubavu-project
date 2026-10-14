import { useState } from "react";

import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { auditLabel } from "@/school/auditLabels";
import { useSchoolAudit } from "@/school/useSchoolAdmin";

function payloadSummary(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload).filter(([, value]) => value !== null && value !== "");
  if (entries.length === 0) return "";
  return entries
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`,
    )
    .join(" · ");
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
        {(data) => {
          const events = data.pages.flatMap((page) => page.events);
          const eventTypes = data.pages[0]?.eventTypes ?? [];
          return (
            <>
              <div className="audit-controls">
                <label>
                  Event type
                  <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
                    <option value="">All events</option>
                    {eventTypes.map((type) => (
                      <option key={type} value={type}>
                        {auditLabel(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="audit-count">
                  {events.length} {events.length === 1 ? "entry" : "entries"}
                  {audit.hasNextPage ? " shown" : ""}
                </span>
              </div>

              {events.length === 0 ? (
                <p className="field-note">
                  {eventType
                    ? "No entries of that type yet."
                    : "Nothing has been recorded for this school yet."}
                </p>
              ) : (
                <ul className="audit-list">
                  {events.map((event) => {
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
              {audit.hasNextPage ? (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={audit.isFetchingNextPage}
                  onClick={() => void audit.fetchNextPage()}
                >
                  {audit.isFetchingNextPage ? "Loading…" : "Show older entries"}
                </button>
              ) : null}
            </>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
