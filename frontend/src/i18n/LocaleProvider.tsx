import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { catalogues, en, LOCALES, type Locale, type MessageKey } from "./messages";

const STORAGE_KEY = "opedu:locale";

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

function storedLocale(): Locale | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isLocale(stored) ? stored : null;
}

type LocaleContextValue = {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: MessageKey): string;
  /** Share of the catalogue translated for the active locale, 0–1. */
  coverage: number;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => undefined,
  t: (key) => en[key],
  coverage: 1,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => storedLocale() ?? "en");

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => {
    const catalogue = catalogues[locale];
    const total = Object.keys(en).length;
    const translated = Object.keys(catalogue).length;
    return {
      locale,
      setLocale(next: Locale) {
        localStorage.setItem(STORAGE_KEY, next);
        document.documentElement.lang = next;
        setLocaleState(next);
      },
      // Fall back to English rather than rendering a key: a partial catalogue must degrade to
      // readable text, never to `nav.myLessons`.
      t: (key: MessageKey) => catalogue[key] ?? en[key],
      coverage: total === 0 ? 1 : translated / total,
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Applies the learner's stored language preference once, unless they have already chosen a
 * locale on this device. An explicit choice always wins over the profile default.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useApplyPreferredLocale(preferred: string | undefined) {
  const { setLocale } = useLocale();
  useEffect(() => {
    if (!preferred || storedLocale()) return;
    if (isLocale(preferred)) setLocale(preferred);
  }, [preferred, setLocale]);
}

// The hook intentionally shares the provider's module so both use the same private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useLocale() {
  return useContext(LocaleContext);
}
