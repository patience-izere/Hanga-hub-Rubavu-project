import { useCallback, useEffect, useState } from "react";

/** "system" follows the device; "light" and "dark" are a person's explicit choice. */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

const STORAGE_KEY = "opedu:theme";

function isPreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function storedThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

const deviceDark = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

/**
 * The stylesheet reads `data-theme` on <html>, which is always "light" or "dark": a person's
 * choice, or the device's setting for "system". public/theme-init.js sets it before the first
 * paint, so a dark-theme reader never sees a light flash.
 */
export function applyThemePreference(preference: ThemePreference) {
  document.documentElement.dataset.theme =
    preference === "system" ? (deviceDark() ? "dark" : "light") : preference;
}

// "Device theme" follows the device if it switches (for example at sunset) while OPedu is open.
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (storedThemePreference() === "system") applyThemePreference("system");
  });
}

const listeners = new Set<(preference: ThemePreference) => void>();

export function useThemePreference() {
  const [preference, setPreferenceState] = useState<ThemePreference>(storedThemePreference);

  useEffect(() => {
    listeners.add(setPreferenceState);
    return () => {
      listeners.delete(setPreferenceState);
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice lasts for this page only.
    }
    applyThemePreference(next);
    listeners.forEach((listener) => listener(next));
  }, []);

  return [preference, setPreference] as const;
}
