import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, RotateCcw, ShieldCheck, Square, XCircle } from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import QuotaPanel from '@/components/QuotaPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth, type Entitlements, type QuotaState, type SubscriptionState, type TestPlan } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { ApiError, apiFetch } from '@/lib/api';
import { centsToInput, formatBRL, parseBRLToCents, PLAN_IDS, type PlanId, type PlansMatrix } from '@/lib/plans';
import { toast } from '@/hooks/use-toast';

const Box = ({ children, title }: { children: React.ReactNode; title?: string }) => (
  <section className="dt-card rounded-2xl border border-white/10 p-4">{title && <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white/70">{title}</h3>}{children}</section>
);
const Dot = ({ ok }: { ok: boolean | null }) => ok === null ? <span className="text-white/40">—</span>
  : ok ? <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-4 w-4" aria-hidden />OK</span>
    : <span className="inline-flex items-center gap-1 text-red-300"><XCircle className="h-4 w-4" aria-hidden />!</span>;

function useAdminData<T>(path: string, deps: unknown[] = []) {
  const { t } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setData(await apiFetch<T>(path)); setErr(null); }
    catch (e) { setErr(e instanceof ApiError ? (t(`errors.${e.code}`) === e.code ? e.message : t(`errors.${e.code}`)) : t('errors.UNKNOWN')); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, t, ...deps]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, reload: load };
}

function Health() {
  const { t, formatDate } = useI18n();
  const { data, err } = useAdminData<any>('/api/admin/overview');
  if (err) return <p role="alert" className="text-red-200">{err}</p>;
  if (!data) return <Loader2 className="h-5 w-5 animate-spin" aria-label={t('common.loading')} />;
  const sv = data.services;
  const row = (label: string, ok: boolean | null, detail?: string) => <tr className="border-t border-white/5"><th scope="row" className="px-2 py-2 text-left font-normal">{label}</th><td className="px-2 py-2"><Dot ok={ok} /></td><td className="px-2 py-2 text-xs text-white/60">{detail}</td></tr>;
  return (
    <div className="space-y-4">
      <Box><table className="w-full text-sm"><caption className="sr-only">{t('admin.tabs.health')}</caption><tbody>
        {row(t('admin.health.database'), sv.database.ok, `${sv.database.dialect || ''} · ${(sv.database.migrations || []).join(', ')}`)}
        {row(t('admin.health.auth'), sv.auth.supabase_url && sv.auth.jwt_secret, `${sv.auth.supabase_url ? t('admin.health.configured') : t('admin.health.missing')} · issuer ${sv.auth.issuer || '—'}`)}
        {row(t('admin.health.jwks'), sv.auth.jwks.configured ? !!sv.auth.jwks.reachable : null, sv.auth.jwks.reachable ? `${t('admin.health.reachable')} (${(sv.auth.jwks.algs || []).join(', ') || 'HS256 legado'})` : `${t('admin.health.unreachable')} ${sv.auth.jwks.error || ''}`)}
        {row(t('admin.health.browser'), sv.browser_runtime_installed, sv.browser_runtime_installed ? t('admin.health.installed') : t('admin.health.notInstalled'))}
        {row(t('admin.health.rag'), sv.rag_corpus.available)}
        {row(t('admin.health.llm'), sv.llm_configured)}
        {row(t('admin.health.devAdmin'), !sv.dev_admin_mode_effective, sv.dev_admin_mode_env_present ? t('admin.health.devAdminIgnored') : t('admin.health.devAdminOff'))}
      </tbody></table></Box>
      <Box title={t('admin.health.limits')}><p className="text-sm text-white/70">{JSON.stringify(data.limits)}</p><p className="mt-1 text-xs text-white/50">{t('admin.health.users')}: {data.users} · {data.engine_version} · {data.scoring_version}</p></Box>
      <Box title={t('admin.health.last7')}>
        <p className="text-sm">{t('admin.health.total')}: <b>{data.audits_last_7_days.total}</b> · {Object.entries(data.audits_last_7_days.by_status).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</p>
        <p className="text-sm">{t('admin.health.p50')}: {data.audits_last_7_days.duration_ms.p50 ?? '—'} ms · {t('admin.health.p95')}: {data.audits_last_7_days.duration_ms.p95 ?? '—'} ms · {data.audits_last_7_days.duration_ms.samples} {t('admin.health.samples')}</p>
        <p className="text-xs text-white/50">{t('admin.health.p95Note')}</p>
        <p className="mt-2 text-sm">{t('admin.health.topErrors')}: {data.audits_last_7_days.top_errors.map(([c, n]: [string, number]) => `${c} (${n})`).join(', ') || '—'}</p>
      </Box>
    </div>
  );
}

function Audits() {
  const { t, formatDate } = useI18n();
  const [status, setStatus] = useState('');
  const { data, err } = useAdminData<{ items: any[] }>(`/api/admin/audits${status ? `?status=${status}` : ''}`, [status]);
  return (
    <Box>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-sm" htmlFor="adm-status">{t('admin.audits.status')}</label>
        <select id="adm-status" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-sm">
          <option value="">{t('admin.audits.all')}</option><option value="running">{t('admin.audits.running')}</option><option value="partial">{t('admin.audits.partial')}</option>
          <option value="failed">{t('admin.audits.failed')}</option><option value="completed">{t('admin.audits.completed')}</option></select>
      </div>
      {err && <p role="alert" className="text-red-200">{err}</p>}
      {data && (data.items.length === 0 ? <p className="text-sm text-white/60">{t('admin.audits.empty')}</p> :
        <div className="overflow-x-auto"><table className="w-full text-xs"><caption className="sr-only">{t('admin.tabs.audits')}</caption>
          <thead><tr className="text-left uppercase text-white/50">{['user', 'site', 'plan', 'status', 'duration', 'error', 'when'].map((k) => <th scope="col" key={k} className="px-2 py-2">{t(`admin.audits.${k}`)}</th>)}</tr></thead>
          <tbody>{data.items.map((a) => <tr key={a.id} className="border-t border-white/5"><td className="px-2 py-2">{a.user_email || '—'}</td><td className="px-2 py-2 break-all">{a.domain}</td><td className="px-2 py-2">{a.plan_at_run || '—'}</td>
            <td className="px-2 py-2">{a.status}</td><td className="px-2 py-2">{a.duration_ms != null ? `${Math.round(a.duration_ms / 1000)}s` : '—'}</td><td className="px-2 py-2">{a.error_code || '—'}</td><td className="px-2 py-2">{formatDate(a.created_at)}</td></tr>)}</tbody></table></div>)}
      <p className="mt-3 text-xs text-white/50">{t('admin.audits.note')}</p>
    </Box>
  );
}

function Credits() {
  const { t, formatDate } = useI18n();
  const { data, err } = useAdminData<any>('/api/admin/credits');
  if (err) return <p role="alert" className="text-red-200">{err}</p>;
  if (!data) return <Loader2 className="h-5 w-5 animate-spin" aria-label={t('common.loading')} />;
  const states = (o: Record<string, number> | undefined) => ['reserved', 'committed', 'released'].map((k) => `${t(`admin.credits.${k}`)}: ${o?.[k] || 0}`).join(' · ');
  const real = data.real || { by_state: data.by_state, by_plan: {} };
  return (
    <div className="space-y-4">
      <Box title={t('admin.credits.period')}>
        <p className="text-sm">{formatDate(data.period_start)} → {formatDate(data.period_end)}</p>
        <p className="text-xs text-white/50">{data.timezone} · {data.period_kind === 'subscription' ? t('admin.credits.kindSubscription') : t('admin.credits.kindMonth')}</p>
      </Box>
      <Box title={t('admin.credits.real')}>
        <p className="text-sm">{states(real.by_state)}</p>
        <p className="mt-1 text-sm text-white/70">{t('admin.credits.byPlan')}: {Object.entries(real.by_plan || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</p>
        <h4 className="mt-3 text-sm font-semibold">{t('admin.credits.top')}</h4>
        {(data.top_users || []).length === 0 ? <p className="text-sm text-white/50">—</p> : (
          <table className="mt-1 w-full text-xs"><caption className="sr-only">{t('admin.credits.top')}</caption>
            <thead><tr className="text-left uppercase text-white/50"><th scope="col" className="px-2 py-1">{t('admin.audits.user')}</th><th scope="col" className="px-2 py-1">{t('admin.credits.analyses')}</th><th scope="col" className="px-2 py-1">{t('admin.credits.domains')}</th></tr></thead>
            <tbody>{data.top_users.map((u: any) => <tr key={u.email} className="border-t border-white/5"><td className="px-2 py-1">{u.email}</td><td className="px-2 py-1">{u.credits}</td><td className="px-2 py-1">{u.domains ?? '—'}</td></tr>)}</tbody></table>)}
      </Box>
      <Box title={t('admin.credits.test')}>
        <p className="text-sm">{states(data.test?.by_state)}</p>
        {data.test?.note && <p className="mt-1 text-xs text-white/50">{data.test.note}</p>}
      </Box>
    </div>
  );
}

interface AdminPlans extends PlansMatrix {
  admin_role: Entitlements;
  config: { version: number; currency: string; plans: Record<PlanId, Record<string, any>> };
  history: { version: number; created_by: string | null; note: string | null; created_at: string }[];
}
type Field = 'name' | 'price' | 'visibility' | 'analyses_per_month' | 'domains_per_period' | 'seats' | 'daily_limit' | 'deep_scan' | 'max_deep_pages' | 'history_limit';
const FIELDS: Field[] = ['name', 'price', 'visibility', 'analyses_per_month', 'domains_per_period', 'seats', 'daily_limit', 'deep_scan', 'max_deep_pages', 'history_limit'];
type FormRow = Record<Field, string | boolean>;

const toForm = (c: Record<string, any>): FormRow => ({
  name: c.name ?? '', price: centsToInput(c.price_cents), visibility: c.visibility == null ? '' : String(Math.round(c.visibility * 100)),
  analyses_per_month: c.analyses_per_month == null ? '' : String(c.analyses_per_month), domains_per_period: c.domains_per_period == null ? '' : String(c.domains_per_period),
  seats: c.seats == null ? '' : String(c.seats), daily_limit: c.daily_limit == null ? '' : String(c.daily_limit), deep_scan: !!c.deep_scan,
  max_deep_pages: c.max_deep_pages == null ? '' : String(c.max_deep_pages), history_limit: c.history_limit == null ? '' : String(c.history_limit),
});

/** Converts the form back to API units. Returns the payload of CHANGED fields or an error key. */
function diffPlan(orig: Record<string, any>, f: FormRow): { out: Record<string, unknown>; bad: Field | null } {
  const out: Record<string, unknown> = {};
  const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
  for (const k of FIELDS) {
    const v = f[k];
    if (k === 'name') { const s = String(v).trim(); if (!s) return { out, bad: k }; if (s !== orig.name) out.name = s; continue; }
    if (k === 'deep_scan') { if (v !== !!orig.deep_scan) out.deep_scan = v; continue; }
    if (k === 'price') { const c = parseBRLToCents(String(v)); if (c == null) return { out, bad: k }; if (c !== orig.price_cents) out.price_cents = c; continue; }
    if (k === 'visibility') { const p = int(String(v)); if (!(p >= 1 && p <= 100)) return { out, bad: k }; const r = p / 100; if (Math.abs(r - (orig.visibility ?? 0)) > 1e-9) out.visibility = r; continue; }
    if (k === 'daily_limit') { const s = String(v).trim(); const n = s === '' ? null : int(s); if (n !== null && isNaN(n)) return { out, bad: k }; if (n !== (orig.daily_limit ?? null)) out.daily_limit = n; continue; }
    const n = int(String(v)); if (isNaN(n)) return { out, bad: k }; if (n !== orig[k]) out[k] = n;
  }
  return { out, bad: null };
}

function Plans() {
  const { t, formatDate } = useI18n();
  const { refreshMe } = useAuth();
  const { data, err, reload } = useAdminData<AdminPlans>('/api/admin/plans');
  const [form, setForm] = useState<Record<string, FormRow> | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ version: number; changes: Record<string, Record<string, [unknown, unknown]>> } | null>(null);
  useEffect(() => { if (data?.config?.plans) setForm(Object.fromEntries(PLAN_IDS.map((p) => [p, toForm(data.config.plans[p] || {})]))); }, [data]);
  if (err) return <p role="alert" className="text-red-200">{err}</p>;
  if (!data || !form) return <Loader2 className="h-5 w-5 animate-spin" aria-label={t('common.loading')} />;

  const set = (p: string, k: Field, v: string | boolean) => setForm((f) => (f ? { ...f, [p]: { ...f[p], [k]: v } } : f));
  const publish = async () => {
    setServerErr(null); setDone(null);
    const plans: Record<string, Record<string, unknown>> = {};
    for (const p of PLAN_IDS) {
      const { out, bad } = diffPlan(data.config.plans[p] || {}, form[p]);
      if (bad) { setServerErr(t('admin.plans.invalidField', { plan: data.config.plans[p]?.name || p, field: t(`admin.plans.fields.${bad}`) })); return; }
      if (Object.keys(out).length) plans[p] = out;
    }
    if (!Object.keys(plans).length) { setServerErr(t('admin.plans.noChanges')); return; }
    setBusy(true);
    try {
      const r = await apiFetch<{ version: number; changes: any }>('/api/admin/plans', { method: 'PUT', json: { plans, note: note.trim() || undefined } });
      setDone({ version: r.version, changes: r.changes || {} }); setNote('');
      await reload(); void refreshMe();
    } catch (e) { setServerErr(e instanceof ApiError ? e.message : t('errors.UNKNOWN')); }
    finally { setBusy(false); }
  };
  const ar = data.admin_role;
  const adminCell = (k: Field) => {
    if (!ar) return '—';
    if (k === 'name') return ar.plan_name;
    if (k === 'price') return '—';
    if (k === 'visibility') return `${ar.visibility_percent}%`;
    if (k === 'deep_scan') return ar.deep_scan ? t('common.yes') : t('common.no');
    const v = (ar as unknown as Record<string, unknown>)[k];
    return v == null ? t('admin.plans.noLimit') : String(v);
  };
  const inputCls = 'h-8 w-28 bg-white/5 text-xs';
  return (
    <div className="space-y-4">
      <Box title={t('admin.plans.title', { version: data.config.version })}>
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100"><AlertIcon />{t('admin.plans.snapshotWarning')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">{t('admin.tabs.plans')}</caption>
            <thead><tr className="text-left uppercase text-white/50"><th scope="col" className="px-2 py-2">{t('settings.feature')}</th>
              {PLAN_IDS.map((p) => <th scope="col" key={p} className="px-2 py-2">{data.config.plans[p]?.name || p}</th>)}
              <th scope="col" className="px-2 py-2">{ar?.plan_name || t('plans.admin')}</th></tr></thead>
            <tbody>
              {FIELDS.map((k) => (
                <tr key={k} className="border-t border-white/5">
                  <th scope="row" className="px-2 py-2 text-left font-normal">{t(`admin.plans.fields.${k}`)}</th>
                  {PLAN_IDS.map((p) => {
                    const id = `pf-${p}-${k}`; const label = `${t(`admin.plans.fields.${k}`)} — ${data.config.plans[p]?.name || p}`;
                    return (
                      <td key={p} className="px-2 py-1">
                        {k === 'deep_scan'
                          ? <input id={id} type="checkbox" aria-label={label} checked={!!form[p][k]} onChange={(e) => set(p, k, e.target.checked)} className="h-4 w-4" />
                          : <Input id={id} aria-label={label} value={String(form[p][k])} onChange={(e) => set(p, k, e.target.value)} className={inputCls}
                            inputMode={k === 'name' ? 'text' : k === 'price' ? 'decimal' : 'numeric'} disabled={k === 'price' && p === 'free'}
                            placeholder={k === 'daily_limit' ? t('admin.plans.noLimit') : undefined} />}
                        {k === 'price' && <span className="ml-1 text-[10px] text-white/40">{formatBRL(parseBRLToCents(String(form[p][k])))}</span>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-white/50">{adminCell(k)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-white/50">{t('admin.plans.unitsHint')} {t('admin.plans.adminRoleNote')}</p>
        <label className="mt-3 block text-sm"><span className="mb-1 block dt-text-muted">{t('admin.plans.note')}</span>
          <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="max-w-xl bg-white/5" /></label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => void publish()} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('admin.plans.publish')}</Button>
          <Button variant="outline" onClick={() => { setForm(Object.fromEntries(PLAN_IDS.map((p) => [p, toForm(data.config.plans[p] || {})]))); setServerErr(null); }} disabled={busy}>{t('common.cancel')}</Button>
        </div>
        {serverErr && <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-950/30 p-2 text-sm text-red-100">{serverErr}</p>}
        {done && (
          <div role="status" className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-sm text-emerald-100">
            <p>{t('admin.plans.published', { version: done.version })}</p>
            <ul className="mt-1 list-disc pl-5 text-xs">{Object.entries(done.changes).flatMap(([p, ch]) => Object.entries(ch).map(([k, [a, b]]) => <li key={p + k}>{p}.{k}: {JSON.stringify(a)} → {JSON.stringify(b)}</li>))}</ul>
          </div>
        )}
      </Box>
      <Box title={t('admin.plans.history')}>
        {(data.history || []).length === 0 ? <p className="text-sm text-white/50">—</p> : (
          <table className="w-full text-xs"><caption className="sr-only">{t('admin.plans.history')}</caption>
            <thead><tr className="text-left uppercase text-white/50"><th scope="col" className="px-2 py-1">{t('admin.plans.version')}</th><th scope="col" className="px-2 py-1">{t('admin.log.actor')}</th><th scope="col" className="px-2 py-1">{t('admin.plans.note')}</th><th scope="col" className="px-2 py-1">{t('admin.log.when')}</th></tr></thead>
            <tbody>{data.history.map((h) => <tr key={h.version} className="border-t border-white/5"><td className="px-2 py-1 font-mono">v{h.version}{h.version === data.config.version ? ` · ${t('admin.plans.current')}` : ''}</td><td className="px-2 py-1">{h.created_by || '—'}</td><td className="px-2 py-1">{h.note || '—'}</td><td className="px-2 py-1">{formatDate(h.created_at)}</td></tr>)}</tbody></table>)}
      </Box>
    </div>
  );
}
const AlertIcon = () => <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />;

function PlanTesting() {
  const { t } = useI18n();
  const { me, setTestContext, resetTestBalance } = useAuth();
  const { data, err } = useAdminData<AdminPlans>('/api/admin/plans');
  const tc = me?.test_context ?? null;
  const active: TestPlan = (tc?.selected_plan as TestPlan) || 'admin';
  const [quotaState, setQuotaState] = useState<QuotaState>(tc?.quota_state || 'available');
  const [subState, setSubState] = useState<SubscriptionState>(tc?.subscription_state || 'active');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  useEffect(() => { if (tc) { setQuotaState(tc.quota_state); setSubState(tc.subscription_state); } }, [tc]);

  const apply = async (plan: TestPlan, qs: QuotaState = quotaState, ss: SubscriptionState = subState) => {
    setBusy(plan); setMsg(null); setFail(null);
    try {
      // the subscription state only matters for paid plans; Free and Administrador always use "active"
      await setTestContext(plan, plan === 'admin' ? 'available' : qs, plan === 'pro' || plan === 'premium' ? ss : 'active');
      setMsg(plan === 'admin' ? t('admin.testing.leftTest') : t('admin.testing.applied', { plan: t(`plans.${plan}`) }));
    } catch (e) { setFail(e instanceof ApiError ? e.message : t('errors.UNKNOWN')); }
    finally { setBusy(null); }
  };
  const reset = async () => {
    setBusy('reset'); setMsg(null); setFail(null);
    try { await resetTestBalance(); setMsg(t('admin.testing.resetDone')); }
    catch (e) { setFail(e instanceof ApiError ? e.message : t('errors.UNKNOWN')); }
    finally { setBusy(null); }
  };
  const plans = data?.plans || [];
  const paid = active === 'pro' || active === 'premium';
  const btn = (on: boolean) => `flex min-h-[5.5rem] flex-col items-start justify-center gap-1 rounded-2xl border-2 px-4 py-3 text-left transition disabled:cursor-wait ${on
    ? 'border-amber-300 bg-amber-500 text-black shadow-lg shadow-amber-500/30 ring-2 ring-amber-300' : 'border-white/10 bg-white/5 text-white hover:border-white/30'}`;

  return (
    <div className="space-y-4">
      <Box title={t('admin.testing.title')}>
        <p className="mb-3 text-sm dt-text-muted">{t('admin.testing.intro')}</p>
        {err && <p role="alert" className="mb-2 text-sm text-red-200">{err}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label={t('admin.testing.title')}>
          <button type="button" aria-pressed={active === 'admin'} disabled={!!busy} onClick={() => void apply('admin')} className={btn(active === 'admin')}>
            <span className="flex items-center gap-2 text-base font-black"><ShieldCheck className="h-4 w-4" aria-hidden />{t('admin.testing.adminButton')}</span>
            <span className="text-xs opacity-80">{t('admin.testing.adminHint')}</span>
          </button>
          {plans.map((p) => {
            const id = p.plan as TestPlan;
            return (
              <button key={p.plan} type="button" aria-pressed={active === id} disabled={!!busy} onClick={() => void apply(id)} className={btn(active === id)}>
                <span className="flex items-center gap-2 text-base font-black"><FlaskConical className="h-4 w-4" aria-hidden />{t('admin.testing.planButton', { plan: p.plan_name, percent: p.visibility_percent })}</span>
                <span className="text-xs opacity-80">{p.analyses_per_month == null ? '∞' : t('admin.testing.perMonth', { n: p.analyses_per_month })}</span>
              </button>
            );
          })}
          {!data && !err && <p className="flex items-center gap-2 text-sm dt-text-muted"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading')}</p>}
        </div>
        {busy && busy !== 'reset' && <p className="mt-2 flex items-center gap-2 text-xs dt-text-muted" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('common.loading')}</p>}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <fieldset className="rounded-xl border border-white/10 p-3 disabled:opacity-60" disabled={active === 'admin' || !!busy}>
            <legend className="px-1 text-xs font-semibold uppercase text-white/60">{t('admin.testing.quotaState')}</legend>
            <div className="flex flex-wrap gap-2">
              {(['available', 'exhausted'] as const).map((q) => (
                <Button key={q} size="sm" type="button" variant={quotaState === q ? 'default' : 'outline'} aria-pressed={quotaState === q}
                  onClick={() => { setQuotaState(q); if (active !== 'admin') void apply(active, q, subState); }}>{t(`admin.testing.quota.${q}`)}</Button>))}
            </div>
          </fieldset>
          <fieldset className="rounded-xl border border-white/10 p-3 disabled:opacity-60" disabled={!paid || !!busy}>
            <legend className="px-1 text-xs font-semibold uppercase text-white/60">{t('admin.testing.subscriptionState')}</legend>
            <div className="flex flex-wrap gap-2">
              {(['active', 'expired', 'payment_failed'] as const).map((s) => (
                <Button key={s} size="sm" type="button" variant={subState === s ? 'default' : 'outline'} aria-pressed={subState === s}
                  onClick={() => { setSubState(s); if (paid) void apply(active, quotaState, s); }}>{t(`admin.testing.sub.${s}`)}</Button>))}
            </div>
            <p className="mt-2 text-[11px] text-white/50">{t('admin.testing.subscriptionHint')}</p>
          </fieldset>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => void reset()} disabled={!tc || !!busy}>
            {busy === 'reset' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}{t('admin.testing.reset')}</Button>
          {msg && <span role="status" className="text-sm text-emerald-300">{msg}</span>}
          {fail && <span role="alert" className="text-sm text-red-200">{fail}</span>}
        </div>
        {me && tc && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="mb-1 text-xs font-semibold uppercase text-amber-200">{t('admin.testing.currentQuota')}</p>
            <QuotaPanel me={me} />
          </div>
        )}
        <p className="mt-4 flex items-start gap-2 text-xs text-white/60"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t('admin.testing.safety')}</p>
      </Box>
      <PlanTests />
    </div>
  );
}

/** Real, isolated rule tests on the server (ordinary test user in a separate database). */
function PlanTests() {
  const { t } = useI18n();
  const [plan, setPlan] = useState<PlanId>('free');
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<any>(null);
  const run = async () => {
    setRunning(true); setRes(null);
    try { setRes(await apiFetch('/api/admin/plan-tests', { json: { plan } })); }
    catch (e) { toast({ title: e instanceof ApiError ? e.message : t('errors.UNKNOWN'), variant: 'destructive' }); }
    finally { setRunning(false); }
  };
  return (
    <Box title={t('admin.planTests.title')}>
      <p className="mb-3 text-sm dt-text-muted">{t('admin.planTests.text')}</p>
      <div role="radiogroup" aria-label={t('settings.plan')} className="flex gap-2">
        {PLAN_IDS.map((p) => <button key={p} role="radio" aria-checked={plan === p} onClick={() => setPlan(p)}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold ${plan === p ? 'border-blue-500 bg-blue-600 text-white' : 'border-white/10 dt-text-muted'}`}>{t(`plans.${p}`)}</button>)}
      </div>
      <Button className="mt-3" onClick={() => void run()} disabled={running}>{running ? t('admin.planTests.running') : t('admin.planTests.run', { plan: t(`plans.${plan}`) })}</Button>
      {res && (
        <div className="mt-4" role="status">
          <p className="font-semibold">{t('admin.planTests.summary', { passed: res.passed, total: res.total })}</p>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><caption className="sr-only">{t('admin.planTests.title')}</caption>
            <thead><tr className="text-left uppercase text-white/50"><th scope="col" className="px-2 py-1">ID</th><th scope="col" className="px-2 py-1">{t('common.details')}</th><th scope="col" className="px-2 py-1">{t('admin.planTests.expected')}</th><th scope="col" className="px-2 py-1">{t('admin.planTests.observed')}</th><th scope="col" className="px-2 py-1">{t('common.status')}</th></tr></thead>
            <tbody>{(res.results || []).map((r: any) => <tr key={r.id} className="border-t border-white/5"><td className="px-2 py-1 font-mono">{r.id}</td><td className="px-2 py-1">{r.description}</td>
              <td className="px-2 py-1">{JSON.stringify(r.expected)}</td><td className="px-2 py-1">{JSON.stringify(r.observed)}</td>
              <td className="px-2 py-1">{r.passed ? <span className="text-emerald-300">✔ {t('admin.planTests.passed')}</span> : <span className="text-red-300">✖ {t('admin.planTests.failed')}</span>}</td></tr>)}</tbody></table></div>
          <p className="mt-2 text-[11px] text-white/50">{res.note}</p>
        </div>
      )}
    </Box>
  );
}

function Billing() {
  const { t } = useI18n();
  const { data, err } = useAdminData<{ enabled: boolean; gateway: string | null; missing: { id: string; label: string }[]; rules: string[] }>('/api/admin/billing');
  if (err) return <p role="alert" className="text-red-200">{err}</p>;
  if (!data) return <Loader2 className="h-5 w-5 animate-spin" aria-label={t('common.loading')} />;
  return (
    <div className="space-y-4">
      <Box title={t('admin.billing.status')}>
        <p className={`text-lg font-black ${data.enabled ? 'text-emerald-300' : 'text-amber-300'}`}>{data.enabled ? t('admin.billing.enabled') : t('admin.billing.disabled')}</p>
        <p className="text-sm text-white/70">{t('admin.billing.gateway')}: {data.gateway || t('admin.billing.noGateway')}</p>
      </Box>
      <Box title={t('admin.billing.missing')}>
        {data.missing.length === 0 ? <p className="text-sm text-white/50">—</p> : (
          <ul className="space-y-1 text-sm">{data.missing.map((m) => <li key={m.id} className="flex items-start gap-2"><Square className="mt-0.5 h-4 w-4 shrink-0 text-white/40" aria-hidden /><span>{m.label}</span><span className="sr-only">({t('admin.billing.pending')})</span></li>)}</ul>)}
      </Box>
      <Box title={t('admin.billing.rules')}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/80">{data.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </Box>
    </div>
  );
}

function Users() {
  const { t } = useI18n();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('admin');
  const [plan, setPlan] = useState('pro');
  const [days, setDays] = useState(30);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fail = (e: unknown) => setErr(e instanceof ApiError ? (t(`errors.${e.code}`) === e.code ? e.message : t(`errors.${e.code}`)) : t('errors.UNKNOWN'));
  const apply = async () => { setMsg(null); setErr(null); try { const r = await apiFetch<any>('/api/admin/users/role', { json: { user_id: userId.trim(), role } }); setMsg(r.changed ? t('admin.users.done', { previous: r.previous, current: r.current }) : t('admin.users.same')); } catch (e) { fail(e); } };
  const assign = async () => { setMsg(null); setErr(null); try { const r = await apiFetch<any>('/api/admin/subscriptions', { json: { user_id: userId.trim(), plan, status: 'active', days } }); setMsg(`${r.plan} → ${r.effective_plan} (${r.current_period_end})`); } catch (e) { fail(e); } };
  return (
    <Box title={t('admin.users.setRole')}>
      <label className="block text-sm"><span className="mb-1 block dt-text-muted">{t('admin.users.userId')}</span><Input value={userId} onChange={(e) => setUserId(e.target.value)} className="max-w-md bg-white/5 font-mono" /></label>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm"><span className="mb-1 block dt-text-muted">{t('admin.users.role')}</span><select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-md border border-white/10 bg-slate-900 px-2 py-2"><option value="admin">admin</option><option value="user">user</option></select></label>
        <Button onClick={() => void apply()} disabled={!userId.trim()}>{t('admin.users.apply')}</Button>
        <label className="text-sm"><span className="mb-1 block dt-text-muted">{t('settings.plan')}</span><select value={plan} onChange={(e) => setPlan(e.target.value)} className="rounded-md border border-white/10 bg-slate-900 px-2 py-2"><option value="free">Free</option><option value="pro">Pro</option><option value="premium">Premium</option></select></label>
        <label className="text-sm"><span className="mb-1 block dt-text-muted">dias</span><Input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-24 bg-white/5" /></label>
        <Button variant="outline" onClick={() => void assign()} disabled={!userId.trim()}>{t('admin.users.apply')} ({t('settings.plan')})</Button>
      </div>
      {msg && <p role="status" className="mt-3 text-sm text-emerald-300">{msg}</p>}{err && <p role="alert" className="mt-3 text-sm text-red-200">{err}</p>}
    </Box>
  );
}

function Log() {
  const { t, formatDate } = useI18n();
  const { data, err } = useAdminData<{ items: any[] }>('/api/admin/log');
  if (err) return <p role="alert" className="text-red-200">{err}</p>;
  return <Box><div className="overflow-x-auto"><table className="w-full text-xs"><caption className="sr-only">{t('admin.tabs.log')}</caption>
    <thead><tr className="text-left uppercase text-white/50">{['actor', 'action', 'target', 'when'].map((k) => <th scope="col" key={k} className="px-2 py-2">{t(`admin.log.${k}`)}</th>)}</tr></thead>
    <tbody>{(data?.items || []).map((l, i) => <tr key={i} className="border-t border-white/5"><td className="px-2 py-2">{l.actor}</td><td className="px-2 py-2">{l.action}</td><td className="px-2 py-2 font-mono">{l.target}</td><td className="px-2 py-2">{formatDate(l.at)}</td></tr>)}</tbody></table></div></Box>;
}

export default function AdminPage() {
  const { t } = useI18n();
  return (
    <div className="dt-page min-h-screen font-sans"><AppHeader />
      <main className="container mx-auto max-w-5xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-bold dt-text-primary">{t('admin.title')}</h1>
        <Tabs defaultValue="health">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-white/5 p-1">
            {(['health', 'audits', 'credits', 'plans', 'testing', 'billing', 'users', 'log'] as const).map((k) => <TabsTrigger key={k} value={k} className="text-xs">{t(`admin.tabs.${k}`)}</TabsTrigger>)}</TabsList>
          <TabsContent value="health"><Health /></TabsContent><TabsContent value="audits"><Audits /></TabsContent><TabsContent value="credits"><Credits /></TabsContent>
          <TabsContent value="plans"><Plans /></TabsContent><TabsContent value="testing"><PlanTesting /></TabsContent><TabsContent value="billing"><Billing /></TabsContent><TabsContent value="users"><Users /></TabsContent><TabsContent value="log"><Log /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
