import { useId } from "react";

import { CONTENT_STATUS_LABELS, type ContentStatus } from "./authoringLabels";

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  return (
    <span className={`studio-status studio-status-${status}`}>{CONTENT_STATUS_LABELS[status]}</span>
  );
}

type ListEditorProps = {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  addLabel: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
};

/**
 * An ordered list of short texts (objectives, safety notes, hints) edited one line at a time,
 * so authors never have to type JSON or remember a separator.
 */
export function ListEditor({
  label,
  hint,
  items,
  onChange,
  addLabel,
  placeholder,
  disabled = false,
  error,
}: ListEditorProps) {
  const id = useId();
  return (
    <fieldset className="studio-list-editor" aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend>{label}</legend>
      {hint ? (
        <p className="field-note" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {items.length ? (
        <ol>
          {items.map((item, index) => (
            <li key={index}>
              <input
                aria-label={`${label} ${index + 1}`}
                value={item}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(event) =>
                  onChange(items.map((value, i) => (i === index ? event.target.value : value)))
                }
              />
              {!disabled ? (
                <button
                  type="button"
                  className="studio-icon-button"
                  disabled={disabled}
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                  aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {!disabled ? (
        <button
          type="button"
          className="button button-secondary studio-small-button"
          onClick={() => onChange([...items, ""])}
        >
          {addLabel}
        </button>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
