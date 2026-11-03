import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Trash2 } from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import AuditErrorBoundary from '@/components/AuditErrorBoundary';
import AuditPanel from '@/components/audit/AuditPanel';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { ApiError, apiFetch } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface Row { id: string; url: string; domain: string; mode: string; status: string; error_code?: string; created_at: string; duration_ms?: number; findings_count?: number; has_report: boolean }
interface Hist { items: Row[]; total: number; visible_limit: number; hidden_by_plan: number }

export default function AppHome() {
  const { t, formatDate, s } = useI18n();
  const { me } = useAuth();
  const [hist, setHist] = useState<Hist | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const ctxKey = `${me?.plan}|${me?.test_context?.selected_plan ?? ''}`;

  const load = useCallback(async () => {
    try { setHist(await apiFetch<Hist>('/api/audits')); setErr(null); }
    catch (e) { setErr(e instanceof ApiError ? t(`errors.${e.code}`) : t('errors.UNKNOWN')); }
  }, [t]);
  useEffect(() => { void load(); }, [load, ctxKey]);

  const del = async (id: string) => {
    if (!window.confirm(t('app.confirmDelete'))) return;
    try { await apiFetch(`/api/audits/${id}`, { method: 'DELETE' }); toast({ title: t('app.deleted') }); void load(); }
    catch (e) { toast({ title: e instanceof ApiError ? t(`errors.${e.code}`) : t('errors.UNKNOWN'), variant: 'destructive' }); }
  };
  const ent = me?.entitlements;
  const isRealAdmin = me?.plan === 'admin' && !me?.test_context;
  return (
    <div className="dt-page min-h-screen font-sans">
      <AppHeader />
      <main className="container mx-auto space-y-6 px-4 py-8">
        <section className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2" aria-label={t('app.plan')}>
          <div className="dt-card rounded-2xl border border-white/10 p-4"><p className="text-xs dt-text-muted">{t('app.plan')}</p>
            <p className="text-2xl font-black">{me ? (isRealAdmin ? t('plans.admin') : ent?.plan_name) : '…'}</p>
            {me?.test_context && <p className="text-[11px] text-amber-300">{t('settings.testContext')}</p>}</div>
          <div className="dt-card rounded-2xl border border-white/10 p-4"><p className="text-xs dt-text-muted">{t('visibility.title')}</p>
            <p className="text-2xl font-black">{ent ? `${ent.visibility_percent}%` : '…'}</p>
            {!isRealAdmin && ent && ent.visibility_percent < 100 && <Link to="/configuracoes#planos" className="text-[11px] underline dt-text-muted">{t('visibility.comparePlans')}</Link>}</div>
        </section>

        <AuditErrorBoundary><AuditPanel onStateChange={setScanning} onDone={() => void load()} /></AuditErrorBoundary>

        {!scanning && (
          <section className="dt-card mx-auto max-w-5xl rounded-2xl border border-white/10 p-4" aria-labelledby="hist-title">
            <h2 id="hist-title" className="mb-3 text-lg font-bold dt-text-primary">{t('app.title')}</h2>
            {err && <p role="alert" className="text-sm text-red-200">{err}</p>}
            {!hist && !err && <p className="flex items-center gap-2 text-sm dt-text-muted"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading')}</p>}
            {hist && hist.items.length === 0 && <p className="text-sm dt-text-muted">{t('app.empty')}</p>}
            {hist && hist.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('app.title')}</caption>
                  <thead><tr className="text-left text-[11px] uppercase text-white/50">
                    <th scope="col" className="px-2 py-2">{t('app.table.site')}</th><th scope="col" className="px-2 py-2">{t('app.table.mode')}</th>
                    <th scope="col" className="px-2 py-2">{t('app.table.state')}</th><th scope="col" className="px-2 py-2">{t('app.table.findings')}</th>
                    <th scope="col" className="px-2 py-2">{t('app.table.when')}</th><th scope="col" className="px-2 py-2"><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
                  <tbody>{hist.items.map((a) => (
                    <tr key={a.id} className="border-t border-white/5">
                      <td className="px-2 py-2"><span className="break-all font-semibold">{a.domain || a.url}</span></td>
                      <td className="px-2 py-2">{a.mode === 'deep' ? t('app.modeDeep') : t('app.modeSingle')}</td>
                      <td className="px-2 py-2">{(s.report.state as Record<string, string>)[a.status] || a.status}{a.error_code ? ` (${a.error_code})` : ''}</td>
                      <td className="px-2 py-2">{a.findings_count ?? '—'}</td><td className="px-2 py-2">{formatDate(a.created_at)}</td>
                      <td className="flex gap-2 px-2 py-2">
                        {a.has_report ? <Link className="rounded-md border border-white/10 px-3 py-1 text-xs hover:bg-white/10" to={`/auditorias/${a.id}`}>{t('app.open')}</Link> : <span className="text-xs text-white/40">{t('app.noReport')}</span>}
                        <Button size="sm" variant="ghost" onClick={() => void del(a.id)} aria-label={`${t('app.delete')} ${a.domain}`}><Trash2 className="h-4 w-4" /></Button></td></tr>))}</tbody>
                </table>
              </div>
            )}
            {hist && hist.hidden_by_plan > 0 && <p className="mt-3 text-xs text-amber-200">{t('app.hiddenByPlan', { n: hist.hidden_by_plan })}</p>}
          </section>
        )}
      </main>
    </div>
  );
}
