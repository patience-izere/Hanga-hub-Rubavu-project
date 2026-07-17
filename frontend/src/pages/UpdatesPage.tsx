import { Link } from "react-router-dom";

const updates = [
  {
    category: "Current module",
    status: "Available in the MVP",
    title: "Battery Inspection and Diagnosis",
    summary:
      "The first complete learning flow covers briefing, an ordered seven-step simulation, resumable progress, safety-aware scoring, learner results, and instructor review.",
    detail: "Automobile technology · Guided 3D practice",
  },
  {
    category: "Platform",
    status: "Implemented",
    title: "Evidence that follows the learning process",
    summary:
      "Attempt events now show completed steps, incorrect actions, safety errors, timing, and the order in which the learner worked—not only a final percentage.",
    detail: "Learner results · Instructor timeline",
  },
  {
    category: "School access",
    status: "Implemented",
    title: "Controlled invitations and role-based workspaces",
    summary:
      "School administrators can issue expiring, single-use invitations and manage active membership for learners and instructors inside their institution.",
    detail: "Administration · Privacy by role",
  },
];

const roadmap = [
  [
    "Next",
    "Instructor feedback",
    "Add structured observations and published feedback connected to an attempt.",
  ],
  [
    "Next",
    "Offline readiness",
    "Buffer meaningful actions and prepare selected lessons for unreliable school connectivity.",
  ],
  [
    "Research",
    "Curriculum validation",
    "Confirm competencies, procedure, hazards, tolerances, and assessment rules with qualified instructors.",
  ],
  [
    "Pilot",
    "School readiness",
    "Validate devices, instructor preparation, learner support, safeguarding, and measurable outcomes.",
  ],
];

export function UpdatesPage() {
  return (
    <div className="public-page">
      <section className="public-hero updates-hero">
        <div>
          <span className="eyebrow">Updates and roadmap</span>
          <h1>Follow what is working, what comes next, and what still needs validation.</h1>
        </div>
        <div className="public-hero-aside">
          <p>
            OPedu updates separate implemented capability from planned work. That makes it easier
            for schools, instructors, and collaborators to understand the platform&apos;s real
            state.
          </p>
          <Link className="text-link" to="/contact">
            Discuss the roadmap →
          </Link>
        </div>
      </section>

      <section className="public-section updates-section">
        <header className="updates-heading">
          <span className="eyebrow">Latest product notes</span>
          <h2>Progress you can inspect.</h2>
        </header>
        <div className="updates-grid">
          {updates.map((update, index) => (
            <article key={update.title}>
              <div className="update-meta">
                <span>{update.category}</span>
                <span>{update.status}</span>
              </div>
              <div className="update-index">0{index + 1}</div>
              <h3>{update.title}</h3>
              <p>{update.summary}</p>
              <small>{update.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="roadmap-section">
        <div className="roadmap-heading">
          <span className="eyebrow">Near-term roadmap</span>
          <h2>From a working module to a responsible school pilot.</h2>
          <p>
            Priorities are ordered around learning quality and safe operation, not feature count.
          </p>
        </div>
        <ol className="roadmap-list">
          {roadmap.map(([stage, title, body], index) => (
            <li key={title}>
              <span className="roadmap-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <small>{stage}</small>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="updates-notice">
        <div>
          <span className="eyebrow">Stay informed</span>
          <h2>Updates live here until a verified mailing channel is available.</h2>
        </div>
        <p>
          We are not collecting newsletter addresses yet. This avoids promising messages without an
          approved mailing owner, privacy notice, and unsubscribe process.
        </p>
      </section>
    </div>
  );
}
