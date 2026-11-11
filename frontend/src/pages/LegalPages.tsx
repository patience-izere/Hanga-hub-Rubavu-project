import { Link } from "react-router-dom";
import type { ReactNode } from "react";

import { CONTACT } from "../config/site";

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy overview" eyebrow="Privacy" updated="Working draft · August 2026">
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
      <h2>Optional research and withdrawal</h2>
      <p>
        Pilot surveys require an explicit, current consent version and use a school-scoped
        pseudonymous participant code. A learner can withdraw survey responses from the evaluation
        page; the responses are deleted while a non-identifying withdrawal receipt is retained.
        Withdrawal does not change marks or access to required learning.
      </p>
      <h2>Retention and incidents</h2>
      <p>
        Research responses are removed when their configured retention period expires. The final
        period, backup deletion schedule, privacy contact, safeguarding lead, and incident process
        must be approved and communicated by each participating institution before collection.
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
        college, does not issue certificates or qualifications, and is not an equipment manual or a
        replacement for supervised physical instruction. See the{" "}
        <Link to="/disclaimer">disclaimer</Link>.
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

export function DisclaimerPage() {
  return (
    <LegalPage title="Disclaimer" eyebrow="Disclaimer" updated="Last updated · November 2026">
      <h2>OPedu is not a college</h2>
      <p>
        OPedu is a practice platform for technical skills. It is not a college, university,
        technical school or training institution, and it is not affiliated with, accredited by or
        acting on behalf of any of them.
      </p>
      <h2>No certificates or qualifications</h2>
      <p>
        OPedu does not issue certificates, diplomas or qualifications of any kind. The practice
        records, scores and badges you see on OPedu show what you did in the virtual workshop. They
        are not certificates and do not prove that you are qualified or competent to do the work.
      </p>
      <h2>Partner institutions</h2>
      <p>
        OPedu may partner with schools and training institutions. A partner institution may choose
        to award its own certificate to learners who complete both the virtual practice on OPedu and
        a supervised physical workshop training with that institution. In that case the certificate
        comes from the institution, under its own rules and accreditation, not from OPedu. A
        course&apos;s page says when a partner offers recognition.
      </p>
      <h2>Virtual practice is not physical training</h2>
      <p>
        Practising a procedure on OPedu helps you prepare, but it does not replace hands-on training
        under a qualified instructor. Never work on real vehicles, electrical installations or
        machinery on the strength of OPedu practice alone. Always follow your workplace&apos;s or
        school&apos;s safety rules and the instructions of the responsible person.
      </p>
      <h2>Content accuracy</h2>
      <p>
        We work to keep lessons accurate and safe, but procedures, tolerances and equipment vary.
        Check the manufacturer&apos;s instructions and your instructor&apos;s guidance before
        applying anything you practised here.
      </p>
      <h2>Questions</h2>
      <p>
        Contact us at <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>, by telephone or
        WhatsApp on {CONTACT.phoneDisplay}.
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
