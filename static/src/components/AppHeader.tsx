import { Link } from 'react-router-dom';
import { LogOut, Settings, ShieldCheck, History, UserRound } from 'lucide-react';
import logoIcon from '@/assets/logo/datatrust-logo-icon.png';
import { LANGUAGES, useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import ThemeSwitcher from './ThemeSwitcher';
import TestModeBanner from './SimulationBanner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const LABEL: Record<string, string> = { 'pt-BR': 'PT', en: 'EN', es: 'ES' };

const AppHeader = () => {
  const { language, setLanguage, t } = useI18n();
  const { session, me, signOut, configured } = useAuth();
  return (
    <>
      <TestModeBanner />
      <header className="border-b border-white/5">
        <div className="container mx-auto flex items-center justify-between gap-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex items-center rounded-lg bg-white px-2 py-1"><img src={logoIcon} alt="DataTrust Audit" className="h-7 w-auto" draggable={false} /></span>
            <span className="hidden text-sm font-bold dt-text-primary sm:inline">DataTrust Audit</span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Principal">
            {session && <Link to="/app" className="hidden rounded-lg px-3 py-1.5 text-sm dt-text-muted hover:text-white sm:inline">{t('nav.history')}</Link>}
            <div className="flex rounded-lg border border-white/10 p-0.5" role="group" aria-label={t('nav.language')}>
              {LANGUAGES.map((l) => (
                <button key={l} onClick={() => setLanguage(l)} aria-pressed={language === l}
                  className={`rounded-md px-2 py-1 text-xs font-semibold ${language === l ? 'bg-blue-600 text-white' : 'dt-text-muted hover:text-white'}`}>{LABEL[l]}</button>
              ))}
            </div>
            <ThemeSwitcher />
            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/80 hover:bg-white/10" aria-label={t('nav.account')}>
                    <UserRound className="h-4 w-4" /><span className="hidden max-w-[10rem] truncate md:inline">{me?.user.email || t('nav.account')}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 border-white/10 bg-slate-900/95 text-white">
                  <div className="px-3 py-2 text-xs text-white/50">{me ? `${me.plan === 'admin' ? t('plans.admin') : me.entitlements.plan_name}${me.test_context ? ` (${t('settings.testContextShort')})` : ''}` : ''}</div>
                  <DropdownMenuItem asChild><Link to="/app"><History className="mr-2 h-4 w-4" />{t('nav.history')}</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/configuracoes"><Settings className="mr-2 h-4 w-4" />{t('nav.settings')}</Link></DropdownMenuItem>
                  {me?.user.is_admin && <DropdownMenuItem asChild><Link to="/admin"><ShieldCheck className="mr-2 h-4 w-4" />{t('nav.admin')}</Link></DropdownMenuItem>}
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onClick={() => void signOut()}><LogOut className="mr-2 h-4 w-4" />{t('nav.signOut')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/auth" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500" aria-disabled={!configured}>{t('nav.signIn')}</Link>
            )}
          </nav>
        </div>
      </header>
    </>
  );
};

export default AppHeader;
