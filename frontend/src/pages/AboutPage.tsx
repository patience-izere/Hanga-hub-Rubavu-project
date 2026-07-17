import { Link } from "react-router-dom";

const teamRoles = [
  {
    initial: "P",
    title: "Product and pedagogy",
    body: "Shapes each learning journey around clear objectives, useful feedback, and real teaching needs.",
  },
  {
    initial: "T",
    title: "Technical instruction",
    body: "Validates procedures, hazards, tolerances, and the transfer from simulation to supervised practice.",
  },
  {
    initial: "E",
    title: "Platform engineering",
    body: "Builds the 3D learning environment, school access controls, evidence records, and reliable delivery.",
  },
  {
    initial: "S",
    title: "School partners",
    body: "Guide device readiness, instructor adoption, learner support, safeguarding, and meaningful pilot outcomes.",
  },
];

export function AboutPage() {
  return (
    <div className="public-page">
      <section className="public-hero public-hero-about">
        <div>
          <span className="eyebrow">About OPedu</span>
          <h1>Technical confidence starts before the learner enters the workshop.</h1>
        </div>
        <div className="public-hero-aside">
          <p>
            OPedu is a virtual-lab learning platform being developed in Rubavu, Rwanda, to help
            technical learners understand procedures, practise safely, and produce evidence an
            instructor can review.
          </p>
          <Link className="text-link" to="/features">
            Explore the platform <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="story-section">
        <div className="story-marker" aria-hidden="true">
          <span>OP</span>
          <strong>EDU</strong>
        </div>
        <div className="story-copy">
          <span className="eyebrow">Our story</span>
          <h2>Built around the gap between knowing and doing.</h2>
          <p>
            Technical learners often need to remember tools, hazards, sequence, and judgment at the
            same time. Physical workshop time is essential, but it can be limited and mistakes can
            be costly or unsafe. OPedu gives learners a guided place to prepare before supervised
            practice and gives instructors a clearer view of how each attempt unfolded.
          </p>
          <p>
            The first working module focuses on automotive battery inspection and diagnosis. It is
            an active MVP: the software workflow is working, while curriculum alignment, technical
            tolerances, and real-school outcomes still require qualified instructor validation.
          </p>
        </div>
      </section>

      <section className="mission-grid" aria-label="Mission and vision">
        <article>
          <span>01 · Mission</span>
          <h2>Help every technical learner arrive at practical work better prepared.</h2>
          <p>
            We connect clear instruction, active simulation, safety feedback, and instructor review
            in one learning loop.
          </p>
        </article>
        <article>
          <span>02 · Vision</span>
          <h2>
            Make high-quality practical preparation easier to access across technical schools.
          </h2>
          <p>
            We envision local institutions using adaptable virtual labs to strengthen—not
            replace—hands-on teaching.
          </p>
        </article>
      </section>

      <section className="public-section team-section">
        <header className="public-section-heading">
          <div>
            <span className="eyebrow">The work behind the platform</span>
            <h2>A multidisciplinary team, not technology alone.</h2>
          </div>
          <p>
            Safe virtual-lab learning depends on product, technical, teaching, and school expertise
            working together. Named profiles will be added after roles and publication consent are
            confirmed.
          </p>
        </header>
        <div className="team-grid">
          {teamRoles.map((role) => (
            <article key={role.title}>
              <span className="team-avatar" aria-hidden="true">
                {role.initial}
              </span>
              <h3>{role.title}</h3>
              <p>{role.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-cta">
        <div>
          <span className="eyebrow">Work with the project</span>
          <h2>Bring a school, teaching, or technical perspective.</h2>
        </div>
        <div>
          <p>
            We welcome structured conversations about validation, pilots, curriculum, and access.
          </p>
          <Link className="button button-light" to="/contact">
            Contact the OPedu team →
          </Link>
        </div>
      </section>
    </div>
  );
}
