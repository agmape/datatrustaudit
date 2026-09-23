/**
 * LocaleSelector — Clean language-only switcher.
 * Only 3 languages: pt-BR, en, es.
 * Currency is always BRL (Kiwify payments).
 */

import { useLocaleContext, SupportedLanguage } from '@/context/LocaleContext';
import { useI18n } from '@/context/I18nContext';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe, Check } from 'lucide-react';
import { useState } from 'react';

const LANGUAGES: { code: SupportedLanguage; label: string; flag: string; short: string }[] = [
    { code: 'pt-BR', label: 'Português', flag: '🇧🇷', short: 'PT' },
    { code: 'en',    label: 'English',    flag: '🇺🇸', short: 'EN' },
    { code: 'es',    label: 'Español',    flag: '🇪🇸', short: 'ES' },
];

interface LocaleSelectorProps {
    compact?: boolean;
}

const LocaleSelector = ({ compact = true }: LocaleSelectorProps) => {
    const { language, setLanguage: setLocaleLanguage } = useLocaleContext();
    const { setLanguage: setI18nLanguage } = useI18n();
    const [open, setOpen] = useState(false);

    const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

    const handleSetLanguage = (lang: SupportedLanguage) => {
        setLocaleLanguage(lang);
        setI18nLanguage(lang as any);
        setOpen(false);
    };

    if (!compact) {
        // Expanded mode for Pricing page
        return (
            <div className="flex items-center gap-3 w-full max-w-xs mx-auto">
                <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div className="relative flex-1">
                    <select
                        value={language}
                        onChange={(e) => handleSetLanguage(e.target.value as SupportedLanguage)}
                        className="w-full appearance-none bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 pr-10 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 cursor-pointer hover:border-white/20 transition-colors"
                    >
                        {LANGUAGES.map(l => (
                            <option key={l.code} value={l.code}>
                                {l.flag}  {l.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        );
    }

    // Compact dropdown for header
    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white/80 hover:text-white text-sm font-medium" aria-label="Language selector">
                    <Globe className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold">{currentLang.short}</span>
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                className="w-44 bg-slate-900/95 border-white/10 backdrop-blur-2xl text-white shadow-2xl p-1.5"
            >
                {LANGUAGES.map(l => (
                    <DropdownMenuItem
                        key={l.code}
                        onClick={() => handleSetLanguage(l.code)}
                        className={`flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-lg transition-colors ${
                            language === l.code ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/5 focus:bg-white/5 text-white/70'
                        }`}
                    >
                        <span className="flex items-center gap-2.5">
                            <span className="text-base leading-none">{l.flag}</span>
                            <span className="text-sm font-medium">{l.label}</span>
                        </span>
                        {language === l.code && <Check className="w-4 h-4" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default LocaleSelector;
