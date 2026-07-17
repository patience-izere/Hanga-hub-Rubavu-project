import { Link } from "react-router-dom";

import type { User } from "../api/client";

export function OnboardingPage({ user }: { user: User | null }) {
  return (
    <section className="information-page">
      <header className="information-header">
        <div className="eyebrow">Controlled school access</div>
        <h1>Join your school&apos;s learning space.</h1>
        <p>
          OPedu accounts are issued by participating technical schools. This keeps learner records,
          instructor evidence, and practical assessments inside the correct institution.
        </p>
      </header>

      <div className="information-grid" aria-label="How onboarding works">
        <article>
          <span>01</span>
          <h2>Ask your school</h2>
          <p>Your school administrator selects your role and sends an invitation to your email.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Open the invitation</h2>
          <p>Use the single-use link within seven days and set a strong password.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Enter your workspace</h2>
          <p>
            Your account is connected to the school automatically, with only the access you need.
          </p>
        </article>
      </div>

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
