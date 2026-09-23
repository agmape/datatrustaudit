import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    HelpCircle,
    ExternalLink,
} from 'lucide-react';
import LocaleSelector from './LocaleSelector';
import ThemeSwitcher from './ThemeSwitcher';
import logoIcon from '@/assets/logo/datatrust-logo-icon.png';


import { useI18n } from '@/context/I18nContext';
import { Link } from 'react-router-dom';

const AppHeader = () => {
    const { t } = useI18n();

    return (
        <header className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/95 backdrop-blur-xl">
            <div className="container mx-auto px-4">
                <div className="flex h-16 items-center justify-between">
                    {/* Logo & Brand — DataTrust Audit */}
                    <Link to="/" className="flex items-center group shrink-0">
                        <div className="bg-white rounded-md px-3 py-1.5 flex items-center justify-center shadow-sm group-hover:opacity-90 transition-opacity duration-200">
                            <img
                                src={logoIcon}
                                alt="DataTrust Audit"
                                className="h-9 w-auto object-contain"
                                draggable={false}
                            />
                        </div>
                    </Link>

                    {/* Right Actions */}
                    <div className="flex items-center gap-2 md:gap-3">

                        {/* Theme Switcher */}
                        <ThemeSwitcher />

                        {/* Locale Selector (Language) */}
                        <LocaleSelector compact />

                        <div className="h-4 w-[1px] bg-white/10 mx-0.5 hidden sm:block" />

                        {/* Help */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-xl hover:bg-white/5 dt-text-muted hover:text-white w-9 h-9"
                                >
                                    <HelpCircle className="h-5 w-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-slate-900/95 border-white/10 backdrop-blur-2xl text-white">
                                <DropdownMenuLabel className="text-xs font-bold text-white/30 uppercase tracking-widest px-3 py-2">
                                    {t('nav.resources')}
                                </DropdownMenuLabel>
                                <DropdownMenuItem className="focus:bg-white/5 cursor-pointer">
                                    <HelpCircle className="mr-2 h-4 w-4 text-blue-400" />
                                    {t('nav.docs')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-white/5" />
                                <DropdownMenuItem className="focus:bg-white/5 cursor-pointer">
                                    <ExternalLink className="mr-2 h-4 w-4 text-slate-400" />
                                    API Docs
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default AppHeader;
