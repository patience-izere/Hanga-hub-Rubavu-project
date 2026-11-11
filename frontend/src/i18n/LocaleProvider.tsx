import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { catalogues, DRAFT_LOCALES, en, LOCALES, type Locale, type MessageKey } from "./messages";

export type MessageValues = Record<string, string | number>;

/** Fills `{name}` placeholders; a placeholder with no value is left visible rather than lost. */
function fill(text: string, values?: MessageValues): string {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

const STORAGE_KEY = "opedu:locale";

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

function storedLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

type LocaleContextValue = {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: MessageKey, values?: MessageValues): string;
  /** Share of the catalogue translated for the active locale, 0–1. */
  coverage: number;
  /** The active catalogue has not yet been reviewed by a native speaker. */
  draft: boolean;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => undefined,
  t: (key, values) => fill(en[key], values),
  coverage: 1,
  draft: false,
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
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // The choice lasts for this page only.
        }
        document.documentElement.lang = next;
        setLocaleState(next);
      },
      // Fall back to English rather than rendering a key: a partial catalogue must degrade to
      // readable text, never to `nav.myLessons`.
      t: (key: MessageKey, values?: MessageValues) => fill(catalogue[key] ?? en[key], values),
      coverage: total === 0 ? 1 : translated / total,
      draft: DRAFT_LOCALES.has(locale),
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
