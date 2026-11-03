import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, ExternalLink, Loader2, MessageSquare, X } from 'lucide-react';
import type { AuditReport, Citation } from './types';
import { useI18n } from '@/context/I18nContext';
import { apiFetch } from '@/lib/api';

interface Msg { role: 'user' | 'assistant'; text: string; citations?: Citation[]; mode?: string }

/** Opening message built ONLY from report counts — never "N violations". */
const opening = (r: AuditReport, lang: string) => {
  const obs = r.findings.filter((f) => f.status === 'OBSERVED' && f.severity !== 'info').length;
  const inf = r.findings.filter((f) => f.status === 'INFERRED').length;
  const unv = r.findings.filter((f) => f.status === 'UNVERIFIABLE').length;
  const url = r.target?.final_url || r.target?.url;
  if (lang.startsWith('pt')) return `Escaneei ${url} (status: ${r.status}). Tecnologias com evidência: ${r.tags.length}. Achados técnicos OBSERVADOS (não informativos): ${obs}; INFERIDOS: ${inf}; não verificáveis: ${unv}. Isto não é uma conclusão jurídica. Pergunte sobre qualquer achado.`;
  if (lang.startsWith('es')) return `Escaneé ${url} (estado: ${r.status}). Tecnologías con evidencia: ${r.tags.length}. Hallazgos técnicos OBSERVADOS (no informativos): ${obs}; INFERIDOS: ${inf}; no verificables: ${unv}. Esto no es una conclusión jurídica.`;
  return `I scanned ${url} (status: ${r.status}). Technologies with evidence: ${r.tags.length}. OBSERVED technical findings (non-info): ${obs}; INFERRED: ${inf}; unverifiable: ${unv}. This is not a legal conclusion.`;
};

export default function AssistantChat({ report }: { report: AuditReport }) {
  const { s, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useMemo(() => opening(report, language), [report, language]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  // send only the confirmed, already-redacted report subset (no raw evidence payloads)
  const ctx = useMemo(() => ({ status: report.status, target: report.target, capabilities: report.capabilities,
    limitations: report.limitations, tags: report.tags, findings: report.findings, scores: report.scores }), [report]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: q }]); setInput(''); setBusy(true);
    try {
      const d = await apiFetch<any>('/api/chat', { json: { message: q, report: ctx, language }, auth: false });
      setMsgs((m) => [...m, { role: 'assistant', text: d.answer || '—', citations: d.citations, mode: d.mode }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', text: s.chatUnavailable }]);
    } finally { setBusy(false); }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-500">
      <MessageSquare className="h-4 w-4" />{s.chatTitle.split('(')[0]}
    </button>
  );
  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-[520px] w-[380px] max-w-[95vw] flex-col rounded-2xl border border-white/10 bg-slate-950 text-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 p-3 text-sm font-semibold">
        <span className="flex items-center gap-2"><Bot className="h-4 w-4" />{s.chatTitle}</span>
        <button onClick={() => setOpen(false)} aria-label="close"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-2 overflow-auto p-3 text-xs">
        <div className="rounded-lg bg-white/5 p-2">{first}</div>
        {msgs.map((m, i) => (
          <div key={i} className={`whitespace-pre-wrap rounded-lg p-2 ${m.role === 'user' ? 'ml-8 bg-blue-600/30' : 'mr-4 bg-white/5'}`}>
            {m.text}
            {m.citations && m.citations.length > 0 && <div className="mt-2 space-y-1 border-t border-white/10 pt-1">
              {m.citations.map((c, j) => <a key={c.chunk_id} href={c.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] text-blue-300 hover:underline">[S{j + 1}] {c.document_title} — {c.section}<ExternalLink className="h-2.5 w-2.5" /></a>)}
            </div>}
            {m.mode && <div className="mt-1 text-[9px] text-white/30">mode: {m.mode}</div>}
          </div>))}
        {busy && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
      </div>
      <form className="flex gap-2 border-t border-white/10 p-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={s.chatPlaceholder} className="h-9 bg-white/5 text-xs" />
        <Button type="submit" size="sm" disabled={busy}>{s.send}</Button>
      </form>
    </div>
  );
}
