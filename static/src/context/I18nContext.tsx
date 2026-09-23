import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import pt from '../translations/pt.json';
import en from '../translations/en.json';
import es from '../translations/es.json';

// ── Only 3 languages supported: pt-BR, en, es ──
type Language = 'pt-BR' | 'en' | 'es';

interface I18nContextType {
    language: Language;
    t: (key: string) => string;
    setLanguage: (lang: Language) => void;
}

const translations: Record<Language, any> = { 
    'pt-BR': pt, en, es
};

const VALID_LANGS: Language[] = ['pt-BR', 'en', 'es'];

/**
 * Flat fallback map for keys that might be missing from translation files.
 * Prevents raw key strings from ever reaching the UI.
 */
const FALLBACK_PT: Record<string, string> = {
    'home.audit_button': 'Escanear',
    'home.audit_btn': 'Escanear',
    'home.scan_website': 'Escanear site',
    'home.create_account_to_scan': 'Criar conta para escanear',
    'home.analyzing': 'Analisando...',
    'home.audit_description': 'Detecte violações de privacidade e riscos LGPD automaticamente.',
    'home.deep_scan': 'Deep Scan',
    'nav.login': 'Entrar',
    'nav.signup': 'Cadastrar',
    'nav.pricing': 'Planos',
    'nav.change_plan': 'Mudar plano',
    'buttons.copy': 'Copiar',
    'buttons.export_pdf': 'PDF',
    'buttons.export_excel': 'Excel',
    'buttons.export_json': 'JSON',
    'buttons.pay_now': 'Pagar agora',
    'buttons.fix_with_ai': 'Corrigir com IA',
    'features.locked': 'Bloqueado',
    'features.premium_badge': 'PRO',
    'features.upgrade_to_unlock': 'Faça upgrade para desbloquear',
    'plans.most_popular': 'Mais Popular',
    'plans.best_value': 'Melhor Custo-Benefício',
    'plans.change_plan': 'Mudar plano',
    'subscription.active': 'Ativo',
    'subscription.pending': 'Pendente',
    'errors.blocked_403': 'O site bloqueia análises automáticas. Use a aba Upload ou View-Source.',
    'theme.dark': 'Escuro',
    'theme.light': 'Claro',
    'theme.executive': 'Executivo',
    'theme.label': 'Tema',
};

const FALLBACK_EN: Record<string, string> = {
    'home.audit_button': 'Scan',
    'home.audit_btn': 'Scan',
    'home.scan_website': 'Scan website',
    'home.create_account_to_scan': 'Create account to scan',
    'home.analyzing': 'Analyzing...',
    'home.audit_description': 'Automatically detect privacy violations and LGPD/GDPR compliance risks.',
    'home.deep_scan': 'Deep Scan',
    'nav.login': 'Login',
    'nav.signup': 'Sign Up',
    'nav.pricing': 'Pricing',
    'nav.change_plan': 'Change plan',
    'buttons.copy': 'Copy',
    'buttons.export_pdf': 'PDF',
    'buttons.export_excel': 'Excel',
    'buttons.export_json': 'JSON',
    'buttons.pay_now': 'Pay now',
    'buttons.fix_with_ai': 'Fix with AI',
    'features.locked': 'Locked',
    'features.premium_badge': 'PRO',
    'features.upgrade_to_unlock': 'Upgrade to unlock',
    'plans.most_popular': 'Most Popular',
    'plans.best_value': 'Best Value',
    'plans.change_plan': 'Change plan',
    'subscription.active': 'Active',
    'subscription.pending': 'Pending',
    'errors.blocked_403': 'This site blocks automated analysis. Use the Upload or View-Source tab.',
    'theme.dark': 'Dark',
    'theme.light': 'Light',
    'theme.executive': 'Executive',
    'theme.label': 'Theme',
};

const FALLBACK_ES: Record<string, string> = {
    'theme.dark': 'Oscuro',
    'theme.light': 'Claro',
    'theme.executive': 'Ejecutivo',
    'theme.label': 'Tema',
};

const FALLBACKS: Record<string, Record<string, string>> = { 'pt-BR': FALLBACK_PT, en: FALLBACK_EN, es: FALLBACK_ES };

const I18nContext = createContext<I18nContextType | null>(null);

export const I18nProvider = ({ children }: { children: ReactNode }) => {
    const [language, setLanguageState] = useState<Language>(() => {
        const savedValue = localStorage.getItem('gtm-audit-lang');
        const saved = savedValue === 'pt' ? 'pt-BR' : savedValue;
        if (saved && VALID_LANGS.includes(saved as Language)) return saved as Language;
        const browserLang = navigator.language.toLowerCase();
        if (browserLang.startsWith('pt')) return 'pt-BR';
        if (browserLang.startsWith('es')) return 'es';
        return 'en';
    });

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('gtm-audit-lang', lang);
        localStorage.setItem('gtm-locale-language', lang); // sync with LocaleContext
    };

    // Listen for language changes from other contexts
    useEffect(() => {
        const handleSync = () => {
            const savedValue = localStorage.getItem('gtm-audit-lang');
            const saved = savedValue === 'pt' ? 'pt-BR' : savedValue;
            if (saved && saved !== language && VALID_LANGS.includes(saved as Language)) {
                setLanguageState(saved as Language);
            }
        };

        window.addEventListener('gtm-language-changed', handleSync);
        return () => window.removeEventListener('gtm-language-changed', handleSync);
    }, [language]);

    useEffect(() => {
        localStorage.setItem('gtm-audit-lang', language);
        document.documentElement.lang = language;
    }, [language]);

    const t = (keyPath: string): string => {
        // Walk the nested object
        const keys = keyPath.split('.');
        let current: unknown = translations[language];
        
        // If the translation for current language is empty, fallback to English
        if (!current || Object.keys(current).length === 0) {
            current = translations['en'];
        }

        for (const key of keys) {
            if (current === null || typeof current !== 'object') { current = undefined; break; }
            current = (current as Record<string, unknown>)[key];
        }
        
        if (typeof current === 'string') return current;

        // Try fallback map for this language (if available)
        const fb = FALLBACKS[language]?.[keyPath] || FALLBACKS['en']?.[keyPath];
        if (fb) return fb;

        // Try English translation as second resort
        if (language !== 'en') {
            let enCurrent: unknown = translations['en'];
            for (const key of keys) {
                if (enCurrent === null || typeof enCurrent !== 'object') { enCurrent = undefined; break; }
                enCurrent = (enCurrent as Record<string, unknown>)[key];
            }
            if (typeof enCurrent === 'string') return enCurrent;
        }

        // Last resort: humanize the last segment of the key
        const lastKey = keys[keys.length - 1];
        const humanized = lastKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (import.meta.env.DEV) {
            console.warn(`[i18n] Missing key: "${keyPath}" — showing: "${humanized}"`);
        }
        return humanized;
    };

    return (
        <I18nContext.Provider value={{ language, t, setLanguage }}>
            {children}
        </I18nContext.Provider>
    );
};

export const useI18n = () => {
    const context = useContext(I18nContext);
    if (!context) throw new Error('useI18n must be used within I18nProvider');
    return context;
};

export type { Language };
