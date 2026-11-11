import { useLocale } from "../i18n/LocaleProvider";
import { LOCALE_NAMES, LOCALES, type Locale } from "../i18n/messages";
import { THEME_PREFERENCES, useThemePreference, type ThemePreference } from "../theme/theme";

const THEME_LABELS: Record<ThemePreference, "theme.system" | "theme.light" | "theme.dark"> = {
  system: "theme.system",
  light: "theme.light",
  dark: "theme.dark",
};

/** Language picker that names each language, rather than showing bare codes. */
export function LanguageSelect({ onChange }: { onChange?: (locale: Locale) => void }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <label className="locale-select">
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={(event) => {
          const next = event.target.value as Locale;
          setLocale(next);
          onChange?.(next);
        }}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** System / Light / Dark, remembered on this device. */
export function ThemeSelect() {
  const { t } = useLocale();
  const [preference, setPreference] = useThemePreference();
  return (
    <label className="theme-select">
      <span className="sr-only">{t("theme.label")}</span>
      <span className="theme-select-icon" aria-hidden="true">
        {preference === "dark" ? "☾" : preference === "light" ? "☀" : "◐"}
      </span>
      <select
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
      >
        {THEME_PREFERENCES.map((option) => (
          <option key={option} value={option}>
            {t(THEME_LABELS[option])}
          </option>
        ))}
      </select>
    </label>
  );
}
