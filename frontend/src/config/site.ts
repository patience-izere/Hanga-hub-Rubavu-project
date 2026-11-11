/**
 * Public contact details and social profiles, in one place.
 *
 * A social profile with an empty address is shown as "coming soon" rather than as a broken link;
 * paste the profile's address here when the account exists.
 */
export const CONTACT = {
  email: "izere02pacy@gmail.com",
  phoneDisplay: "+250 789 405 950",
  phoneHref: "tel:+250789405950",
  whatsappDisplay: "+250 789 405 950",
  whatsappHref: "https://wa.me/250789405950",
  address: "Kigali, Rwanda",
} as const;

export type SocialNetwork = "linkedin" | "x" | "facebook" | "instagram" | "youtube";

export const SOCIAL_PROFILES: Array<{ network: SocialNetwork; label: string; url: string }> = [
  { network: "linkedin", label: "LinkedIn", url: "" },
  { network: "x", label: "X", url: "" },
  { network: "facebook", label: "Facebook", url: "" },
  { network: "instagram", label: "Instagram", url: "" },
  { network: "youtube", label: "YouTube", url: "" },
];
