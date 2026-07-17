import { Link } from "react-router-dom";

import type { User } from "../api/client";

const audiences = [
  {
    label: "For learners",
    title: "Build confidence before the workshop.",
    body: "See the objective, hazards, tools, and correct sequence before working with physical equipment.",
    outcome: "Guidance at every step",
  },
  {
    label: "For instructors",
    title: "See more than a final score.",
    body: "Review attempts, completed steps, incorrect actions, safety flags, and the order in which a learner worked.",
    outcome: "Evidence you can act on",
  },
  {
    label: "For schools",
    title: "Keep learning inside the institution.",
    body: "Invite members by role and keep learner records and instructor review scoped to the correct school.",
    outcome: "Controlled school access",
  },
];

const journey = [
  [
    "01",
    "Brief",
    "Review the task, learning objectives, tools, hazards, and expected completion time.",
  ],
  [
    "02",
    "Practise",
    "Work through the procedure in an interactive 3D environment with accessible controls.",
  ],
  ["03", "Respond", "Receive immediate, safety-aware feedback and resume an interrupted attempt."],
  [
    "04",
    "Reflect",
    "Review the result while an authorized instructor sees the evidence behind it.",
  ],
];

export function HomePage({ user }: { user: User | null }) {
  return (
    <div className="home-page">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <div className="eyebrow">Practical learning, made safer</div>
          <h1 id="home-title">Practise the procedure before touching the machine.</h1>
          <p className="hero-lead">
            OPedu is a competency-based technical learning platform that connects guided 3D practice
            with the evidence instructors need to support real workshop learning.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to={user ? "/dashboard" : "/login"}>
              {user ? "Continue learning" : "Enter the platform"}
              <span aria-hidden="true">→</span>
            </Link>
            <a className="button button-secondary" href="#platform">
              Explore how it works
            </a>
          </div>
          <p className="hero-note">
            Designed for technical schools · Desktop-first · No special headset required
          </p>
        </div>

        <div className="hero-product" aria-label="Example of an OPedu learning activity">
          <div className="product-window">
            <div className="product-window-bar">
              <span className="window-dot" />
              <span className="window-dot" />
              <span className="window-dot" />
              <small>Guided workshop</small>
            </div>
            <div className="product-workspace">
              <div className="product-scene" aria-hidden="true">
                <span className="scene-label">3D practice area</span>
                <div className="battery-visual">
                  <span>+</span>
                  <strong>12V</strong>
                  <span>−</span>
                </div>
                <div className="tool-line" />
              </div>
              <div className="product-instruction">
                <span className="product-step">Step 3 of 7</span>
                <h2>Inspect the battery case</h2>
                <p>Check for cracks, leaks, swelling, or damaged terminals before testing.</p>
                <div className="safety-tip">
                  <span aria-hidden="true">!</span>
                  Wear eye protection
                </div>
                <div className="progress-track">
                  <span />
                </div>
                <span className="product-button">Confirm inspection</span>
              </div>
            </div>
          </div>
          <div className="hero-proof proof-score">
            <strong>Safety-aware</strong>
            <span>feedback</span>
          </div>
          <div className="hero-proof proof-evidence">
            <strong>7 steps</strong>
            <span>recorded as evidence</span>
          </div>
        </div>
      </section>

      <section className="context-strip" aria-label="Platform focus">
        <p>Built for the full learning loop</p>
        <ul>
          <li>Prepare safely</li>
          <li>Practise actively</li>
          <li>Review evidence</li>
          <li>Transfer to the workshop</li>
        </ul>
      </section>

      <section className="home-section platform-section" id="platform">
        <header className="section-heading">
          <div>
            <span className="eyebrow">One platform, three perspectives</span>
            <h2>Everyone sees what they need to move learning forward.</h2>
          </div>
          <p>
            OPedu joins simulation, assessment, and instructor review in one school-controlled
            experience—so digital practice supports the workshop instead of sitting apart from it.
          </p>
        </header>
        <div className="audience-grid">
          {audiences.map((audience, index) => (
            <article key={audience.label}>
              <div className="audience-number">0{index + 1}</div>
              <span className="audience-label">{audience.label}</span>
              <h3>{audience.title}</h3>
              <p>{audience.body}</p>
              <div className="audience-outcome">
                <span aria-hidden="true">✓</span>
                {audience.outcome}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section journey-section" id="experience">
        <div className="journey-intro">
          <span className="eyebrow">The learning journey</span>
          <h2>From first briefing to instructor insight.</h2>
          <p>
            A clear four-part flow helps learners understand why a procedure matters, practise it,
            recover from mistakes, and discuss concrete evidence with an instructor.
          </p>
          <div className="journey-quote">
            <span aria-hidden="true">“</span>
            <p>
              Digital practice prepares the learner. Qualified supervision guides the real task.
            </p>
          </div>
        </div>
        <ol className="journey-list">
          {journey.map(([number, title, description]) => (
            <li key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="evidence-section" aria-labelledby="evidence-title">
        <div className="evidence-copy">
          <span className="eyebrow">Evidence, not guesswork</span>
          <h2 id="evidence-title">A score tells you what happened. Evidence helps explain why.</h2>
          <p>
            OPedu records meaningful learning actions so authorized instructors can identify where a
            learner progressed, hesitated, made a safety error, or may need another demonstration.
          </p>
          <ul className="check-list">
            <li>Ordered procedure steps and completion status</li>
            <li>Incorrect actions, hints, and safety flags</li>
            <li>Attempt duration, result, and review timeline</li>
            <li>School-scoped access based on each person&apos;s role</li>
          </ul>
        </div>
        <div className="evidence-card" aria-label="Example instructor evidence summary">
          <div className="evidence-card-heading">
            <div>
              <small>Learner attempt</small>
              <strong>Battery inspection</strong>
            </div>
            <span className="status-pill">Completed</span>
          </div>
          <div className="evidence-score-row">
            <div>
              <strong>86%</strong>
              <span>Result</span>
            </div>
            <div>
              <strong>6 / 7</strong>
              <span>Steps</span>
            </div>
            <div>
              <strong>12m</strong>
              <span>Duration</span>
            </div>
          </div>
          <div className="evidence-timeline">
            <div className="timeline-row is-complete">
              <span>✓</span>
              <p>
                <strong>PPE confirmed</strong>
                <small>Completed correctly</small>
              </p>
              <time>00:41</time>
            </div>
            <div className="timeline-row is-complete">
              <span>✓</span>
              <p>
                <strong>Visual inspection</strong>
                <small>Completed correctly</small>
              </p>
              <time>03:18</time>
            </div>
            <div className="timeline-row is-alert">
              <span>!</span>
              <p>
                <strong>Terminal sequence</strong>
                <small>Review recommended</small>
              </p>
              <time>07:52</time>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section current-module" id="schools">
        <div className="module-card">
          <div className="module-topline">
            <span>Current learning experience</span>
            <span className="module-status">
              <i /> Active MVP
            </span>
          </div>
          <div className="module-content">
            <div>
              <span className="eyebrow">Automobile technology</span>
              <h2>Battery Inspection and Diagnosis</h2>
              <p>
                Learners prepare, inspect, and diagnose a vehicle battery through an ordered,
                resumable procedure with safety-aware scoring and instructor-visible evidence.
              </p>
            </div>
            <dl>
              <div>
                <dt>Mode</dt>
                <dd>Guided 3D simulation</dd>
              </div>
              <div>
                <dt>Focus</dt>
                <dd>Procedure and safety</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>School invitation</dd>
              </div>
              <div>
                <dt>Review</dt>
                <dd>Learner + instructor</dd>
              </div>
            </dl>
          </div>
          <p className="validation-note">
            OPedu supports preparation and assessment. Physical procedures, curriculum alignment,
            tolerances, and scoring must be validated by qualified technical instructors before a
            real school rollout.
          </p>
        </div>
      </section>

      <section className="home-section principles-section">
        <header className="section-heading compact-heading">
          <div>
            <span className="eyebrow">Designed with care</span>
            <h2>Practical principles for real school environments.</h2>
          </div>
        </header>
        <div className="principle-grid">
          <article>
            <span>01</span>
            <h3>Safety stays visible</h3>
            <p>
              Hazards, PPE, and safety-critical steps are part of the learning flow—not an
              afterthought.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>Access stays focused</h3>
            <p>
              Learners, instructors, and administrators receive role-appropriate views inside their
              school.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Interaction stays inclusive</h3>
            <p>
              Every essential 3D action has an equivalent keyboard- and touch-friendly interface.
            </p>
          </article>
          <article>
            <span>04</span>
            <h3>Technology stays purposeful</h3>
            <p>
              The experience is desktop-first and designed to complement—not replace—instructor-led
              practice.
            </p>
          </article>
        </div>
      </section>

      <section className="home-section faq-section" aria-labelledby="faq-title">
        <div className="faq-heading">
          <span className="eyebrow">Common questions</span>
          <h2 id="faq-title">Know what to expect.</h2>
          <p>Clear answers for learners, instructors, and school leaders exploring OPedu.</p>
          <Link to="/support">
            Visit the support centre <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="faq-list">
          <details open>
            <summary>Does OPedu replace physical workshop practice?</summary>
            <p>
              No. It prepares learners for supervised practical work and gives instructors evidence
              to guide follow-up.
            </p>
          </details>
          <details>
            <summary>Do learners need a VR headset?</summary>
            <p>
              No. The current experience is designed for a desktop browser, with visible controls
              for essential actions.
            </p>
          </details>
          <details>
            <summary>How does a learner get access?</summary>
            <p>
              A participating school administrator sends a single-use invitation and assigns the
              appropriate role.
            </p>
          </details>
          <details>
            <summary>Who can see learner evidence?</summary>
            <p>
              Access is limited by authenticated role and active school membership. Learners see
              their own work; authorized school staff review school-scoped evidence.
            </p>
          </details>
        </div>
      </section>

      <section className="final-cta">
        <div>
          <span className="eyebrow">Ready for the next step?</span>
          <h2>
            {user
              ? "Your workshop is ready when you are."
              : "Turn preparation into confident practice."}
          </h2>
        </div>
        <div>
          <p>
            {user
              ? "Continue your assigned learning from your role-specific workspace."
              : "Already invited by your school? Sign in to open your learning workspace."}
          </p>
          <Link className="button button-light" to={user ? "/dashboard" : "/login"}>
            {user ? "Open my dashboard" : "Sign in to OPedu"} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
