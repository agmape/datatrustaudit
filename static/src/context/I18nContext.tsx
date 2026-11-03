/**
 * Single source of truth for the interface language.
 *  - default: pt-BR; the user's saved choice (localStorage) always wins;
 *  - dictionaries: src/i18n/{pt-BR,en,es}.json (same keys, checked by tests/test_i18n_parity.py);
 *  - a missing key never shows English silently: it falls back to pt-BR and is reported in dev.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import pt from '@/i18n/pt-BR.json';
import en from '@/i18n/en.json';
import es from '@/i18n/es.json';

export type Language = 'pt-BR' | 'en' | 'es';
export type Dict = typeof pt;
const DICTS: Record<Language, Dict> = { 'pt-BR': pt, en: en as unknown as Dict, es: es as unknown as Dict };
export const LANGUAGES: Language[] = ['pt-BR', 'en', 'es'];
const STORAGE_KEY = 'dt-lang';
export const DISPLAY_TZ = 'America/Sao_Paulo';

const lookup = (dict: unknown, path: string): unknown => {
  let cur: any = dict;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
};
const fill = (s: string, params?: Record<string, string | number>) =>
  params ? s.replace(/\{(\w+)\}/g, (_m, k) => (k in params ? String(params[k]) : `{${k}}`)) : s;

export const missingKeys = new Set<string>();

interface Ctx {
  language: Language;
  setLanguage: (l: Language) => void;
  t: (path: string, params?: Record<string, string | number>) => string;
  s: Dict;
  formatDate: (iso?: string | null) => string;
  /** Date only (no time), in America/Sao_Paulo — e.g. "31/10/2026" in pt-BR. */
  formatDay: (iso?: string | null) => string;
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
}
const I18nContext = createContext<Ctx | null>(null);

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && (LANGUAGES as string[]).includes(saved) ? (saved as Language) : 'pt-BR';
  });
  const setLanguage = useCallback((l: Language) => { setLang(l); localStorage.setItem(STORAGE_KEY, l); }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const value = useMemo<Ctx>(() => {
    const t = (path: string, params?: Record<string, string | number>) => {
      const v = lookup(DICTS[language], path);
      if (typeof v === 'string') return fill(v, params);
      const fb = lookup(DICTS['pt-BR'], path);
      if (typeof fb === 'string') {
        missingKeys.add(`${language}:${path}`);
        if (import.meta.env.DEV) console.warn(`[i18n] missing "${path}" in ${language}; using pt-BR`);
        return fill(fb, params);
      }
      missingKeys.add(`*:${path}`);
      if (import.meta.env.DEV) console.warn(`[i18n] unknown key "${path}"`);
      return path.split('.').pop() || path;
    };
    const intl = language === 'pt-BR' ? 'pt-BR' : language === 'es' ? 'es' : 'en-US';
    return {
      language, setLanguage, t, s: DICTS[language],
      formatDate: (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(intl, { dateStyle: 'short', timeStyle: 'medium', timeZone: DISPLAY_TZ }).format(d);
      },
      formatDay: (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(intl, { dateStyle: 'short', timeZone: DISPLAY_TZ }).format(d);
      },
      formatNumber: (n, opts) => new Intl.NumberFormat(intl, opts).format(n),
    };
  }, [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): Ctx => {
  const c = useContext(I18nContext);
  if (!c) throw new Error('useI18n must be used inside I18nProvider');
  return c;
};
