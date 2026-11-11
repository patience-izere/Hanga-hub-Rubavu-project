import { SOCIAL_PROFILES, type SocialNetwork } from "../config/site";

/** Simple glyphs drawn in the current text colour, so they follow both themes. */
export function SocialGlyph({ network }: { network: SocialNetwork | "whatsapp" }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    focusable: false,
  } as const;
  switch (network) {
    case "linkedin":
      return (
        <svg {...common}>
          <rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor" />
          <rect x="6" y="10" width="2.6" height="8" fill="var(--icon-cut)" />
          <circle cx="7.3" cy="7" r="1.5" fill="var(--icon-cut)" />
          <path
            d="M11 10h2.5v1.2c.5-.8 1.4-1.4 2.7-1.4 2 0 2.8 1.3 2.8 3.4V18h-2.6v-4.2c0-1-.3-1.7-1.2-1.7-1 0-1.6.7-1.6 1.8V18H11z"
            fill="var(--icon-cut)"
          />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path
            d="M4 3h4.6l4.1 5.6L17.5 3H20l-6.1 7.1L21 21h-4.6l-4.5-6.1L6.6 21H4l6.7-7.7z"
            fill="currentColor"
          />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path
            d="M13.3 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.3-1.3 1.4-1.3H16V5.9c-.3 0-1.1-.1-2-.1-2 0-3.3 1.2-3.3 3.4v2.1H8.4V14h2.3v7z"
            fill="var(--icon-cut)"
          />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common}>
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="17.3" cy="6.7" r="1.2" fill="currentColor" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor" />
          <path d="M10 9v6l5-3z" fill="var(--icon-cut)" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...common}>
          <path
            d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M8.6 7.6c.2-.4.5-.4.8-.4h.6c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.6l-.5.6c-.1.2-.2.3 0 .6.5.9 1.2 1.6 2.1 2.1.3.2.4.1.6 0l.6-.7c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.2.4.4 0 .5-.2 1.2-.7 1.5-.5.4-1.4.6-2.6.1a9.4 9.4 0 0 1-4.7-4.4c-.6-1.2-.6-2.1-.3-2.7z"
            fill="currentColor"
          />
        </svg>
      );
  }
}

/** The social profiles row. Profiles without an address yet show as "coming soon". */
export function SocialLinks() {
  return (
    <ul className="social-links" aria-label="OPedu on social media">
      {SOCIAL_PROFILES.map((profile) => (
        <li key={profile.network}>
          {profile.url ? (
            <a
              href={profile.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`OPedu on ${profile.label}`}
            >
              <SocialGlyph network={profile.network} />
            </a>
          ) : (
            <span
              className="social-soon"
              role="img"
              aria-label={`${profile.label}: coming soon`}
              title={`${profile.label}: coming soon`}
            >
              <SocialGlyph network={profile.network} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
