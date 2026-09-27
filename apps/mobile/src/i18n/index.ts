import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { LOCALES, type Locale } from '@pepperedapron/core';
import fr from './fr';
import en from './en';
import es from './es';
import de from './de';
import it from './it';

export const resources = {
  fr: { translation: fr },
  en: { translation: en },
  es: { translation: es },
  de: { translation: de },
  it: { translation: it },
};

export const LANGUAGE_NAMES: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
};

export function deviceLocale(): Locale {
  for (const l of getLocales()) {
    const code = l.languageCode?.toLowerCase();
    if (code && (LOCALES as readonly string[]).includes(code)) return code as Locale;
  }
  return 'en';
}

export function resolveLocale(pref: Locale | null | undefined): Locale {
  return pref ?? deviceLocale();
}

void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

export function setLanguage(l: Locale) {
  if (i18n.language !== l) void i18n.changeLanguage(l);
}

export default i18n;
