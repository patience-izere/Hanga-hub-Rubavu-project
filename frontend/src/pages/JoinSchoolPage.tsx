import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { describeApiError } from "@/api/client";
import { acceptInvitation, getInvitationPreview } from "@/api/school";
import { useCurrentUser } from "@/auth/useAuth";

export function JoinSchoolPage() {
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
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

  async function accept(details: Parameters<typeof acceptInvitation>[1]) {
    setSaving(true);
    setError("");
    try {
      await acceptInvitation(token, details);
      await queryClient.invalidateQueries({ queryKey: ["auth", "current-user"] });
      setComplete(true);
    } catch (caught) {
      setError(describeApiError(caught, "The invitation could not be accepted."));
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void accept({ firstName, lastName, password });
  }

  const user = currentUser.data ?? null;
  const invitedEmail = preview.data?.email.toLowerCase() ?? "";
  const signedInAsInvitee = Boolean(user && user.email.toLowerCase() === invitedEmail);
  const signedInAsSomeoneElse = Boolean(user && !signedInAsInvitee);

  return (
    <section className="account-page">
      <div className="account-card">
        <span className="eyebrow">School invitation</span>
        {(preview.isPending || currentUser.isPending) && <p>Checking invitation…</p>}
        {preview.isError && (
          <>
            <h1>Invitation unavailable</h1>
            <p>This link is invalid, expired, or already used.</p>
          </>
        )}
        {preview.data && !currentUser.isPending && !complete && (
          <>
            <h1>Join {preview.data.schoolName}</h1>
            <p>
              {preview.data.email} was invited as {preview.data.role.toLowerCase()}.
            </p>

            {signedInAsSomeoneElse ? (
              <p className="form-error" role="alert">
                You are signed in as {user?.email}. This invitation is for {preview.data.email}:
                sign out, then open the link again.
              </p>
            ) : signedInAsInvitee ? (
              <>
                <p>
                  You already use OPedu. Accepting adds {preview.data.schoolName} to your account;
                  your other schools stay as they are.
                </p>
                <button
                  className="button button-primary"
                  disabled={saving}
                  onClick={() => void accept({})}
                >
                  {saving ? "Joining…" : `Join ${preview.data.schoolName}`}
                </button>
              </>
            ) : preview.data.accountExists ? (
              <>
                <p>
                  You already have an OPedu account. Sign in with it and you will come back here to
                  join the school.
                </p>
                <Link
                  className="button button-primary"
                  to="/login"
                  state={{ from: `/join/${token}` }}
                >
                  Sign in to join
                </Link>
              </>
            ) : (
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
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button className="button button-primary" disabled={saving}>
                  {saving ? "Creating account…" : "Accept invitation"}
                </button>
              </form>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
        {complete && (
          <>
            <h1>Welcome to {preview.data?.schoolName ?? "OPedu"}</h1>
            <p>Your school membership is active.</p>
            <Link className="button button-primary" to="/dashboard">
              Open dashboard
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
