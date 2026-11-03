import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, Minus } from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import QuotaPanel from '@/components/QuotaPanel';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { LANGUAGES, useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { apiFetch } from '@/lib/api';
import { formatBRL, type PlanRow, type PlansMatrix } from '@/lib/plans';

const LABEL: Record<string, string> = { 'pt-BR': 'Português (Brasil)', en: 'English', es: 'Español' };

export default function SettingsPage() {
  const { t, language, setLanguage, formatNumber } = useI18n();
  const { me, session, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const loc = useLocation();
  const [matrix, setMatrix] = useState<PlansMatrix | null>(null);
  const [matrixErr, setMatrixErr] = useState(false);
  const [interest, setInterest] = useState<string | null>(null);
  useEffect(() => { apiFetch<PlansMatrix>('/api/plans', { auth: false }).then((m) => { setMatrix(m); setMatrixErr(false); }).catch(() => { setMatrix(null); setMatrixErr(true); }); }, []);
  useEffect(() => {
    if (matrix && loc.hash === '#planos') document.getElementById('planos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [matrix, loc.hash]);

  const isRealAdmin = me?.plan === 'admin' && !me?.test_context;
  const currentPlan = me && !isRealAdmin ? me.plan : null;
  const planLabel = me ? (isRealAdmin ? t('plans.admin') : me.entitlements.plan_name) : '—';
  const num = (n: number | null | undefined) => (n == null ? '—' : formatNumber(n));
  const seats = (p: PlanRow) => (p.seats == null ? '—' : !p.seats_operational && p.seats > 1 ? t('settings.seatsWhenAvailable', { n: p.seats }) : formatNumber(p.seats));
  const row = (label: string, cell: (p: PlanRow) => React.ReactNode) => (
    <tr className="border-t border-white/5"><th scope="row" className="px-2 py-2 text-left font-normal">{label}</th>
      {matrix!.plans.map((p) => <td key={p.plan} className="px-2 py-2">{cell(p)}</td>)}</tr>
  );
  const cta = (p: PlanRow) => {
    if (currentPlan === p.plan) return <Button size="sm" variant="outline" disabled>{t('settings.currentPlan')}</Button>;
    if (p.plan === 'free') {
      if (!session) return <Button size="sm" asChild><Link to="/auth?mode=signup">{t('settings.ctaFree')}</Link></Button>;
      return null;
    }
    return <Button size="sm" onClick={() => setInterest(p.plan)} aria-expanded={interest === p.plan}>{t('settings.ctaPaid', { plan: p.plan_name })}</Button>;
  };

  return (
    <div className="dt-page min-h-screen font-sans"><AppHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <h1 className="text-2xl font-bold dt-text-primary">{t('settings.title')}</h1>
        {session && (
          <section className="dt-card space-y-2 rounded-2xl border border-white/10 p-5" aria-labelledby="acc">
            <h2 id="acc" className="font-bold">{t('settings.account')}</h2>
            <p className="text-sm">{t('auth.signedInAs', { email: me?.user.email || session?.user.email || '—' })}</p>
            <p className="text-sm dt-text-muted">{t('settings.role')}: {me?.user.is_admin ? t('settings.roleAdmin') : t('settings.roleUser')}</p>
            <p className="text-sm dt-text-muted">{t('settings.plan')}: <b>{planLabel}</b>{me?.test_context ? ` (${t('settings.testContext')})` : ''} · {t('settings.subscription')}: {me ? t(`settings.subStates.${me.subscription}`) : '—'}</p>
            {me && <QuotaPanel me={me} />}
            <Button variant="outline" size="sm" onClick={() => void signOut()}>{t('settings.signOut')}</Button>
          </section>
        )}
        <section className="dt-card space-y-3 rounded-2xl border border-white/10 p-5" aria-labelledby="pref">
          <h2 id="pref" className="font-bold">{t('settings.language')} / {t('settings.theme')}</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.language')}>
            {LANGUAGES.map((l) => <Button key={l} size="sm" variant={language === l ? 'default' : 'outline'} aria-pressed={language === l} onClick={() => setLanguage(l)}>{LABEL[l]}</Button>)}</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.theme')}>
            {(['dark', 'light', 'executive'] as const).map((m) => <Button key={m} size="sm" variant={theme === m ? 'default' : 'outline'} aria-pressed={theme === m} onClick={() => setTheme(m)}>{t(`theme.${m}`)}</Button>)}</div>
        </section>
        <section id="planos" className="dt-card scroll-mt-4 rounded-2xl border border-white/10 p-5" aria-labelledby="plans-title">
          <h2 id="plans-title" className="mb-1 font-bold">{t('settings.plansTitle')}</h2>
          {me && <p className="mb-3 text-xs dt-text-muted">{t('settings.yourPlan', { plan: planLabel })}{me.test_context ? ` — ${t('settings.testContext')}` : ''}</p>}
          {matrixErr && <p role="alert" className="text-sm text-red-200">{t('errors.UNKNOWN')}</p>}
          {matrix && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('settings.plansTitle')}</caption>
                <thead><tr className="text-left text-[11px] uppercase text-white/50"><th scope="col" className="px-2 py-2">{t('settings.feature')}</th>
                  {matrix.plans.map((p) => <th scope="col" key={p.plan} className={`px-2 py-2 ${currentPlan === p.plan ? 'text-blue-300' : ''}`}>{p.plan_name}{currentPlan === p.plan ? ` · ${t('settings.current')}` : ''}</th>)}</tr></thead>
                <tbody>
                  {row(t('settings.price'), (p) => <b>{formatBRL(p.price_cents)}{t('settings.perMonthShort')}</b>)}
                  {row(t('visibility.title'), (p) => `${p.visibility_percent}%`)}
                  {row(t('settings.analysesPerMonth'), (p) => num(p.analyses_per_month))}
                  {row(t('settings.domainsPerPeriod'), (p) => num(p.domains_per_period))}
                  {row(t('settings.dailyLimit'), (p) => (p.daily_limit == null ? t('settings.noDailyLimit') : t('settings.perDay', { n: p.daily_limit })))}
                  {row(t('settings.seats'), seats)}
                  {row(t('settings.deepScan'), (p) => (p.deep_scan
                    ? <><Check className="inline h-4 w-4 text-emerald-300" aria-hidden /><span className="ml-1">{t('settings.upToPages', { n: p.max_deep_pages })}</span><span className="sr-only"> {t('common.yes')}</span></>
                    : <><Minus className="inline h-4 w-4 text-white/40" aria-hidden /><span className="sr-only">{t('common.no')}</span></>))}
                  {row(t('settings.history'), (p) => num(p.history_limit))}
                  {matrix.plans.some((p) => p.audience) && row(t('settings.audience'), (p) => <span className="text-xs dt-text-muted">{p.audience || '—'}</span>)}
                  {matrix.features.filter((f) => !f.implemented).map((f) => <tr key={f.id} className="border-t border-white/5 text-white/50"><th scope="row" className="px-2 py-2 text-left font-normal">{t(`plans.features.${f.id}`)}</th><td colSpan={matrix.plans.length} className="px-2 py-2 text-xs">{t('settings.planned')}</td></tr>)}
                  <tr className="border-t border-white/5"><th scope="row" className="px-2 py-2"><span className="sr-only">{t('common.actions')}</span></th>
                    {matrix.plans.map((p) => <td key={p.plan} className="px-2 py-3">{cta(p)}</td>)}</tr>
                </tbody>
              </table>
            </div>
          )}
          {interest && <p role="status" className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">{t('settings.paymentDisabled')}</p>}
          {matrix?.analysis_definition && <p className="mt-3 text-xs dt-text-muted"><b>{t('settings.analysisDefinition')}:</b> {matrix.analysis_definition}</p>}
          {matrix?.visibility_rule && <p className="mt-1 text-xs dt-text-muted"><b>{t('visibility.ruleLabel')}:</b> {matrix.visibility_rule}</p>}
          <p className="mt-1 text-xs dt-text-muted">{matrix && !matrix.billing?.enabled ? t('settings.billingDisabled') : t('settings.pricingNote')}</p>
        </section>
      </main>
    </div>
  );
}
