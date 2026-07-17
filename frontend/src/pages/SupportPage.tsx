import { Link } from "react-router-dom";

export function SupportPage() {
  return (
    <section className="information-page">
      <header className="information-header">
        <div className="eyebrow">Learning and technical support</div>
        <h1>Get back to the workshop safely.</h1>
        <p>
          Start with the checks below. If the issue continues, share useful diagnostic details with
          your school&apos;s OPedu coordinator without sending passwords or sensitive learner data.
        </p>
      </header>

      <div className="support-grid">
        <article>
          <h2>Cannot sign in</h2>
          <p>Check the invited email address and keyboard language, then use password recovery.</p>
          <Link to="/forgot-password">Reset your password</Link>
        </article>
        <article>
          <h2>Lesson will not load</h2>
          <p>
            Reconnect to the school network, refresh once, and record the lesson title and time.
          </p>
        </article>
        <article>
          <h2>Simulation problem</h2>
          <p>
            Record the device, browser, attempted step, and any visible message for your
            coordinator.
          </p>
        </article>
        <article className="support-safety">
          <h2>Physical workshop safety</h2>
          <p>
            Stop the physical task and notify the responsible instructor immediately. OPedu guidance
            never replaces workshop supervision or school safety procedures.
          </p>
        </article>
      </div>

      <aside className="information-callout">
        <div>
          <h2>What to include in a support report</h2>
          <p>
            Device and browser, page or lesson, approximate time, and steps that reproduce the
            issue.
          </p>
        </div>
        <Link className="button button-secondary" to="/onboarding">
          Account access help
        </Link>
      </aside>
    </section>
  );
}
