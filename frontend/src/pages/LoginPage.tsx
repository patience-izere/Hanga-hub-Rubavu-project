import { type FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import type { ApiError, User } from "../api/client";
import { useSignIn } from "../auth/useAuth";

export function LoginPage({ user }: { user: User | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useSignIn();
  const navigate = useNavigate();
  const location = useLocation();
  const sessionExpired = sessionStorage.getItem("opedu:session-expired") === "true";

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await login.mutateAsync({ email, password });
    sessionStorage.removeItem("opedu:session-expired");
    const destination = (location.state as { from?: string } | null)?.from || "/dashboard";
    navigate(destination, { replace: true });
  }

  return (
    <section className="auth-layout">
      <div className="auth-message">
        <div className="eyebrow">Learner and instructor access</div>
        <h1>Welcome back to the workshop.</h1>
        <p>Sign in with the account provided by your school or programme administrator.</p>
      </div>
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Sign in</h2>
        {sessionExpired ? (
          <p className="form-error" role="status">
            Your session expired. Sign in again to continue.
          </p>
        ) : null}
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {login.isError ? (
          <p className="form-error" role="alert">
            {(login.error as ApiError).message}
          </p>
        ) : null}
        <button className="button button-primary button-full" disabled={login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>
        <Link className="forgot-link" to="/forgot-password">
          Forgot your password?
        </Link>
        <Link className="forgot-link" to="/onboarding">
          Need an account? Learn how access works.
        </Link>
      </form>
    </section>
  );
}
