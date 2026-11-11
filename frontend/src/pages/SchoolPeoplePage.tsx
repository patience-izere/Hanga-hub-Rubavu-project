import { useState } from "react";

import { describeApiError } from "@/api/client";
import type { SchoolMember } from "@/api/school";
import { Link } from "react-router-dom";

import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination, PAGE_SIZE, useDebounced } from "@/components/ui/Pagination";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import {
  useSchoolMembers,
  useSetSchoolMemberActive,
  useUpdateSchoolMember,
} from "@/school/useSchoolAdmin";

const ROLE_LABELS: Record<SchoolMember["role"], string> = {
  admin: "School administrator",
  instructor: "Instructor",
  content_author: "Content author",
  learner: "Learner",
};

/** What changing to each role means, shown before the change is made. */
const ROLE_CONSEQUENCES: Record<SchoolMember["role"], string> = {
  admin: "They will manage people, invitations and classes, and approve content for this school.",
  instructor: "They will assign lessons, review attempts and sign off safety reviews.",
  content_author: "They will create and edit draft lessons and practicals for review.",
  learner: "They will see only their own assignments and attempts.",
};

export function SchoolPeoplePage() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | SchoolMember["role"]>("");
  const [page, setPage] = useState(1);
  const searchTerm = useDebounced(search.trim());
  const members = useSchoolMembers({ page, search: searchTerm, role });
  const activation = useSetSchoolMemberActive();
  const roleChange = useUpdateSchoolMember();
  const [pendingRole, setPendingRole] = useState<{
    member: SchoolMember;
    role: SchoolMember["role"];
  } | null>(null);
  const [confirming, setConfirming] = useState<SchoolMember | null>(null);
  const filtered = Boolean(searchTerm || role);

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
      {activation.isError || roleChange.isError ? (
        <p className="form-error" role="alert">
          {describeApiError(
            activation.error ?? roleChange.error,
            "That change could not be saved.",
          )}
        </p>
      ) : null}

      <QueryBoundary
        query={members}
        loading="Loading members…"
        error="Members could not be loaded."
      >
        {(data) => (
          <>
            <div className="roster-controls">
              <label>
                <span className="sr-only">Search members</span>
                <input
                  type="search"
                  placeholder="Search by name or email"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label>
                Role
                <select
                  value={role}
                  onChange={(event) => {
                    setRole(event.target.value as typeof role);
                    setPage(1);
                  }}
                >
                  <option value="">All roles</option>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <a
                className="button button-secondary"
                href={`/api/v1/school/members/export/?${new URLSearchParams({
                  ...(searchTerm ? { search: searchTerm } : {}),
                  ...(role ? { role } : {}),
                })}`}
                download
              >
                Download CSV
              </a>
              <span className="roster-count" aria-live="polite">
                {data.count.toLocaleString()} {filtered ? "matching " : ""}
                {data.count === 1 ? "member" : "members"}
              </span>
            </div>

            {data.results.length === 0 ? (
              filtered ? (
                <p className="field-note">No member matches that search.</p>
              ) : (
                <EmptyState
                  title="No members yet"
                  description="Invite instructors, learners and content authors from Invitations, or create a class with sign-in slips."
                  action={
                    <Link className="button button-primary" to="/school/invitations">
                      Invite people
                    </Link>
                  }
                />
              )
            ) : (
              <div className="member-grid">
                {data.results.map((member) => (
                  <article key={member.id} className={member.is_active ? "" : "is-suspended"}>
                    <div>
                      <strong>{member.user.name}</strong>
                      <span>{member.user.email}</span>
                      <small>
                        {ROLE_LABELS[member.role]}
                        {member.is_active ? "" : " · suspended"}
                      </small>
                    </div>
                    <div className="member-actions">
                      <label>
                        <span className="sr-only">Role for {member.user.name}</span>
                        <select
                          value={member.role}
                          disabled={roleChange.isPending || !member.is_active}
                          onChange={(event) =>
                            setPendingRole({
                              member,
                              role: event.target.value as SchoolMember["role"],
                            })
                          }
                        >
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button button-secondary"
                        disabled={activation.isPending}
                        onClick={() =>
                          member.is_active ? setConfirming(member) : apply(member, true)
                        }
                      >
                        {member.is_active ? "Suspend" : "Reactivate"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data.count}
              onPage={(next) => {
                setPage(next);
                window.scrollTo({ top: 0, behavior: "instant" });
              }}
              label="members"
            />
          </>
        )}
      </QueryBoundary>

      {pendingRole ? (
        <Dialog labelledBy="role-title" onClose={() => setPendingRole(null)}>
          <h2 id="role-title">
            Make {pendingRole.member.user.name} {ROLE_LABELS[pendingRole.role].toLowerCase()}?
          </h2>
          <p>{ROLE_CONSEQUENCES[pendingRole.role]}</p>
          {pendingRole.member.role === "learner" ? (
            <p>
              They leave their classes. Their attempts and results are kept and stay visible to
              instructors.
            </p>
          ) : null}
          <div className="modal-actions">
            <button className="button button-secondary" onClick={() => setPendingRole(null)}>
              Cancel
            </button>
            <button
              className="button button-primary"
              disabled={roleChange.isPending}
              onClick={() =>
                roleChange.mutate(
                  { id: pendingRole.member.id, role: pendingRole.role },
                  { onSettled: () => setPendingRole(null) },
                )
              }
            >
              {roleChange.isPending ? "Saving…" : "Change role"}
            </button>
          </div>
        </Dialog>
      ) : null}

      {confirming ? (
        <Dialog labelledBy="suspend-title" onClose={() => setConfirming(null)}>
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
        </Dialog>
      ) : null}
    </section>
  );
}
