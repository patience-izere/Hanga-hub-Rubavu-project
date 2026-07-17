import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, requestPasswordReset } from "@/api/client";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      setMessage(await requestPasswordReset(email));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The request could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="account-page">
      <div className="account-card">
        <span className="eyebrow">Account recovery</span>
        <h1>Reset your password</h1>
        <p>
          Enter your account email. The response is intentionally the same whether an account exists
          or not.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="reset-email">Email</label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
          <button className="button button-primary" disabled={sending}>
            {sending ? "Sending…" : "Send reset instructions"}
          </button>
        </form>
        <Link className="back-link account-back" to="/login">
          Return to sign in
        </Link>
      </div>
    </section>
  );
}
