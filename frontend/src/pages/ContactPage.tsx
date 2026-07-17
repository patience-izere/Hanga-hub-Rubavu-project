import type { FormEvent } from "react";
import { Link } from "react-router-dom";

export function ContactPage() {
  function createEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const organization = String(form.get("organization") ?? "").trim();
    const topic = String(form.get("topic") ?? "General enquiry");
    const message = String(form.get("message") ?? "").trim();
    const subject = `OPedu enquiry: ${topic}`;
    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      `School or organization: ${organization || "Not provided"}`,
      `Topic: ${topic}`,
      "",
      message,
    ].join("\n");

    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="public-page">
      <section className="public-hero contact-hero">
        <div>
          <span className="eyebrow">Contact</span>
          <h1>Start the right conversation about virtual-lab learning.</h1>
        </div>
        <div className="public-hero-aside">
          <p>
            Whether you represent a school, teach a technical trade, work on curriculum, or want to
            support platform development, a clear brief helps the project respond responsibly.
          </p>
        </div>
      </section>

      <section className="contact-layout">
        <div className="contact-form-intro">
          <span className="eyebrow">Prepare an enquiry</span>
          <h2>Tell us what you want to explore.</h2>
          <p>
            Because a verified OPedu public email address has not yet been documented, this form
            opens your email application with a prepared message. Choose your school coordinator or
            confirmed OPedu contact as the recipient.
          </p>
          <div className="contact-location">
            <span aria-hidden="true">RW</span>
            <div>
              <strong>Project location</strong>
              <p>Rubavu, Western Province, Rwanda</p>
            </div>
          </div>
        </div>

        <form className="contact-form" onSubmit={createEmail}>
          <div className="form-row">
            <label>
              Name
              <input name="name" autoComplete="name" required />
            </label>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
          </div>
          <label>
            School or organization
            <input name="organization" autoComplete="organization" />
          </label>
          <label>
            Enquiry topic
            <select name="topic" defaultValue="School pilot">
              <option>School pilot</option>
              <option>Technical validation</option>
              <option>Curriculum collaboration</option>
              <option>Platform partnership</option>
              <option>General enquiry</option>
            </select>
          </label>
          <label>
            Message
            <textarea
              name="message"
              rows={7}
              required
              placeholder="Share your role, objective, expected participants, and preferred next step."
            />
          </label>
          <button className="button button-primary" type="submit">
            Create email →
          </button>
          <p className="form-privacy">
            Nothing entered here is stored by OPedu. Your email application handles the message.
          </p>
        </form>
      </section>

      <section className="contact-paths" aria-label="Other support paths">
        <article>
          <span>01</span>
          <h2>Account or technical issue?</h2>
          <p>
            Use the support centre for sign-in, lesson-loading, simulation, and workshop-safety
            guidance.
          </p>
          <Link to="/support">Open support →</Link>
        </article>
        <article>
          <span>02</span>
          <h2>Already invited?</h2>
          <p>
            Use the email address provided to your school and enter your role-specific workspace.
          </p>
          <Link to="/login">Sign in →</Link>
        </article>
        <article>
          <span>03</span>
          <h2>Planning school access?</h2>
          <p>
            Review how controlled invitations connect learners and instructors to an institution.
          </p>
          <Link to="/onboarding">View onboarding →</Link>
        </article>
      </section>
    </div>
  );
}
