/**
 * Interface message catalogue.
 *
 * Scope: application chrome — navigation, shell controls and shared UI labels. Lesson content,
 * procedure steps and safety notes are NOT translated here; they carry their own authored
 * language on the lesson record (`Lesson.language`), because a scenario's wording is curriculum
 * material that must be authored and reviewed, not machine-mapped.
 *
 * Kinyarwanda entries below cover this chrome only. Any key missing from `rw` falls back to
 * English rather than rendering a key, so a partial catalogue degrades gracefully.
 */

export const LOCALES = ["en", "rw"] as const;
export type Locale = (typeof LOCALES)[number];

export const en = {
  // Public navigation
  about: "About",
  features: "Features",
  updates: "Updates",
  contact: "Contact",
  support: "Support",
  signIn: "Sign in",
  signOut: "Sign out",
  language: "Language",
  security: "Security",
  learning: "My learning",
  instructor: "Instructor dashboard",
  author: "Author content",

  // Workspace navigation sections
  "nav.learning": "Learning",
  "nav.teaching": "Teaching",
  "nav.content": "Content",
  "nav.school": "School",
  "nav.research": "Research",
  "nav.account": "Account",

  // Workspace navigation links
  "nav.myLessons": "My lessons",
  "nav.myProgress": "My progress",
  "nav.overview": "Overview",
  "nav.learners": "Learners",
  "nav.assign": "Assign a lesson",
  "nav.competencies": "Competencies",
  "nav.operations": "Operations",
  "nav.scenarios": "Scenarios",
  "nav.assets": "Asset packages",
  "nav.people": "People",
  "nav.invitations": "Invitations",
  "nav.audit": "Audit log",
  "nav.pilots": "Pilot governance",
  "nav.survey": "Survey",
  "nav.publicSite": "Public site",

  // Shell chrome
  "shell.skipToContent": "Skip to main content",
  "shell.workspaceHome": "OPedu workspace home",
  "shell.signingOut": "Signing out…",
  "shell.workspaceNav": "Workspace navigation",

  // Shared states
  "state.loading": "Loading…",
  "state.error": "This information could not be loaded.",
} as const;

export type MessageKey = keyof typeof en;

/**
 * Kinyarwanda chrome. Deliberately partial: only strings that have been reviewed appear here,
 * and everything else falls back to English.
 */
export const rw: Partial<Record<MessageKey, string>> = {
  about: "Ibyerekeye",
  features: "Ibiranga",
  updates: "Amakuru",
  contact: "Twandikire",
  support: "Ubufasha",
  signIn: "Injira",
  signOut: "Sohoka",
  language: "Ururimi",
  security: "Umutekano",
  learning: "Amasomo yanjye",
  instructor: "Ikibaho cy'umwarimu",
  author: "Tegura amasomo",

  "nav.learning": "Kwiga",
  "nav.teaching": "Kwigisha",
  "nav.content": "Ibikubiyemo",
  "nav.school": "Ishuri",
  "nav.research": "Ubushakashatsi",
  "nav.account": "Konti",

  "nav.myLessons": "Amasomo yanjye",
  "nav.myProgress": "Aho ngeze",
  "nav.overview": "Incamake",
  "nav.learners": "Abanyeshuri",
  "nav.people": "Abantu",
  "nav.survey": "Ubushakashatsi",
  "nav.publicSite": "Urubuga rusange",

  "shell.skipToContent": "Simbukira ku bikubiyemo",
  "shell.signingOut": "Kurasohoka…",
  "state.loading": "Birimo gupakirwa…",
};

export const catalogues: Record<Locale, Partial<Record<MessageKey, string>>> = { en, rw };
