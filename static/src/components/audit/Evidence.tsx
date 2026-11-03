import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Evidence, FindingStatus, Severity } from './types';
import { useI18n } from '@/context/I18nContext';

const statusCls: Record<string, string> = {
  OBSERVED: 'bg-blue-600/20 text-blue-300 border-blue-500/40',
  INFERRED: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  NOT_OBSERVED: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
  UNVERIFIABLE: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
};
const sevCls: Record<string, string> = {
  critical: 'bg-red-600/25 text-red-200 border-red-500/50',
  high: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
  medium: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40',
  low: 'bg-sky-500/15 text-sky-200 border-sky-500/40',
  info: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  needs_manual_review: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/40',
};

// Labels come from the server-localized report (``label``) or, as a fallback, from the dictionary.
export const StatusBadge = ({ status, label }: { status: FindingStatus | string; label?: string }) => {
  const { s } = useI18n();
  const mark = status === 'OBSERVED' ? '● ' : status === 'INFERRED' ? '◐ ' : status === 'NOT_OBSERVED' ? '○ ' : '? ';   // not color-only
  return <Badge variant="outline" className={`text-[10px] font-bold tracking-wide ${statusCls[status] || ''}`}>{mark}{label || (s.statusLabel as Record<string, string>)[status] || status}</Badge>;
};
export const SeverityBadge = ({ severity, label }: { severity: Severity | string; label?: string }) => {
  const { s } = useI18n();
  return <Badge variant="outline" className={`text-[10px] ${sevCls[severity] || ''}`}>{label || (s.sevLabel as Record<string, string>)[severity] || severity}</Badge>;
};
export const ConfBadge = ({ c }: { c?: string | null }) => {
  const { s } = useI18n();
  return <Badge variant="outline" className="text-[10px] border-white/15 text-white/60">{s.confidence}: {c || s.notMeasured}</Badge>;
};

/** Renders a compact, factual one-line description of an evidence item. */
export const describeEvidence = (e: Evidence): string => {
  switch (e.source_type) {
    case 'network': return `${e.request_method || ''} ${e.request_url || ''}`;
    case 'script_url': return `script ${e.script_url || e.request_url || ''}`;
    case 'html_source': return e.script_url ? `<script src="${e.script_url}"> (line ${e.html_line})` : `HTML line ${e.html_line}: ${e.snippet || ''}`;
    case 'rendered_dom': return `rendered DOM <script src="${e.script_url}">`;
    case 'cookie': return `cookie ${e.cookie_name} @ ${e.cookie_domain} (${(e.cookie_attributes as any)?.stage || ''})`;
    case 'local_storage': case 'session_storage': return `${e.source_type} key "${e.storage_key}"`;
    case 'datalayer': return `dataLayer.push ${JSON.stringify(e.datalayer_event).slice(0, 160)}`;
    case 'gtag': return `gtag(${(e.gtag_call || []).map((a) => JSON.stringify(a)).join(', ').slice(0, 160)})`;
    case 'fbq': return `fbq(${(e.fbq_call || []).map((a) => JSON.stringify(a)).join(', ').slice(0, 160)})`;
    case 'cmp': return `CMP ${JSON.stringify(e.cmp_signal).slice(0, 160)}`;
    case 'consent_mode': return `Consent Mode state ${JSON.stringify(e.consent_state).slice(0, 160)}`;
    case 'policy_link': return `link "${e.snippet}" → ${e.request_url}`;
    case 'runtime_js': return `window globals ${JSON.stringify(e.parsed?.globals)}`;
    case 'navigation': return `navigation ${e.request_url} HTTP ${e.parsed?.http_status ?? '?'}`;
    case 'console': return `console: ${e.snippet}`;
    default: return e.source_type;
  }
};

export const EvidenceList = ({ items }: { items: Evidence[] }) => (
  <div className="space-y-2">
    {items.map((e) => (
      <details key={e.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
        <summary className="cursor-pointer select-none">
          <span className="font-mono text-blue-300">{e.id}</span>
          <span className="mx-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase">{e.source_type}</span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">{e.phase}</span>
          {e.after_interaction === true && <span className="ml-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-200">after click</span>}
          {e.after_interaction === false && <span className="ml-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px]">before click</span>}
          {typeof e.t_ms === 'number' && <span className="ml-1 text-white/40">t≈{e.t_ms}ms</span>}
          <div className="mt-1 break-all font-mono text-white/70">{describeEvidence(e)}</div>
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-black/40 p-2 text-[11px] text-white/80">{JSON.stringify(e, null, 2)}</pre>
      </details>
    ))}
  </div>
);

/** "Where exactly was this observed?" — button that opens the cited evidence.
 *  Ids that are not in the received report (withheld by the plan's visibility) are never rendered as fake rows. */
export const EvidenceButton = ({ ids, index, label }: { ids: string[]; index: Map<string, Evidence>; label?: string }) => {
  const { s, t } = useI18n();
  const [open, setOpen] = useState(false);
  const items = useMemo(() => (ids || []).map((i) => index.get(i)).filter(Boolean) as Evidence[], [ids, index]);
  if (!ids?.length) return <span className="text-[11px] italic text-white/40">{s.noEvidence}</span>;
  if (!items.length) return <span className="text-[11px] italic text-white/40">{t('visibility.evidenceUnavailable')}</span>;
  const missing = ids.length - items.length;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-semibold text-blue-300 underline-offset-2 hover:underline">
        {label || s.whereObserved} ({items.length})
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl border-white/10 bg-slate-950 text-white">
          <DialogHeader><DialogTitle>{s.whereObserved}</DialogTitle></DialogHeader>
          {missing > 0 && <p className="text-xs italic text-indigo-200">{t('visibility.evidenceMissing', { n: missing })}</p>}
          <ScrollArea className="max-h-[70vh] pr-3"><EvidenceList items={items} /></ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};
