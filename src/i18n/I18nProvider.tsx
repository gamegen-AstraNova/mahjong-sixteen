import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Locale } from '../types/game';

type Pack = Record<string, unknown>;

interface I18nValue {
  locale: Locale;
  t(key: string, variables?: Record<string, string | number>): string;
}

const I18nContext = createContext<I18nValue>({ locale: 'en', t: (key) => key });

function lookup(pack: Pack | undefined, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Pack)[part];
  }, pack);
}

export function I18nProvider({ locale, packs, children }: { locale: Locale; packs: Record<Locale, Pack>; children: ReactNode }) {
  const value = useMemo<I18nValue>(() => ({
    locale,
    t(key, variables = {}) {
      const translated = lookup(packs[locale], key) ?? lookup(packs.en, key) ?? key;
      if (typeof translated !== 'string') return key;
      return Object.entries(variables).reduce((result, [name, replacement]) => result.replaceAll(`{${name}}`, String(replacement)), translated);
    },
  }), [locale, packs]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
