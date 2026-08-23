import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Locale = "en" | "rw";
type MessageKey =
  | "about"
  | "features"
  | "updates"
  | "contact"
  | "learning"
  | "instructor"
  | "security"
  | "author"
  | "signIn"
  | "signOut"
  | "language";

const messages: Record<Locale, Record<MessageKey, string>> = {
  en: {
    about: "About",
    features: "Features",
    updates: "Updates",
    contact: "Contact",
    learning: "My learning",
    instructor: "Instructor dashboard",
    security: "Security",
    author: "Author content",
    signIn: "Sign in",
    signOut: "Sign out",
    language: "Language",
  },
  rw: {
    about: "Ibyerekeye",
    features: "Ibiranga",
    updates: "Amakuru",
    contact: "Twandikire",
    learning: "Amasomo yanjye",
    instructor: "Ikibaho cy'umwarimu",
    security: "Umutekano",
    author: "Tegura amasomo",
    signIn: "Injira",
    signOut: "Sohoka",
    language: "Ururimi",
  },
};

const LocaleContext = createContext<{
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: MessageKey): string;
}>({ locale: "en", setLocale: () => undefined, t: (key) => messages.en[key] });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    localStorage.getItem("opedu:locale") === "rw" ? "rw" : "en",
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(
    () => ({
      locale,
      setLocale(next: Locale) {
        localStorage.setItem("opedu:locale", next);
        document.documentElement.lang = next;
        setLocaleState(next);
      },
      t: (key: MessageKey) => messages[locale][key],
    }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

// The hook intentionally shares the provider's module so both use the same private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useLocale() {
  return useContext(LocaleContext);
}
