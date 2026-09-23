import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Settings,
    HelpCircle,
    ExternalLink,
    LogIn,
    LogOut,
    DollarSign
} from 'lucide-react';
import PlanBadge from './PlanBadge';
import LocaleSelector from './LocaleSelector';
import ThemeSwitcher from './ThemeSwitcher';
import logoIcon from '@/assets/logo/datatrust-logo-icon.png';


import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { Link } from 'react-router-dom';

const AppHeader = () => {
    const { t } = useI18n();
    const { user, isAuthenticated, logout } = useAuth();

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
                        {/* Desktop Nav */}
                        <nav className="hidden lg:flex items-center gap-5 mr-2">
                            <Link to="/pricing" className="text-sm font-medium dt-text-muted hover:text-blue-400 transition-colors">
                                {t('nav.pricing')}
                            </Link>
                        </nav>

                        {/* Theme Switcher */}
                        <ThemeSwitcher />

                        {/* Locale Selector (Language) */}
                        <LocaleSelector compact />

                        <div className="h-4 w-[1px] bg-white/10 mx-0.5 hidden sm:block" />

                        {/* Plan Badge */}
                        <PlanBadge />

                        {/* Auth buttons */}
                        {isAuthenticated ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-1.5 pr-3 hover:bg-white/10 transition-all">
                                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-inner">
                                            {user?.name?.[0]?.toUpperCase() ?? 'U'}
                                        </div>
                                        <span className="text-xs font-semibold hidden md:block max-w-[100px] truncate dt-text-secondary">{user?.name}</span>
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 bg-slate-900/95 border-white/10 backdrop-blur-2xl text-white">
                                    <DropdownMenuLabel className="px-3 py-2">
                                        <p className="text-xs font-bold text-white/30 uppercase tracking-widest">{t('nav.account')}</p>
                                        <p className="text-sm font-medium truncate mt-1">{user?.email}</p>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-white/5" />
                                    <DropdownMenuItem asChild className="focus:bg-white/5 cursor-pointer">
                                        <Link to="/pricing" className="flex items-center w-full">
                                            <DollarSign className="h-4 w-4 mr-2 text-blue-400" />
                                            {t('nav.pricing')}
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="focus:bg-white/5 cursor-pointer">
                                        <Link to="/settings" className="flex items-center w-full">
                                            <Settings className="h-4 w-4 mr-2 text-slate-400" />
                                            {t('nav.settings')}
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-white/5" />
                                    <DropdownMenuItem onClick={logout} className="text-red-400 focus:bg-red-500/10 focus:text-red-400 cursor-pointer">
                                        <LogOut className="h-4 w-4 mr-2" />
                                        {t('nav.logout')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <Link to="/auth">
                                <Button size="sm" className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg hover:shadow-blue-500/40 hover:scale-105 active:scale-95 transition-all text-xs font-bold h-9 px-5 rounded-xl border-t border-white/20">
                                    <LogIn className="h-4 w-4 mr-2" />
                                    {t('nav.login')}
                                </Button>
                            </Link>
                        )}

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
