import { Link } from "react-router-dom";

import type { User } from "../api/client";

export function OnboardingPage({ user }: { user: User | null }) {
  return (
    <section className="information-page">
      <header className="information-header">
        <div className="eyebrow">Ways to join</div>
        <h1>Join your school&apos;s learning space.</h1>
        <p>
          Pick the way that fits you. None of them needs a special device, and only an invitation
          needs an email address.
        </p>
      </header>

      <div className="information-grid" aria-label="Ways to join">
        <article>
          <span>01</span>
          <h2>With a class code</h2>
          <p>
            Your instructor shows a six-letter code. Type it, choose a PIN, and you are in.{" "}
            <Link to="/class">Join a class</Link>
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>With an invitation or a slip</h2>
          <p>
            Your school sends an email invitation, or your instructor hands you a slip with your
            sign-in name and PIN. <Link to="/login">Sign in</Link>
          </p>
        </article>
        <article>
          <span>03</span>
          <h2>On your own</h2>
          <p>
            Apprentices and anyone curious can practise the open lessons for free.{" "}
            <Link to="/register">Create an account</Link>
          </p>
        </article>
      </div>
      <p className="information-note">
        Running a school, a garage with apprentices or a training hub?{" "}
        <Link to="/register-school">Ask to set up your organisation</Link>.
      </p>

      <aside className="information-callout">
        <div>
          <h2>{user ? "Your account is ready" : "Already received access?"}</h2>
          <p>
            {user
              ? "Continue to your role-specific dashboard."
              : "Sign in with the email address your administrator invited."}
          </p>
        </div>
        <Link className="button button-primary" to={user ? "/dashboard" : "/login"}>
          {user ? "Open dashboard" : "Sign in"}
        </Link>
      </aside>
    </section>
  );
}
