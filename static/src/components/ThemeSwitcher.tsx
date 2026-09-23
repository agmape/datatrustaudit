/**
 * ThemeSwitcher — Compact theme toggle for the header.
 * Cycles between dark / light / executive themes.
 */

import { useTheme, ThemeMode } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Moon, Sun, Briefcase, Check } from 'lucide-react';
import { useState } from 'react';

const THEMES: { id: ThemeMode; icon: typeof Moon; labelKey: string }[] = [
    { id: 'dark',      icon: Moon,      labelKey: 'theme.dark' },
    { id: 'light',     icon: Sun,       labelKey: 'theme.light' },
    { id: 'executive', icon: Briefcase, labelKey: 'theme.executive' },
];

const ThemeSwitcher = () => {
    const { theme, setTheme } = useTheme();
    const { t } = useI18n();
    const [open, setOpen] = useState(false);

    const currentTheme = THEMES.find(th => th.id === theme) || THEMES[0];
    const Icon = currentTheme.icon;

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white/70 hover:text-white"
                    aria-label={t('theme.label')}
                >
                    <Icon className="w-4 h-4" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                className="w-40 bg-slate-900/95 border-white/10 backdrop-blur-2xl text-white shadow-2xl p-1.5"
            >
                {THEMES.map(th => {
                    const ThIcon = th.icon;
                    return (
                        <DropdownMenuItem
                            key={th.id}
                            onClick={() => { setTheme(th.id); setOpen(false); }}
                            className={`flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-lg transition-colors ${
                                theme === th.id
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'hover:bg-white/5 focus:bg-white/5 text-white/70'
                            }`}
                        >
                            <span className="flex items-center gap-2.5">
                                <ThIcon className="w-4 h-4" />
                                <span className="text-sm font-medium">{t(th.labelKey)}</span>
                            </span>
                            {theme === th.id && <Check className="w-4 h-4" />}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default ThemeSwitcher;
