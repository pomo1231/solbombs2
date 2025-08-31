import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DICTIONARIES, interpolate } from '@/i18n/dictionary';

export type LanguageCode = 'en' | 'es' | 'fr' | 'pt' | 'de';

export const LANG_DISPLAY: Record<LanguageCode, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  de: 'Deutsch',
};

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const STORAGE_KEY = 'solbombs:lang';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('en');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
    if (saved && ['en','es','fr','pt','de'].includes(saved)) {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    // Surface event for other tabs/components if needed
    try { window.dispatchEvent(new CustomEvent('i18n:languageChanged', { detail: { lang } })); } catch {}
  };

  const t = (key: string, vars: Record<string, string> = {}) => {
    const dict = DICTIONARIES[language] || DICTIONARIES.en;
    const base = dict[key] ?? DICTIONARIES.en[key] ?? key;
    return interpolate(base, vars);
  };

  const value = useMemo(() => ({ language, setLanguage, t }), [language]);

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
