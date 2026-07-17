import { FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError, confirmPasswordReset } from "@/api/client";

export function ResetPasswordPage() {
  const { uid = "", token = "" } = useParams();
  const [newPassword, setNewPassword] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
        <h1>{complete ? "Password reset" : "Choose a new password"}</h1>
        {complete ? (
          <>
            <p>Your password has been updated.</p>
            <Link className="button button-primary" to="/login">
              Sign in
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="reset-new-password">New password</label>
            <input
              id="reset-new-password"
              type="password"
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
