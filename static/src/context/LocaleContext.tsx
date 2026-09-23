/**
 * LocaleContext — simplified locale system.
 * 
 * Only supports 3 languages (pt-BR, en, es) and BRL currency.
 * All pricing is in BRL since payment is via Kiwify (Brazil).
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SupportedCurrency = 'BRL';
export type SupportedLanguage = 'pt-BR' | 'en' | 'es';
export type RegionCode = 'BR';

export interface LocaleInfo {
    currencyCode: SupportedCurrency;
    locale: string;
    region: RegionCode;
    language: SupportedLanguage;
}

interface LocaleContextValue {
    locale: LocaleInfo;
    currency: SupportedCurrency;
    language: SupportedLanguage;
    setCurrency: (c: SupportedCurrency) => void;
    setLanguage: (l: SupportedLanguage) => void;
    formatPrice: (brlPrice: number) => string;
    isManualOverride: boolean;
    resetToAuto: () => void;
}

const VALID_LANGS: SupportedLanguage[] = ['pt-BR', 'en', 'es'];

// ── Context ───────────────────────────────────────────────────────────────────

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_LANGUAGE = 'gtm-locale-language';

export const LocaleProvider = ({ children }: { children: ReactNode }) => {
    const [language, setLanguageState] = useState<SupportedLanguage>(() => {
        const savedValue = localStorage.getItem(STORAGE_LANGUAGE);
        const saved = (savedValue === 'pt' ? 'pt-BR' : savedValue) as SupportedLanguage | null;
        if (saved && VALID_LANGS.includes(saved)) return saved;
        const browserLang = navigator.language.toLowerCase();
        if (browserLang.startsWith('pt')) return 'pt-BR';
        if (browserLang.startsWith('es')) return 'es';
        return 'en';
    });

    const currency: SupportedCurrency = 'BRL';

    const setLanguage = useCallback((l: SupportedLanguage) => {
        setLanguageState(l);
        localStorage.setItem(STORAGE_LANGUAGE, l);
        localStorage.setItem('gtm-audit-lang', l);
        window.dispatchEvent(new Event('gtm-language-changed'));
    }, []);

    const setCurrency = useCallback((_c: SupportedCurrency) => {
        // Currency is always BRL — no-op for backward compatibility
    }, []);

    const resetToAuto = useCallback(() => {
        const browserLang = navigator.language.toLowerCase();
        const autoLang: SupportedLanguage = browserLang.startsWith('pt') ? 'pt-BR' 
            : browserLang.startsWith('es') ? 'es' : 'en';
        setLanguageState(autoLang);
        localStorage.setItem(STORAGE_LANGUAGE, autoLang);
        localStorage.setItem('gtm-audit-lang', autoLang);
        window.dispatchEvent(new Event('gtm-language-changed'));
    }, []);

    const locale: LocaleInfo = {
        currencyCode: 'BRL',
        locale: 'pt-BR',
        region: 'BR',
        language,
    };

    const formatPrice = useCallback((brlPrice: number): string => {
        if (brlPrice === 0) {
            const labels: Record<string, string> = {
                'pt-BR': 'Grátis', en: 'Free', es: 'Gratis'
            };
            return labels[language] || labels['pt-BR'];
        }
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(brlPrice);
    }, [language]);

    return (
        <LocaleContext.Provider value={{
            locale,
            currency,
            language,
            setCurrency,
            setLanguage,
            formatPrice,
            isManualOverride: false,
            resetToAuto,
        }}>
            {children}
        </LocaleContext.Provider>
    );
};

export const useLocaleContext = () => {
    const ctx = useContext(LocaleContext);
    if (!ctx) throw new Error('useLocaleContext must be used within LocaleProvider');
    return ctx;
};

// ── Legacy compatibility ────────────────────────────────────────────────────

export interface LocaleInfoLegacy {
    currencyCode: string;
    currencySymbol: string;
    locale: string;
    region: RegionCode;
    language: SupportedLanguage;
}

export const CURRENCY_SYMBOL: Record<SupportedCurrency, string> = {
    BRL: 'R$',
};

/** @deprecated Use useLocaleContext() instead. Kept for backward compatibility. */
export function useLocale(): LocaleInfoLegacy & { currencyCode: SupportedCurrency } {
    const ctx = useContext(LocaleContext);
    if (ctx) {
        return {
            currencyCode: 'BRL',
            currencySymbol: 'R$',
            locale: 'pt-BR',
            region: 'BR',
            language: ctx.language,
        };
    }
    return {
        currencyCode: 'BRL',
        currencySymbol: 'R$',
        locale: 'pt-BR',
        region: 'BR',
        language: 'pt-BR',
    };
}

// Legacy exports for backward compatibility
export const CONVERSION_RATES: Record<string, number> = { BRL: 1 };
export const BR_PRICE_OVERRIDES: Record<number, number> = {};
