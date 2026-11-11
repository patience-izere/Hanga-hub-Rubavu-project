import { useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** What the field holds, for the button's accessible name ("password", "PIN"). */
  noun?: string;
};

/** A password or PIN field with a button that shows what was typed. */
export function PasswordInput({ noun = "password", className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const minimum = props.minLength;
  const length = String(props.value ?? "").length;
  // A new password's rule is shown while typing, not only as the browser's tooltip on submit.
  const showRule = Boolean(minimum) && props.autoComplete === "new-password" && noun !== "PIN";
  const ruleId = props.id ? `${props.id}-rule` : undefined;
  return (
    <>
      <span className="password-field">
        <input
          {...props}
          className={className}
          type={visible ? "text" : "password"}
          aria-describedby={
            [props["aria-describedby"], showRule ? ruleId : undefined].filter(Boolean).join(" ") ||
            undefined
          }
        />
        <button
          type="button"
          className="password-toggle"
          aria-pressed={visible}
          aria-label={visible ? `Hide ${noun}` : `Show ${noun}`}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
      {showRule ? (
        <small
          id={ruleId}
          className={length >= (minimum ?? 0) ? "field-rule is-met" : "field-rule"}
          aria-live="polite"
        >
          {length >= (minimum ?? 0) ? "✓ " : ""}At least {minimum} characters
          {length > 0 && length < (minimum ?? 0) ? ` (${length} so far)` : ""}
        </small>
      ) : null}
    </>
  );
}
