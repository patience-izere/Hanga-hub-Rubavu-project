import { FormEvent, useState } from "react";

import { describeApiError } from "@/api/client";
import type { SchoolInvitation, SchoolMember } from "@/api/school";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import {
  useCreateSchoolInvitation,
  useRevokeSchoolInvitation,
  useSchoolInvitations,
  useSchoolOverview,
} from "@/school/useSchoolAdmin";

type InvitationState = "accepted" | "revoked" | "expired" | "pending";

function invitationState(invitation: SchoolInvitation): InvitationState {
  if (invitation.accepted_at) return "accepted";
  if (!invitation.is_active) return "revoked";
  if (new Date(invitation.expires_at) < new Date()) return "expired";
  return "pending";
}

const STATE_LABELS: Record<InvitationState, string> = {
  accepted: "Accepted",
  revoked: "Revoked",
  expired: "Expired",
  pending: "Pending",
};

export function SchoolInvitationsPage() {
  const invitations = useSchoolInvitations();
  const invite = useCreateSchoolInvitation();
  const revoke = useRevokeSchoolInvitation();
  const overview = useSchoolOverview();
  const schools = overview.data?.schools ?? [];
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SchoolMember["role"]>("learner");
  const [schoolId, setSchoolId] = useState<number | "">("");
  const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  // Administrators of more than one school (and platform administrators) must say which one.
  const needsSchool = schools.length > 1;

  function submit(event: FormEvent) {
    event.preventDefault();
    setCopied(false);
    invite.mutate(
      { email, role, schoolId: needsSchool && schoolId !== "" ? schoolId : undefined },
      { onSuccess: () => setEmail("") },
    );
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="dashboard school-admin-page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">School administration</span>
          <h1>Invitations.</h1>
          <p>
            Invitation links expire after seven days and can be used once. New people create their
            account when they accept; people who already use OPedu sign in and join this school.
          </p>
        </div>
      </div>

      <section className="admin-panel">
        <h2>Invite a person</h2>
        <form onSubmit={submit}>
          {needsSchool ? (
            <>
              <label htmlFor="invite-school">School</label>
              <select
                id="invite-school"
                required
                value={schoolId}
                onChange={(event) =>
                  setSchoolId(event.target.value ? Number(event.target.value) : "")
                }
              >
                <option value="">Choose a school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <label htmlFor="invite-email">Email</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="invite-role">Role</label>
          <select
            id="invite-role"
            value={role}
            onChange={(event) => setRole(event.target.value as SchoolMember["role"])}
          >
            <option value="learner">Learner</option>
            <option value="instructor">Instructor</option>
            <option value="content_author">Content author</option>
            <option value="admin">School administrator</option>
          </select>
          {invite.isError && (
            <p className="form-error" role="alert">
              {describeApiError(invite.error, "Invitation failed.")}
            </p>
          )}
          {invite.data && (
            <div className={invite.data.emailSent ? "form-success" : "form-error"} role="status">
              <p>
                {invite.data.emailSent
                  ? `Invitation emailed to ${invite.data.invitation.email}.`
                  : `The invitation was created, but the email to ${invite.data.invitation.email} could not be sent. Share this link with them yourself; it works once and expires in seven days.`}
              </p>
              <p className="invitation-link">
                <code>{invite.data.acceptUrl}</code>
                <button
                  type="button"
                  className="button-link"
                  onClick={() => void copyLink(invite.data.acceptUrl)}
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              </p>
            </div>
          )}
          <button className="button button-primary" disabled={invite.isPending}>
            {invite.isPending ? "Sending…" : "Send invitation"}
          </button>
        </form>
      </section>

      <h2 className="section-title">All invitations</h2>
      {revoke.isError ? (
        <p className="form-error" role="alert">
          {describeApiError(revoke.error, "The invitation could not be revoked.")}
        </p>
      ) : null}

      <QueryBoundary
        query={invitations}
        loading="Loading invitations…"
        error="Invitations could not be loaded."
        empty={{
          title: "No invitations yet",
          description: "Invite someone above to give them access to this school.",
        }}
      >
        {(items) => (
          <ul className="invitation-list">
            {items.map((item) => {
              const state = invitationState(item);
              return (
                <li key={item.id} className={`invitation-${state}`}>
                  <div>
                    <strong>{item.email}</strong>
                    <span>
                      {item.role.replaceAll("_", " ")}
                      {schools.length > 1 ? ` · ${item.school.name}` : ""}
                    </span>
                    <small>
                      {state === "accepted"
                        ? `Accepted ${new Date(item.accepted_at as string).toLocaleDateString()}`
                        : `Expires ${new Date(item.expires_at).toLocaleDateString()}`}
                    </small>
                  </div>
                  <div className="invitation-actions">
                    <span className={`status status-${state}`}>{STATE_LABELS[state]}</span>
                    {(state === "pending" || state === "expired") && confirmRevoke !== item.id ? (
                      <button className="button-link" onClick={() => setConfirmRevoke(item.id)}>
                        Revoke
                      </button>
                    ) : null}
                    {confirmRevoke === item.id ? (
                      <span className="inline-confirm-row" role="group" aria-label="Confirm revoke">
                        <span>The link will stop working.</span>
                        <button
                          className="button-link"
                          disabled={revoke.isPending}
                          onClick={() =>
                            revoke.mutate(item.id, { onSuccess: () => setConfirmRevoke(null) })
                          }
                        >
                          Revoke it
                        </button>
                        <button className="button-link" onClick={() => setConfirmRevoke(null)}>
                          Keep
                        </button>
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </QueryBoundary>
    </section>
  );
}
