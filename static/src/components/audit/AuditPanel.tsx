import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2, Lock, LogIn, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { rememberNext, useAuth } from '@/context/AuthContext';
import { ApiError, apiFetch } from '@/lib/api';
import QuotaPanel from '@/components/QuotaPanel';
import type { AuditReport } from './types';
import ReportView from './ReportView';
import AssistantChat from './AssistantChat';

const PENDING_URL_KEY = 'dt-pending-url';
// Codes whose server message is already localized and more precise than a generic dictionary text.
const SERVER_MESSAGE_CODES = ['QUOTA_EXCEEDED', 'DAILY_LIMIT', 'DOMAIN_LIMIT'];
const QUOTA_CODES = [...SERVER_MESSAGE_CODES, 'EMAIL_NOT_VERIFIED', 'PLAN_FEATURE_UNAVAILABLE'];

interface PanelError { code: string; message: string; renewsAt?: string | null }

/** Anonymous visitors see the form but must create a free account (or sign in) to run an analysis. */
function SignupCta({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mt-3 rounded-xl border border-blue-500/30 bg-blue-950/30 p-3 text-sm text-blue-50" role="note">
      <p className="font-semibold">{t('scanForm.ctaTitle')}</p>
      <p className="mt-0.5 text-xs text-blue-100/80">{t('scanForm.ctaText')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link to="/auth?mode=signup" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500">
          <UserPlus className="h-3.5 w-3.5" aria-hidden />{t('scanForm.ctaSignup')}</Link>
        <Link to="/auth?mode=signin" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10">
          <LogIn className="h-3.5 w-3.5" aria-hidden />{t('nav.signIn')}</Link>
      </div>
    </div>
  );
}

export default function AuditPanel({ onStateChange, onDone }: { onStateChange?: (active: boolean) => void; onDone?: () => void }) {
  const { language, s, t, formatDay } = useI18n();
  const { me, session, refreshMe } = useAuth();
  const loc = useLocation();
  const [url, setUrl] = useState(() => { const v = sessionStorage.getItem(PENDING_URL_KEY) || ''; sessionStorage.removeItem(PENDING_URL_KEY); return v; });
  const [deep, setDeep] = useState(false);
  const [maxPages, setMaxPages] = useState(5);
  const [consent, setConsent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<PanelError | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  const timer = useRef<number | null>(null);

  const ent = me?.entitlements;
  const deepAllowed = !!session && !!ent?.deep_scan;
  const maxAllowedPages = Math.max(2, ent?.max_deep_pages ?? 5);
  useEffect(() => { if (!deepAllowed && deep) setDeep(false); }, [deepAllowed, deep]);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);
  useEffect(() => { if (session) setNeedAuth(false); }, [session]);

  const errMsg = (code: string, fallback?: string) => {
    if (SERVER_MESSAGE_CODES.includes(code) && fallback) return fallback;
    const v = t(`errors.${code}`);
    return v === code ? (fallback || t('errors.UNKNOWN')) : v;
  };
  const keepTarget = () => { rememberNext(loc.pathname + loc.search); if (url.trim()) sessionStorage.setItem(PENDING_URL_KEY, url.trim()); };

  const run = async () => {
    const target = url.trim();
    if (!target) return;
    if (!session) { setNeedAuth(true); setError(null); return; }   // the server would answer AUTH_REQUIRED anyway
    setLoading(true); setError(null); setNeedAuth(false); setReport(null); setPhase(0); onStateChange?.(true);
    // progress labels are UI hints only (not results); real per-stage timings come back in report.stages
    timer.current = window.setInterval(() => setPhase((p) => Math.min(p + 1, s.phases.length - 1)), consent ? 9000 : 5000);
    const ctrl = new AbortController();
    const abort = window.setTimeout(() => ctrl.abort(), deep ? 420_000 : 300_000);
    try {
      const body = deep ? { url: target, max_pages: Math.min(maxPages, maxAllowedPages), consent_phases: consent, language }
        : { url: target, consent_phases: consent, language };
      const data = await apiFetch<AuditReport>(deep ? '/api/audit/deep' : '/api/audit', { json: body, signal: ctrl.signal });
      if (!data.success) { setError({ code: data.error_code || 'UNKNOWN', message: errMsg(data.error_code || 'UNKNOWN', data.message || undefined) }); onStateChange?.(false); }
      else { setReport(data); if (data.persisted) { void refreshMe(); onDone?.(); } }
    } catch (e: any) {
      if (e instanceof ApiError) {
        if (e.code === 'AUTH_REQUIRED') setNeedAuth(true);
        else {
          const b = e.body?.detail && typeof e.body.detail === 'object' ? e.body.detail : e.body;
          setError({ code: e.code, message: errMsg(e.code, e.message), renewsAt: b?.renews_at ?? null });
        }
        if (QUOTA_CODES.includes(e.code)) void refreshMe();
      } else setError({ code: 'UNKNOWN', message: t('errors.UNKNOWN') });
      onStateChange?.(false);
    } finally {
      window.clearTimeout(abort);
      if (timer.current) window.clearInterval(timer.current);
      setLoading(false);
    }
  };

  const isQuotaError = !!error && QUOTA_CODES.includes(error.code);
  return (
    <div className="space-y-4">
      <div className="dt-card mx-auto max-w-3xl rounded-2xl border border-white/10 p-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void run(); }}>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={s.placeholder} disabled={loading} className="h-11 flex-1 bg-white/5 text-white" aria-label="URL" />
          <Button type="submit" disabled={loading || !url.trim()} className="h-11 bg-blue-600 px-6 font-bold hover:bg-blue-500">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{s.scanning}</> : <><Search className="mr-2 h-4 w-4" />{s.scan}</>}
          </Button>
        </form>
        {session && (
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-white/70">
            <label className={`flex items-center gap-2 ${deepAllowed ? '' : 'opacity-60'}`}>
              <Switch checked={deep} onCheckedChange={setDeep} disabled={loading || !deepAllowed} aria-describedby="deep-hint" />
              {deep ? s.deep : s.single}{!deepAllowed && <Lock className="h-3 w-3" aria-hidden />}</label>
            {deep && <label className="flex items-center gap-2">{s.maxPages}
              <select value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} disabled={loading} className="rounded border border-white/10 bg-slate-900 px-1">
                {Array.from({ length: maxAllowedPages - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>}
            <label className="flex items-center gap-2"><Switch checked={consent} onCheckedChange={setConsent} disabled={loading} />{s.consentPhases}</label>
          </div>
        )}
        {session && !deepAllowed && me && (
          <p id="deep-hint" className="mt-2 text-[11px] text-white/50">
            {t('scanForm.deepNeedsPlan')} <Link to="/configuracoes#planos" className="underline">{t('visibility.comparePlans')}</Link>
          </p>
        )}
        <p className="mt-1 flex items-center gap-1 text-[11px] text-white/40"><ShieldCheck className="h-3.5 w-3.5" />{s.noLogin}</p>
        {session && me && <QuotaPanel me={me} className="mt-2" />}
        {(!session || needAuth) && <SignupCta onClick={keepTarget} />}
        {error && !loading && isQuotaError && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100" role="alert">
            <p>{error.message}</p>
            {error.renewsAt && <p className="mt-1 text-xs">{t('quota.renewsOn', { date: formatDay(error.renewsAt) })}</p>}
            {error.code !== 'EMAIL_NOT_VERIFIED' && <Link to="/configuracoes#planos" className="mt-1 inline-block text-xs underline">{t('visibility.comparePlans')}</Link>}
          </div>
        )}
      </div>

      {loading && (
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-950/30 p-4 text-sm text-blue-100" role="status" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin" /><span>{s.phases[phase]}…</span></div>
      )}
      {error && !loading && !isQuotaError && (
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-100" role="alert">
          <span>{error.message}</span><Button size="sm" variant="outline" onClick={() => void run()}>{s.retry}</Button></div>
      )}
      {report && !loading && (
        <>
          {report.persisted && <p className="mx-auto max-w-3xl text-center text-xs text-emerald-300" role="status">{t('scanForm.saved')} <Link className="underline" to={`/auditorias/${report.audit_id}`}>{t('app.open')}</Link></p>}
          <ReportView r={report} />
          <AssistantChat report={report} />
        </>
      )}
    </div>
  );
}
