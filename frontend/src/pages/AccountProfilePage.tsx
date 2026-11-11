import { FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ApiError, describeApiError, saveProfile, type User } from "@/api/client";
import { authQueryKey, useCurrentUser } from "@/auth/useAuth";
import { LanguageSelect } from "@/components/ShellControls";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { savePreferredLanguage } from "@/api/client";

/** Your own name, email and language. */
export function AccountProfilePage() {
  const user = useCurrentUser().data;
  if (!user) return null;
  return <ProfileForm user={user} />;
}

function ProfileForm({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const emailChanged = email.trim().toLowerCase() !== (user.email || "").toLowerCase();
  const signInName = user.username !== user.email ? user.username : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    setFieldErrors({});
    try {
      const saved = await saveProfile({
        firstName,
        lastName,
        email,
        currentPassword: emailChanged ? currentPassword : undefined,
      });
      queryClient.setQueryData(authQueryKey, saved);
      setCurrentPassword("");
      setMessage("Your profile was saved.");
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(describeApiError(caught, "Your profile could not be saved. Try again."));
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (name: string) =>
    fieldErrors[name]?.length ? (
      <small className="field-error" id={`${name}-error`}>
        {fieldErrors[name].join(" ")}
      </small>
    ) : null;

  return (
    <section className="account-page">
      <div className="account-card">
        <span className="eyebrow">My profile</span>
        <h1>Your details</h1>
        <p>Your name appears on your practice records and to your instructors.</p>
        <form onSubmit={submit} noValidate={false}>
          <div className="form-row">
            <div>
              <label htmlFor="profile-first-name">First name</label>
              <input
                id="profile-first-name"
                autoComplete="given-name"
                maxLength={150}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined}
              />
              {fieldError("firstName")}
            </div>
            <div>
              <label htmlFor="profile-last-name">Last name</label>
              <input
                id="profile-last-name"
                autoComplete="family-name"
                maxLength={150}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined}
              />
              {fieldError("lastName")}
            </div>
          </div>
          <label htmlFor="profile-email">Email</label>
          <input
            id="profile-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
          />
          {fieldError("email")}
          {emailChanged ? (
            <>
              <label htmlFor="profile-current-password">
                Current password (needed to change your email)
              </label>
              <PasswordInput
                id="profile-current-password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                aria-describedby={fieldErrors.currentPassword ? "currentPassword-error" : undefined}
              />
              {fieldError("currentPassword")}
            </>
          ) : null}
          {signInName ? (
            <p className="field-note">
              You sign in as <strong>{signInName}</strong>. Your instructor or school administrator
              can change it.
            </p>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="form-success" role="status">
              {message}
            </p>
          ) : null}
          <button className="button button-primary" disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </button>
        </form>

        <div className="profile-language">
          <h2>Language</h2>
          <p>The language OPedu uses for menus and buttons, on every device you sign in on.</p>
          <LanguageSelect
            onChange={(next) => {
              void savePreferredLanguage(next)
                .then((saved) => queryClient.setQueryData(authQueryKey, saved))
                .catch(() => undefined);
            }}
          />
        </div>
      </div>
    </section>
  );
}
