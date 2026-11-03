import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import AuditErrorBoundary from '@/components/AuditErrorBoundary';
import ReportView from '@/components/audit/ReportView';
import AssistantChat from '@/components/audit/AssistantChat';
import type { AuditReport } from '@/components/audit/types';
import { useI18n } from '@/context/I18nContext';
import { ApiError, apiFetch } from '@/lib/api';

/** /auditorias/:id — reopens a saved audit (re-rendered in the CURRENT language from the stored canonical report). */
export default function AuditView() {
  const { id } = useParams();
  const { language, t } = useI18n();
  const [report, setReport] = useState<AuditReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setReport(null); setErr(null);
    apiFetch<any>(`/api/audits/${id}?language=${encodeURIComponent(language)}`)
      .then((d) => { if (!alive) return; if (d.success === false) setErr(d.message || t('app.noReport')); else setReport(d); })
      .catch((e) => { if (alive) setErr(e instanceof ApiError ? (t(`errors.${e.code}`) === e.code ? t('app.reopenFail') : t(`errors.${e.code}`)) : t('app.reopenFail')); });
    return () => { alive = false; };
  }, [id, language, t]);

  return (
    <div className="dt-page min-h-screen font-sans"><AppHeader />
      <main className="container mx-auto space-y-4 px-4 py-8">
        <Link to="/app" className="text-sm underline dt-text-muted">← {t('app.title')}</Link>
        {!report && !err && <p className="flex items-center gap-2 dt-text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading')}</p>}
        {err && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-100">{err}</p>}
        {report && <AuditErrorBoundary><ReportView r={report} /><AssistantChat report={report} /></AuditErrorBoundary>}
      </main>
    </div>
  );
}
