import { useMemo, useState } from "react";

import { ApiError } from "@/api/client";
import type { SchoolMember } from "@/api/school";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { useSchoolMembers, useSetSchoolMemberActive } from "@/school/useSchoolAdmin";

const ROLE_LABELS: Record<SchoolMember["role"], string> = {
  admin: "School administrator",
  instructor: "Instructor",
  content_author: "Content author",
  learner: "Learner",
};

export function SchoolPeoplePage() {
  const members = useSchoolMembers();
  const activation = useSetSchoolMemberActive();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | SchoolMember["role"]>("");
  const [confirming, setConfirming] = useState<SchoolMember | null>(null);

  const all = useMemo(() => members.data ?? [], [members.data]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((member) => {
      if (role && member.role !== role) return false;
      if (!term) return true;
      return (
        member.user.name.toLowerCase().includes(term) ||
        member.user.email.toLowerCase().includes(term)
      );
    });
  }, [all, search, role]);

  function apply(member: SchoolMember, isActive: boolean) {
    activation.mutate({ id: member.id, isActive });
    setConfirming(null);
  }

  return (
    <section className="dashboard school-admin-page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">School administration</span>
          <h1>People and access.</h1>
          <p>Suspend school access without deleting any learning evidence.</p>
        </div>
      </div>

      {/* The API refuses self-deactivation and removal of the last administrator; surface the
          server's own reason rather than a generic failure. */}
      {activation.isError ? (
        <p className="form-error" role="alert">
          {activation.error instanceof ApiError
            ? activation.error.message
            : "That change could not be saved."}
        </p>
      ) : null}

      <QueryBoundary
        query={members}
        loading="Loading members…"
        error="Members could not be loaded."
        empty={{
          title: "No members yet",
          description: "Invite instructors, learners and content authors to populate the school.",
        }}
      >
        {() => (
          <>
            <div className="roster-controls">
              <label>
                <span className="sr-only">Search members</span>
                <input
                  type="search"
                  placeholder="Search by name or email"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label>
                Role
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as typeof role)}
                >
                  <option value="">All roles</option>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="roster-count">
                {visible.length} of {all.length} member(s)
              </span>
            </div>

            {visible.length === 0 ? (
              <p className="field-note">No member matches that search.</p>
            ) : (
              <div className="member-grid">
                {visible.map((member) => (
                  <article key={member.id} className={member.is_active ? "" : "is-suspended"}>
                    <div>
                      <strong>{member.user.name}</strong>
                      <span>{member.user.email}</span>
                      <small>
                        {ROLE_LABELS[member.role]}
                        {member.is_active ? "" : " · suspended"}
                      </small>
                    </div>
                    <button
                      className="button button-secondary"
                      disabled={activation.isPending}
                      onClick={() =>
                        member.is_active ? setConfirming(member) : apply(member, true)
                      }
                    >
                      {member.is_active ? "Suspend" : "Reactivate"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </QueryBoundary>

      {confirming ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setConfirming(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="suspend-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="suspend-title">Suspend {confirming.user.name}?</h2>
            <p>
              They lose access to this school immediately. Their attempts, evidence and results are
              retained, and you can reactivate them at any time.
            </p>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setConfirming(null)}>
                Cancel
              </button>
              <button
                className="button button-primary"
                onClick={() => apply(confirming, false)}
                disabled={activation.isPending}
              >
                {activation.isPending ? "Suspending…" : "Suspend access"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
