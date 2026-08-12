/** i18next setup with English + Vietnamese resources. */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from '../locales/en.json';
import vi from '../locales/vi.json';

export const LANGUAGES = { en: 'English', vi: 'Tiếng Việt' } as const;
export type AppLanguage = keyof typeof LANGUAGES;
const STORAGE_KEY = 'stuffsearch.language';

/** Device locale → one of our supported languages (default en). */
function detectLanguage(): AppLanguage {
  const locales = getLocales();
  const tag = locales[0]?.languageTag ?? 'en';
  return tag.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

let initialized = false;

export async function initI18n() {
  if (initialized) return;
  let lng: AppLanguage;
  try {
    const saved = (await AsyncStorage.getItem(STORAGE_KEY)) as AppLanguage | null;
    lng = saved ?? detectLanguage();
  } catch {
    lng = detectLanguage();
  }
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, vi: { translation: vi } },
    lng,
    fallbackLng: 'en',
    // Hermes lacks Intl.PluralRules; v3 plural rules are baked into i18next
    // and need no polyfill. Our locale files use no plural keys anyway.
    compatibilityJSON: 'v3',
    interpolation: { escapeValue: false },
  });
  initialized = true;
}

/** Persist a language choice and apply it. */
export async function setLanguage(lng: AppLanguage) {
  await i18n.changeLanguage(lng);
  await AsyncStorage.setItem(STORAGE_KEY, lng);
}

export default i18n;
