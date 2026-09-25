import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import resources from "./resources";

export const DEFAULT_LANGUAGE = "en";
export const SUPPORTED_LANGUAGES = Object.keys(resources);
export const LANGUAGE_STORAGE_KEY = "i18nextLng";

/**
 * Reduce a BCP 47 tag ("es-MX", "EN_us") to a supported base language, or
 * null if we don't ship translations for it.
 */
const toSupportedLanguage = (tag: string | null | undefined): string | null => {
  if (!tag) return null;
  const base = tag.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : null;
};

const readStoredLanguage = (): string | null => {
  try {
    return toSupportedLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
    return null;
  }
};

const writeStoredLanguage = (lng: string) => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  } catch {
    // Ignore — the choice just won't survive a reload.
  }
};

/**
 * Resolution order:
 *   1. An explicit choice previously saved via the LanguageSwitcher.
 *   2. The first supported entry in the browser's preferred languages.
 *   3. DEFAULT_LANGUAGE.
 * Unsupported values at any step are skipped rather than passed to i18next,
 * so `i18n.language` always matches a locale we actually have resources for.
 */
const detectLanguage = (): string => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  const stored = readStoredLanguage();
  if (stored) return stored;

  const browserLanguages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const tag of browserLanguages) {
    const supported = toSupportedLanguage(tag);
    if (supported) return supported;
  }

  return DEFAULT_LANGUAGE;
};

const initialized = i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  nonExplicitSupportedLngs: true,
  load: "languageOnly",
  ns: ["translations"],
  defaultNS: "translations",
  interpolation: {
    escapeValue: false,
  },
});

// Persist only explicit changes (i18n.changeLanguage from the switcher), not
// the initial detection, so a visitor who never picks a language keeps
// following their browser setting. init() emits its own languageChanged, so
// the listener is attached only once that has settled.
initialized.then(() => {
  if (typeof window === "undefined") return;
  i18n.on("languageChanged", (lng) => {
    const supported = toSupportedLanguage(lng);
    if (supported) writeStoredLanguage(supported);
  });
});

export default i18n;
