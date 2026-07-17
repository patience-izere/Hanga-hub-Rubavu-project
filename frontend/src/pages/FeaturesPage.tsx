import { Link } from "react-router-dom";

import type { User } from "../api/client";

const features = [
  [
    "01",
    "Guided 3D practice",
    "Learners manipulate workshop objects inside an ordered procedure with clear objectives and instructions.",
  ],
  [
    "02",
    "Safety-aware feedback",
    "Safety-critical actions are identified, explained, and recorded separately from ordinary mistakes.",
  ],
  [
    "03",
    "Resumable attempts",
    "Interrupted work can continue from the last recorded step instead of forcing a learner to begin again.",
  ],
  [
    "04",
    "Accessible controls",
    "Every essential 3D interaction has an equivalent visible control for keyboard and touch users.",
  ],
  [
    "05",
    "Instructor evidence",
    "Authorized instructors review steps, errors, safety flags, timing, results, and an ordered attempt timeline.",
  ],
  [
    "06",
    "School-controlled access",
    "Single-use invitations connect each person to the correct institution and role-specific workspace.",
  ],
];

export function FeaturesPage({ user }: { user: User | null }) {
  return (
    <div className="public-page">
      <section className="public-hero features-hero">
        <div>
          <span className="eyebrow">Platform features</span>
          <h1>A virtual lab designed around the complete learning attempt.</h1>
        </div>
        <div className="public-hero-aside">
          <p>
            OPedu combines preparation, interaction, feedback, assessment evidence, and school
            oversight. Each capability serves the move from digital rehearsal to supervised physical
            practice.
          </p>
          <Link className="button button-primary" to={user ? "/dashboard" : "/login"}>
            {user ? "Open your dashboard" : "Enter the platform"} →
          </Link>
        </div>
      </section>

      <section className="public-section feature-catalogue">
        <div className="catalogue-intro">
          <span className="eyebrow">What the platform offers</span>
          <h2>Purpose-built for technical learning.</h2>
          <p>
            Current capabilities are shown here. Future ideas remain in the roadmap until they are
            implemented and validated.
          </p>
        </div>
        <div className="feature-card-grid">
          {features.map(([number, title, body]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="role-section">
        <header>
          <span className="eyebrow">Role-based experience</span>
          <h2>One platform. Focused views.</h2>
        </header>
        <div className="role-table-wrap">
          <table className="role-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Primary workspace</th>
                <th>What they can do</th>
                <th>Protected boundary</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Learner</th>
                <td>My learning</td>
                <td>Open assignments, practise, resume, and review own results</td>
                <td>Cannot see another learner&apos;s evidence</td>
              </tr>
              <tr>
                <th>Instructor</th>
                <td>Instructor dashboard</td>
                <td>Monitor attempts, safety flags, scores, and timelines</td>
                <td>Evidence remains school-scoped</td>
              </tr>
              <tr>
                <th>School administrator</th>
                <td>School administration</td>
                <td>Invite members and manage active school access</td>
                <td>Cannot manage another institution</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="process-banner">
        <span>Brief</span>
        <i aria-hidden="true">→</i>
        <span>Practise</span>
        <i aria-hidden="true">→</i>
        <span>Respond</span>
        <i aria-hidden="true">→</i>
        <span>Reflect</span>
      </section>

      <section className="public-section boundary-section">
        <div>
          <span className="eyebrow">What OPedu does not claim</span>
          <h2>Simulation supports practical competence. It does not certify it alone.</h2>
        </div>
        <div className="boundary-list">
          <p>
            <strong>Instructor supervision remains essential.</strong> Real equipment, context, and
            professional judgment belong in the physical workshop.
          </p>
          <p>
            <strong>Procedures require expert validation.</strong> Curriculum references,
            tolerances, scoring, and hazards must be confirmed before rollout.
          </p>
          <p>
            <strong>Impact must be measured.</strong> Adoption or learning-outcome claims will only
            be published after a defined pilot and verified evidence.
          </p>
        </div>
      </section>
    </div>
  );
}
