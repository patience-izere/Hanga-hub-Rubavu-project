import { FormEvent, useState } from "react";

import { ApiError, changePassword } from "@/api/client";

export function AccountSecurityPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Your password was changed. Your current session remains active.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The password could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="account-page">
      <div className="account-card">
        <span className="eyebrow">Account security</span>
        <h1>Change your password</h1>
        <p>Use a long password that you do not reuse for another service.</p>
        <form onSubmit={submit}>
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
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
          {message && (
            <p className="form-success" role="status">
              {message}
            </p>
          )}
          <button className="button button-primary" disabled={saving}>
            {saving ? "Changing…" : "Change password"}
          </button>
        </form>
      </div>
    </section>
  );
}
