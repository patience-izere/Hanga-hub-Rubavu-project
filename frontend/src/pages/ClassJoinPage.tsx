import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { describeApiError, type User } from "../api/client";
import { joinClass, previewClass } from "../api/open";
import { authQueryKey } from "../auth/useAuth";
import { useLocale } from "../i18n/LocaleProvider";
import { PasswordInput } from "@/components/ui/PasswordInput";

/**
 * Joining a class with the code an instructor shows on the board.
 *
 * No email address is needed: the learner chooses a six-digit PIN and gets a sign-in name, or
 * uses their phone number as the sign-in name.
 */
export function ClassJoinPage({ user }: { user: User | null }) {
  const params = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLocale();
  const [code, setCode] = useState(params.code ?? "");
  const activeCode = (params.code ?? "").toUpperCase();
  const preview = useQuery({
    queryKey: ["open", "class", activeCode],
    queryFn: () => previewClass(activeCode),
    enabled: activeCode.length > 0,
    retry: false,
  });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<{ signInName: string } | null>(null);

  if (user && !joined) {
    return (
      <section className="information-page narrow-page">
        <h1>You are already signed in.</h1>
        <p>
          To join a class as a different person, sign out first. To keep this account, ask your
          instructor to add you to the class.
        </p>
        <Link className="button button-primary" to="/dashboard">
          Go to my learning
        </Link>
      </section>
    );
  }

  if (!activeCode) {
    return (
      <section className="auth-layout">
        <div className="auth-message">
          <div className="eyebrow">{t("join.eyebrow")}</div>
          <h1>{t("join.enterCode")}</h1>
          <p>{t("join.codeHelp")}</p>
        </div>
        <form
          className="auth-card"
          onSubmit={(event) => {
            event.preventDefault();
            const cleaned = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
            if (cleaned) navigate(`/class/${cleaned}`);
          }}
        >
          <h2>{t("join.codeHeading")}</h2>
          <label htmlFor="class-code">{t("join.code")}</label>
          <input
            id="class-code"
            className="code-input"
            autoComplete="off"
            autoCapitalize="characters"
            inputMode="text"
            maxLength={12}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
          <button className="button button-primary button-full">{t("join.continue")}</button>
          <Link className="forgot-link" to="/login">
            {t("join.alreadyJoined")}
          </Link>
        </form>
      </section>
    );
  }

  if (joined) {
    return (
      <section className="information-page narrow-page join-done">
        <div className="eyebrow">{t("join.youAreIn")}</div>
        <h1>{t("join.welcome", { name: preview.data?.className ?? "" })}</h1>
        <div className="slip">
          <span>{t("join.yourName")}</span>
          <strong>{joined.signInName}</strong>
          <span>{t("join.yourPin")}</span>
          <strong>{t("join.pinChosen")}</strong>
        </div>
        <p>{t("join.writeDown")}</p>
        <Link className="button button-primary" to="/learn">
          {t("join.goLessons")}
        </Link>
      </section>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (pin !== pinAgain) {
      setError(t("join.pinMismatch"));
      return;
    }
    setBusy(true);
    try {
      const result = await joinClass(activeCode, {
        firstName,
        lastName,
        pin,
        phone: phone.trim() || undefined,
      });
      setJoined({ signInName: result.signInName });
      queryClient.setQueryData(authQueryKey, result.user);
    } catch (failure) {
      setError(describeApiError(failure, "You could not join the class. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-message">
        <div className="eyebrow">{t("join.eyebrow")}</div>
        {preview.isPending ? (
          <h1>{t("join.checking")}</h1>
        ) : preview.isError ? (
          <>
            <h1>{t("join.badCode")}</h1>
            <p>{describeApiError(preview.error, "Check the code with your instructor.")}</p>
            <Link className="button button-light" to="/class">
              {t("join.tryAnother")}
            </Link>
          </>
        ) : (
          <>
            <h1>{preview.data?.className}</h1>
            <p>{preview.data?.schoolName}</p>
          </>
        )}
      </div>
      {preview.data ? (
        <form className="auth-card" onSubmit={submit}>
          <h2>{t("join.aboutYou")}</h2>
          <label htmlFor="first-name">{t("join.firstName")}</label>
          <input
            id="first-name"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
          />
          <label htmlFor="last-name">{t("join.familyName")}</label>
          <input
            id="last-name"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            required
          />
          <label htmlFor="phone">
            {t("join.phone")} <small>{t("join.phoneOptional")}</small>
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <label htmlFor="pin">{t("join.choosePin")}</label>
          <PasswordInput
            noun="PIN"
            id="pin"
            className="pin-input"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="new-password"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
            required
          />
          <label htmlFor="pin-again">{t("join.pinAgain")}</label>
          <PasswordInput
            noun="PIN"
            id="pin-again"
            className="pin-input"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="new-password"
            value={pinAgain}
            onChange={(event) => setPinAgain(event.target.value.replace(/\D/g, ""))}
            required
          />
          <small className="field-note">{t("join.pinAdvice")}</small>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button button-primary button-full" disabled={busy}>
            {busy ? t("join.joining") : t("join.submit")}
          </button>
        </form>
      ) : null}
    </section>
  );
}
