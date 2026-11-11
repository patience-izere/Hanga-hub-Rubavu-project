import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { describeApiError } from "../api/client";
import { requestSchoolRegistration, type SchoolRegistrationInput } from "../api/open";

const EMPTY: SchoolRegistrationInput = {
  organisationName: "",
  kind: "school",
  district: "",
  contactName: "",
  email: "",
  phone: "",
  message: "",
};

/** A school, garage or training hub asks to use OPedu. A person reviews every request. */
export function RegisterSchoolPage() {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof SchoolRegistrationInput) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      setDone((await requestSchoolRegistration(form)).detail);
    } catch (failure) {
      setError(describeApiError(failure, "The request could not be sent. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="information-page narrow-page">
        <div className="eyebrow">Request sent</div>
        <h1>Thank you.</h1>
        <p>{done}</p>
        <p>
          When it is approved, {form.email} receives a link to set up the administrator account.
          From there you can create classes, print sign-in slips and invite instructors.
        </p>
        <Link className="button button-primary" to="/demo">
          Try a lesson while you wait
        </Link>
      </section>
    );
  }

  return (
    <section className="auth-layout">
      <div className="auth-message">
        <div className="eyebrow">For schools, garages and training hubs</div>
        <h1>Bring OPedu to your learners.</h1>
        <p>
          Technical schools, garages training apprentices and community hubs can all run classes.
          Learners do not need email: they join with a class code and a PIN.
        </p>
        <ul className="auth-points">
          <li>Classes and sign-in slips you can print</li>
          <li>Each learner&apos;s steps, mistakes and safety errors</li>
          <li>Works offline on shared devices</li>
        </ul>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h2>Tell us about you</h2>
        <label htmlFor="org-name">Name of the school, garage or hub</label>
        <input
          id="org-name"
          value={form.organisationName}
          onChange={(event) => set("organisationName")(event.target.value)}
          required
        />
        <label htmlFor="org-kind">What kind of place is it?</label>
        <select
          id="org-kind"
          value={form.kind}
          onChange={(event) => set("kind")(event.target.value)}
        >
          <option value="school">Technical school or TVET centre</option>
          <option value="workshop">Garage or workshop with apprentices</option>
          <option value="hub">Training or innovation hub</option>
        </select>
        <label htmlFor="org-district">District</label>
        <input
          id="org-district"
          value={form.district}
          onChange={(event) => set("district")(event.target.value)}
        />
        <label htmlFor="org-contact">Your name</label>
        <input
          id="org-contact"
          autoComplete="name"
          value={form.contactName}
          onChange={(event) => set("contactName")(event.target.value)}
          required
        />
        <label htmlFor="org-email">Email</label>
        <input
          id="org-email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) => set("email")(event.target.value)}
          required
        />
        <label htmlFor="org-phone">Phone (optional)</label>
        <input
          id="org-phone"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(event) => set("phone")(event.target.value)}
        />
        <label htmlFor="org-message">Anything we should know? (optional)</label>
        <textarea
          id="org-message"
          rows={3}
          value={form.message}
          onChange={(event) => set("message")(event.target.value)}
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button button-primary button-full" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </button>
      </form>
    </section>
  );
}
