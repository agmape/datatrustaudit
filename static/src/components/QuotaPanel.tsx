import { Gauge, ShieldCheck } from 'lucide-react';
import type { Me } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

/** Compact usage summary rendered from /api/me (server truth). Shows nothing the API did not return. */
export default function QuotaPanel({ me, className = '' }: { me: Me; className?: string }) {
  const { t, formatDay } = useI18n();
  const q = me.quota;
  if (!q) return null;
  if (me.plan === 'admin' && !me.test_context) {
    return (
      <p className={`flex items-center gap-1.5 text-xs text-emerald-200 ${className}`} role="status">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />{t('quota.adminUnlimited')}
      </p>
    );
  }
  const parts: string[] = [];
  if (q.unlimited || q.limit == null) parts.push(t('quota.unlimited', { used: q.used }));
  else {
    const date = formatDay(q.renews_at || q.period_end);
    parts.push(t(q.period_kind === 'subscription' ? 'quota.analysesPeriod' : 'quota.analysesMonth', { used: q.used, limit: q.limit, date }));
  }
  if (q.domains && q.domains.limit != null) parts.push(t('quota.domains', { used: q.domains.used, limit: q.domains.limit }));
  if (q.daily && q.daily.limit != null) parts.push(t('quota.daily', { used: q.daily.used, limit: q.daily.limit }));
  return (
    <div className={`text-xs dt-text-muted ${className}`} role="status">
      <p className="flex flex-wrap items-center gap-1.5">
        <Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{parts.join(' · ')}</span>
        {q.is_test && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">{t('quota.testBalance')}</span>}
      </p>
      {q.simulated_exhausted && <p className="mt-1 text-amber-200">{t('banner.exhausted')}</p>}
      {q.domains && q.domains.list.length > 0 && <p className="mt-1 break-all text-[11px] text-white/40">{t('quota.domainsList', { list: q.domains.list.join(', ') })}</p>}
    </div>
  );
}
