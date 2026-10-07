import { Link } from "react-router-dom";

import { MetricGrid, MetricTile } from "@/components/ui/MetricTile";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { useSchoolOverview } from "@/school/useSchoolAdmin";
import { auditLabel } from "@/school/auditLabels";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrators",
  instructor: "Instructors",
  content_author: "Content authors",
  learner: "Learners",
};

const ROLE_ORDER = ["learner", "instructor", "content_author", "admin"];

/**
 * The administrator's landing page.
 *
 * Administrators previously landed on the instructor dashboard, which answers a teaching
 * question rather than a governance one.
 */
export function SchoolOverviewPage() {
  const overview = useSchoolOverview();

  return (
    <section className="dashboard school-overview">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">School administration</span>
          <h1>Your school at a glance.</h1>
          <p>People, pending access, cohorts, and the governance trail.</p>
        </div>
      </div>

      <QueryBoundary
        query={overview}
        loading="Loading school summary…"
        error="The school summary could not be loaded."
      >
        {(data) => (
          <>
            <MetricGrid>
              {ROLE_ORDER.filter((role) => data.membersByRole[role]).map((role) => (
                <MetricTile
                  key={role}
                  label={ROLE_LABELS[role] ?? role}
                  value={data.membersByRole[role]}
                />
              ))}
              <MetricTile
                label="Pending invitations"
                value={data.pendingInvitations}
                detail={data.expiredInvitations ? `${data.expiredInvitations} expired` : undefined}
              />
              <MetricTile
                label="Suspended members"
                value={data.suspendedMembers}
                alert={data.suspendedMembers > 0}
              />
            </MetricGrid>

            <div className="admin-quick-links">
              <Link className="button button-secondary" to="/school/people">
                Manage people
              </Link>
              <Link className="button button-secondary" to="/school/invitations">
                Review invitations
              </Link>
              <Link className="button button-secondary" to="/school/audit">
                Open the audit log
              </Link>
            </div>

            <h2 className="section-title">Cohorts</h2>
            {data.cohorts.length === 0 ? (
              <p className="field-note">
                No active cohorts. Cohorts are created in Django admin and let instructors assign a
                lesson to a whole class at once.
              </p>
            ) : (
              <ul className="cohort-list">
                {data.cohorts.map((cohort) => (
                  <li key={cohort.id}>
                    <div>
                      <strong>{cohort.name}</strong>
                      <small>
                        {cohort.code} · {cohort.school}
                      </small>
                    </div>
                    <span>{cohort.learnerCount} active learner(s)</span>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="section-title">Recent activity</h2>
            {data.recentAudit.length === 0 ? (
              <p className="field-note">Nothing has been recorded for this school yet.</p>
            ) : (
              <>
                <ul className="audit-list compact">
                  {data.recentAudit.map((event) => (
                    <li key={event.id}>
                      <div>
                        <strong>{auditLabel(event.eventType)}</strong>
                        <small>{event.actorName}</small>
                      </div>
                      <time dateTime={event.occurredAt}>
                        {new Date(event.occurredAt).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ul>
                <Link className="table-link" to="/school/audit">
                  See the full audit log
                </Link>
              </>
            )}
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
