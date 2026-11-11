import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { apiFetch, describeApiError, ensureCsrf } from "@/api/client";
import { CONTACT } from "@/config/site";

const TOPICS = [
  { value: "school_pilot", label: "School pilot" },
  { value: "technical_validation", label: "Technical validation" },
  { value: "curriculum", label: "Curriculum collaboration" },
  { value: "partnership", label: "Platform partnership" },
  { value: "general", label: "General enquiry" },
];

export function ContactPage() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSending(true);
    setError("");
    try {
      await ensureCsrf();
      const response = await apiFetch<{ detail: string }>("/api/v1/contact/", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          email: String(form.get("email") ?? "").trim(),
          organisation: String(form.get("organization") ?? "").trim(),
          topic: String(form.get("topic") ?? "general"),
          message: String(form.get("message") ?? "").trim(),
        }),
      });
      formElement.reset();
      setSent(response.detail);
    } catch (caught) {
      setError(describeApiError(caught, "Your message could not be sent. Try again."));
    } finally {
      setSending(false);
    }
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
          <span className="eyebrow">Send an enquiry</span>
          <h2>Tell us what you want to explore.</h2>
          <p>
            Your message goes straight to the OPedu team, who reply to the email address you give.
            For help with an account or a lesson, the support centre is faster.
          </p>
          <div className="contact-location">
            <span aria-hidden="true">RW</span>
            <div>
              <strong>Reach us directly</strong>
              <p>
                <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
                <br />
                <a href={CONTACT.phoneHref}>Tel. {CONTACT.phoneDisplay}</a>
                <br />
                <a href={CONTACT.whatsappHref} target="_blank" rel="noopener noreferrer">
                  WhatsApp {CONTACT.whatsappDisplay}
                </a>
                <br />
                {CONTACT.address}
              </p>
            </div>
          </div>
        </div>

        <form className="contact-form" onSubmit={(event) => void send(event)}>
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
            <select name="topic" defaultValue="school_pilot">
              {TOPICS.map((topic) => (
                <option key={topic.value} value={topic.value}>
                  {topic.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Message
            <textarea
              name="message"
              rows={7}
              required
              maxLength={5000}
              placeholder="Share your role, objective, expected participants, and preferred next step."
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {sent ? (
            <p className="form-success" role="status">
              {sent}
            </p>
          ) : null}
          <button className="button button-primary" type="submit" disabled={sending}>
            {sending ? "Sending…" : "Send message →"}
          </button>
          <p className="form-privacy">
            OPedu keeps your message so the team can answer it, and uses your details for nothing
            else. See the <Link to="/privacy">privacy notice</Link>.
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
