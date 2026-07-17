import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy overview" eyebrow="Privacy" updated="Working draft · July 2026">
      <h2>Purpose and scope</h2>
      <p>
        OPedu is designed to keep learning records inside the relevant school context. This overview
        describes the current MVP and is not a substitute for the formal privacy review required
        before a real-school pilot.
      </p>
      <h2>Information used by the MVP</h2>
      <p>
        Account identifiers, school membership and role, assigned lessons, attempt status,
        meaningful simulation actions, errors, safety flags, timing, scores, and password-security
        events may be processed to provide the learning experience.
      </p>
      <h2>Who can access learning evidence</h2>
      <p>
        Learners can access their own assignments and results. Authorized instructors and school
        administrators can review evidence scoped to their active school membership. Platform
        administrators may require limited operational access.
      </p>
      <h2>Data we avoid</h2>
      <p>
        The current design does not require open social profiles, advertising identifiers, live
        learner location, or unrestricted learner-to-learner messaging. Future features must justify
        any additional personal data before collection.
      </p>
      <h2>Before a school pilot</h2>
      <p>
        OPedu still requires approved retention periods, privacy and safeguarding review, school
        agreements, support ownership, and appropriate learner or parental information and consent.
      </p>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Platform use and safety" eyebrow="Terms" updated="Working draft · July 2026">
      <h2>Educational purpose</h2>
      <p>
        OPedu supports technical-learning preparation, guided practice, and review. It is not a
        professional certification, equipment manual, or replacement for supervised physical
        instruction.
      </p>
      <h2>Authorized access</h2>
      <p>
        Use is limited to people invited by a participating institution or otherwise authorized by
        the platform. Users must protect their credentials and must not attempt to access another
        school or learner&apos;s records.
      </p>
      <h2>Workshop safety</h2>
      <p>
        Always follow the institution&apos;s safety procedures and the responsible instructor&apos;s
        directions. Stop physical work and notify the instructor if equipment, conditions, or
        instructions appear unsafe.
      </p>
      <h2>Learning evidence</h2>
      <p>
        Simulation events and results may help an instructor identify progress or remediation needs.
        They must be interpreted with observation and other evidence appropriate to the competency.
      </p>
      <h2>MVP status</h2>
      <p>
        The current platform is under development. Curriculum references, technical procedures,
        tolerances, scoring, device readiness, and support processes require validation before
        operational school use.
      </p>
    </LegalPage>
  );
}

function LegalPage({
  title,
  eyebrow,
  updated,
  children,
}: {
  title: string;
  eyebrow: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="legal-page">
      <header>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{updated}</p>
      </header>
      <div className="legal-layout">
        <aside>
          <strong>Important</strong>
          <p>
            This is transparent product guidance for the current MVP, not final legal documentation.
          </p>
          <Link to="/contact">Ask a question →</Link>
        </aside>
        <article>{children}</article>
      </div>
    </div>
  );
}
