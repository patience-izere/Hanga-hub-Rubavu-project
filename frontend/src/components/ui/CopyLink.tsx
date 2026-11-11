import { useState } from "react";

/** A link someone must pass on by hand, with a button that copies it. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <p className="invitation-link">
      <code>{url}</code>
      <button
        type="button"
        className="button-link"
        onClick={() => {
          void navigator.clipboard
            .writeText(url)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </p>
  );
}
