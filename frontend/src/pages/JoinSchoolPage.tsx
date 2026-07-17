import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { acceptInvitation, getInvitationPreview } from "@/api/school";

export function JoinSchoolPage() {
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ["school", "invitation", token],
    queryFn: () => getInvitationPreview(token),
    retry: false,
  });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await acceptInvitation(token, { firstName, lastName, password });
      await queryClient.invalidateQueries({ queryKey: ["auth", "current-user"] });
      setComplete(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "The invitation could not be accepted.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="account-page">
      <div className="account-card">
        <span className="eyebrow">School invitation</span>
        {preview.isPending && <p>Checking invitation…</p>}
        {preview.isError && (
          <>
            <h1>Invitation unavailable</h1>
            <p>This link is invalid, expired, or already used.</p>
          </>
        )}
        {preview.data && !complete && (
          <>
            <h1>Join {preview.data.schoolName}</h1>
            <p>
              {preview.data.email} was invited as {preview.data.role.toLowerCase()}.
            </p>
            <form onSubmit={submit}>
              <label htmlFor="join-first">First name</label>
              <input
                id="join-first"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />
              <label htmlFor="join-last">Last name</label>
              <input
                id="join-last"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
              />
              <label htmlFor="join-password">Password</label>
              <input
                id="join-password"
                type="password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button button-primary" disabled={saving}>
                {saving ? "Creating account…" : "Accept invitation"}
              </button>
            </form>
          </>
        )}
        {complete && (
          <>
            <h1>Welcome to OPedu</h1>
            <p>Your account and school membership are active.</p>
            <Link className="button button-primary" to="/dashboard">
              Open dashboard
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
