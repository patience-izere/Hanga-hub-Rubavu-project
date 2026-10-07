import { FormEvent, useState } from "react";

import { ApiError } from "@/api/client";
import type { SchoolInvitation, SchoolMember } from "@/api/school";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import {
  useCreateSchoolInvitation,
  useRevokeSchoolInvitation,
  useSchoolInvitations,
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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SchoolMember["role"]>("learner");

  function submit(event: FormEvent) {
    event.preventDefault();
    invite.mutate({ email, role }, { onSuccess: () => setEmail("") });
  }

  return (
    <section className="dashboard school-admin-page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">School administration</span>
          <h1>Invitations.</h1>
          <p>
            Invitation links expire after seven days and can be used once. Accepting creates the
            account and the school membership together.
          </p>
        </div>
      </div>

      <section className="admin-panel">
        <h2>Invite a person</h2>
        <form onSubmit={submit}>
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
              {invite.error instanceof ApiError ? invite.error.message : "Invitation failed."}
            </p>
          )}
          {invite.data && (
            <p className="form-success" role="status">
              Invitation sent. Development link:{" "}
              <a href={invite.data.acceptUrl}>{invite.data.acceptUrl}</a>
            </p>
          )}
          <button className="button button-primary" disabled={invite.isPending}>
            {invite.isPending ? "Sending…" : "Send invitation"}
          </button>
        </form>
      </section>

      <h2 className="section-title">All invitations</h2>
      {revoke.isError ? (
        <p className="form-error" role="alert">
          {revoke.error instanceof ApiError
            ? revoke.error.message
            : "The invitation could not be revoked."}
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
                    <span>{item.role.replaceAll("_", " ")}</span>
                    <small>
                      {state === "accepted"
                        ? `Accepted ${new Date(item.accepted_at as string).toLocaleDateString()}`
                        : `Expires ${new Date(item.expires_at).toLocaleDateString()}`}
                    </small>
                  </div>
                  <div className="invitation-actions">
                    <span className={`status status-${state}`}>{STATE_LABELS[state]}</span>
                    {state === "pending" || state === "expired" ? (
                      <button
                        className="button-link"
                        onClick={() => revoke.mutate(item.id)}
                        disabled={revoke.isPending}
                      >
                        Revoke
                      </button>
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
