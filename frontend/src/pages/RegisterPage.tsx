import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { describeApiError, type User } from "../api/client";
import { getOpenStatus, registerOpen } from "../api/open";
import { authQueryKey } from "../auth/useAuth";

/** An account for someone learning on their own: an apprentice, a mechanic, a curious student. */
export function RegisterPage({ user }: { user: User | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["open", "status"], queryFn: getOpenStatus });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [signInName, setSignInName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/learn/catalogue" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const created = await registerOpen({ firstName, lastName, signInName, password });
      queryClient.setQueryData(authQueryKey, created);
      navigate("/learn/catalogue", { replace: true });
    } catch (failure) {
      setError(describeApiError(failure, "Your account could not be created. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (status.data && !status.data.openRegistration) {
    return (
      <section className="information-page narrow-page">
        <h1>Sign-up is by invitation here.</h1>
        <p>Ask your school or training centre for an invitation or a class code.</p>
        <Link className="button button-primary" to="/class">
          I have a class code
        </Link>
      </section>
    );
  }

  return (
    <section className="auth-layout">
      <div className="auth-message">
        <div className="eyebrow">Learn on your own</div>
        <h1>Practise workshop skills for free.</h1>
        <p>
          No school needed. Choose lessons, practise as often as you like, and earn a practice
          certificate. If you join a class later, you can use the same account.
        </p>
        <Link className="hero-text-link" to="/demo">
          Not sure yet? Try a lesson first without an account.
        </Link>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h2>Create your account</h2>
        <label htmlFor="reg-first">First name</label>
        <input
          id="reg-first"
          autoComplete="given-name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
        />
        <label htmlFor="reg-last">Family name</label>
        <input
          id="reg-last"
          autoComplete="family-name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
        <label htmlFor="reg-name">Email, phone number or a sign-in name</label>
        <input
          id="reg-name"
          autoComplete="username"
          autoCapitalize="none"
          value={signInName}
          onChange={(event) => setSignInName(event.target.value)}
          required
        />
        <small className="field-note">
          With an email address you can reset a forgotten password yourself.
        </small>
        <label htmlFor="reg-password">Password</label>
        <input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <small className="field-note">
          At least 8 characters. A short sentence is easy to remember.
        </small>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button button-primary button-full" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <Link className="forgot-link" to="/login">
          Already have an account? Sign in
        </Link>
      </form>
    </section>
  );
}
