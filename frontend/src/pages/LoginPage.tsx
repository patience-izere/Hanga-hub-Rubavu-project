import { type FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { describeApiError, type User } from "../api/client";
import { useSignIn } from "../auth/useAuth";
import { useLocale } from "../i18n/LocaleProvider";

export function LoginPage({ user }: { user: User | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useSignIn();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const sessionExpired = sessionStorage.getItem("opedu:session-expired") === "true";

  // Once signed in, go where the person was heading (a protected page, or an invitation link).
  const destination = (location.state as { from?: string } | null)?.from || "/dashboard";

  if (user) {
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await login.mutateAsync({ email, password });
    } catch {
      return; // The error is shown below from the mutation state.
    }
    sessionStorage.removeItem("opedu:session-expired");
    navigate(destination, { replace: true });
  }

  return (
    <section className="auth-layout">
      <div className="auth-message">
        <div className="eyebrow">{t("login.eyebrow")}</div>
        <h1>{t("login.title")}</h1>
        <p>{t("login.lead")}</p>
        <ul className="auth-routes">
          <li>
            <Link to="/class">{t("login.haveCode")}</Link>
          </li>
          <li>
            <Link to="/register">{t("login.learnAlone")}</Link>
          </li>
          <li>
            <Link to="/demo">{t("login.tryDemo")}</Link>
          </li>
        </ul>
      </div>
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>{t("login.heading")}</h2>
        {sessionExpired ? (
          <p className="form-error" role="status">
            {t("login.expired")}
          </p>
        ) : null}
        <label htmlFor="email">{t("login.identifier")}</label>
        <input
          id="email"
          name="email"
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="password">{t("login.password")}</label>
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
            {describeApiError(login.error, "Sign in failed. Try again.")}
          </p>
        ) : null}
        <button className="button button-primary button-full" disabled={login.isPending}>
          {login.isPending ? t("login.submitting") : t("login.submit")}
        </button>
        <Link className="forgot-link" to="/forgot-password">
          {t("login.forgot")}
        </Link>
        <small className="field-note">{t("login.forgotPin")}</small>
        <Link className="forgot-link" to="/onboarding">
          {t("login.needAccount")}
        </Link>
      </form>
    </section>
  );
}
