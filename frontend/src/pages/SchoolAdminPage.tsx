import { FormEvent, useState } from "react";

import { ApiError } from "@/api/client";
import type { SchoolMember } from "@/api/school";
import {
  useCreateSchoolInvitation,
  useSchoolInvitations,
  useSchoolMembers,
  useSetSchoolMemberActive,
} from "@/learning/useSchoolAdmin";

export function SchoolAdminPage() {
  const members = useSchoolMembers();
  const invitations = useSchoolInvitations();
  const invite = useCreateSchoolInvitation();
  const activation = useSetSchoolMemberActive();
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
          <h1>People and access.</h1>
          <p>Invite approved users and suspend school access without deleting learning evidence.</p>
        </div>
      </div>
      <div className="admin-layout">
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
        <section className="admin-panel">
          <h2>Recent invitations</h2>
          {invitations.isPending && <p>Loading…</p>}
          {invitations.data?.length === 0 && <p>No invitations yet.</p>}
          <ul className="invitation-list">
            {invitations.data?.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.email}</strong>
                  <span>{item.role.replaceAll("_", " ")}</span>
                </div>
                <small>
                  {item.accepted_at ? "Accepted" : item.is_active ? "Pending" : "Closed"}
                </small>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="admin-panel member-panel">
        <h2>School members</h2>
        {members.isPending && <p>Loading members…</p>}
        {members.isError && <p className="form-error">Members could not be loaded.</p>}
        <div className="member-grid">
          {members.data?.map((member) => (
            <article key={member.id}>
              <div>
                <strong>{member.user.name}</strong>
                <span>{member.user.email}</span>
                <small>{member.role.replaceAll("_", " ")}</small>
              </div>
              <button
                className="button button-secondary"
                disabled={activation.isPending}
                onClick={() => activation.mutate({ id: member.id, isActive: !member.is_active })}
              >
                {member.is_active ? "Suspend" : "Reactivate"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
