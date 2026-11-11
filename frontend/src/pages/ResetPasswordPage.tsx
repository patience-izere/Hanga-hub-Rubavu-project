import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { ApiError, checkPasswordResetLink, confirmPasswordReset } from "@/api/client";
import { PasswordInput } from "@/components/ui/PasswordInput";

export function ResetPasswordPage() {
  const { uid = "", token = "" } = useParams();
  const [newPassword, setNewPassword] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const linkCheck = useQuery({
    queryKey: ["password-reset-link", uid, token],
    queryFn: () => checkPasswordResetLink(uid, token),
    staleTime: Infinity,
  });
  const linkInvalid = linkCheck.data === false;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await confirmPasswordReset(uid, token, newPassword);
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The password could not be reset.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="account-page">
      <div className="account-card">
        <span className="eyebrow">Account recovery</span>
        <h1>
          {complete
            ? "Password reset"
            : linkInvalid
              ? "This reset link has expired"
              : "Choose a new password"}
        </h1>
        {linkInvalid && !complete ? (
          <>
            <p role="alert">
              The link is invalid, already used or more than three days old. Ask for a new one; it
              is sent to the same email address.
            </p>
            <Link className="button button-primary" to="/forgot-password">
              Send a new reset link
            </Link>
          </>
        ) : linkCheck.isPending ? (
          <p className="panel-status" role="status">
            Checking your reset link…
          </p>
        ) : complete ? (
          <>
            <p>Your password has been updated.</p>
            <Link className="button button-primary" to="/login">
              Sign in
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="reset-new-password">New password</label>
            <PasswordInput
              id="reset-new-password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button button-primary" disabled={saving}>
              {saving ? "Saving…" : "Reset password"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
