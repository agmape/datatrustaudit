import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, CheckCircle2, Copy, Download, ExternalLink, FileJson, HelpCircle, Info, Loader2, XCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useI18n } from '@/context/I18nContext';
import { apiFetch } from '@/lib/api';
import type { AuditReport, Evidence, Explanation, Finding } from './types';
import { ConfBadge, EvidenceButton, EvidenceList, SeverityBadge, StatusBadge, describeEvidence } from './Evidence';
import { exportEvidenceCsv, exportFindingsCsv, exportJson, summaryText } from './exporters';
import { sortFindings, summarize, vendorsOf } from './findings';
import ManagerView from './ManagerView';
import { Glossed } from './Glossed';
import { HiddenNote, VisibilityCard, countLabel } from './Visibility';

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`dt-card rounded-2xl border border-white/10 p-4 ${className}`}>{children}</div>
);
const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white/70">{children}</h3>;
const Th = ({ children }: { children?: React.ReactNode }) => <th scope="col" className="px-2 py-2 text-left text-[11px] font-semibold uppercase text-white/50">{children}</th>;
const Td = ({ children, className = '' }: { children?: React.ReactNode; className?: string }) => <td className={`px-2 py-2 align-top text-xs ${className}`}>{children}</td>;

function Firing({ v }: { v: boolean | null }) {
  const { s } = useI18n();
  return v === true ? <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />{s.yes}</span>
    : v === false ? <span className="inline-flex items-center gap-1 text-slate-300"><XCircle className="h-3.5 w-3.5" />{s.no}</span>
      : <span className="inline-flex items-center gap-1 text-white/40"><HelpCircle className="h-3.5 w-3.5" />{s.unknown}</span>;
}

// ── technical finding card with on-demand RAG explanation ───────────────────
function TechFinding({ f, idx }: { f: Finding; idx: Map<string, Evidence> }) {
  const { s, t, language } = useI18n();
  const [exp, setExp] = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(false);
  const L = f.localized;
  const explain = async () => {
    setLoading(true);
    try {
      const d = await apiFetch<any>('/api/explain', { json: { findings: [{ rule_id: f.rule_id, title: f.title, status: f.status }], language }, auth: false });
      setExp(d?.explanations?.[f.rule_id] || { status: 'insufficient_sources', reason: d?.reason });
    } catch { setExp({ status: 'insufficient_sources', reason: t('errors.NETWORK') }); } finally { setLoading(false); }
  };
  return (
    <div id={`tech-${f.id}`} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-white/40">{f.id}</span>
        <StatusBadge status={f.status} label={L?.status_label} /><SeverityBadge severity={f.severity} label={L?.priority} /><ConfBadge c={f.confidence} />
        <span className="font-mono text-[10px] text-white/40">{f.rule_id}</span>
        <span className="text-[10px] uppercase text-white/40">{(s.report.categories as Record<string, string>)[f.category] || f.category}</span>
      </div>
      <h4 className="mt-2 font-semibold text-white"><Glossed text={L?.title || f.title} /></h4>
      <p className="mt-1 text-sm text-white/70"><Glossed text={L?.found || f.description} /></p>
      <div className="mt-2"><EvidenceButton ids={f.evidence_ids} index={idx} /></div>
      {L?.ask && <p className="mt-2 text-xs text-white/70"><b>{s.report.ask}:</b> {L.ask}</p>}
      {L?.confirm && <p className="mt-1 text-xs text-white/70"><b>{s.howToVerify}:</b> {L.confirm}</p>}
      {L?.status_condition && <p className="mt-1 text-[11px] italic text-white/50">{L.status_condition}</p>}
      {f.limitations?.map((l, i) => <p key={i} className="mt-1 text-[11px] italic text-white/50">⚠ {l}</p>)}
      {f.legal_context && (
        <details className="mt-2 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-2 text-xs">
          <summary className="cursor-pointer font-semibold text-fuchsia-200">{s.legalContext}</summary>
          <p className="mt-1 text-white/70">{f.legal_context.text}</p><p className="mt-1 text-[10px] text-white/40">{f.legal_context.frameworks.join(' · ')}</p>
        </details>
      )}
      <div className="mt-2">
        {!exp && <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-blue-300" onClick={explain} disabled={loading}>
          {loading ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />{s.explaining}</> : s.explain}</Button>}
        {exp && exp.status !== 'ok' && <p className="text-[11px] italic text-white/50">{s.insufficient}</p>}
        {exp && exp.status === 'ok' && (
          <div className="mt-1 space-y-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-2 text-xs">
            <p><b>{s.howToVerify}:</b> {exp.how_to_verify}</p><p><b>{s.recommendation}:</b> {exp.how_to_fix}</p>
            <p className="text-[11px] italic text-white/50">{exp.limitations}</p><p className="font-semibold">{s.sources}:</p>
            {exp.citations?.map((c) => (
              <div key={c.chunk_id} className="rounded border border-white/10 bg-black/20 p-2">
                <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-300 hover:underline">{c.document_title} — {c.section} <ExternalLink className="h-3 w-3" /></a>
                <div className="text-[10px] text-white/40">{c.publisher} · {c.jurisdiction} · {c.version || ''} · {c.retrieved_at}</div>
                <blockquote className="mt-1 border-l-2 border-white/20 pl-2 text-[11px] text-white/70">{c.excerpt}</blockquote>
              </div>))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────
export default function ReportView({ r }: { r: AuditReport }) {
  const { s, t, formatDate, language } = useI18n();
  const idx = useMemo(() => new Map((r.evidence || []).map((e) => [e.id, e])), [r.evidence]);
  const vis = r.visibility;
  const [view, setView] = useState<'manager' | 'technical'>(() => (sessionStorage.getItem('dt-view') as any) === 'technical' ? 'technical' : 'manager');
  const [tab, setTab] = useState('overview');
  useEffect(() => { sessionStorage.setItem('dt-view', view); }, [view]);

  const [fStatus, setFStatus] = useState('all');
  const [fSev, setFSev] = useState('all');
  const [fCat, setFCat] = useState('all');
  const [fVendor, setFVendor] = useState('all');
  const [fPage, setFPage] = useState('all');
  const [fText, setFText] = useState('');
  const [evFilter, setEvFilter] = useState('');
  const [evType, setEvType] = useState('all');
  const runtime = !!r.capabilities?.runtime_js;
  const sum = useMemo(() => summarize(r.findings), [r.findings]);

  const findings = useMemo(() => sortFindings(r.findings.filter((f) =>
    (fStatus === 'all' || f.status === fStatus) && (fSev === 'all' || f.severity === fSev) && (fCat === 'all' || f.category === fCat)
    && (fVendor === 'all' || f.vendor === fVendor) && (fPage === 'all' || f.pages.includes(fPage))
    && (!fText || JSON.stringify([f.id, f.rule_id, f.localized?.title, f.localized?.found, f.evidence_ids]).toLowerCase().includes(fText.toLowerCase())))), [r.findings, fStatus, fSev, fCat, fVendor, fPage, fText]);
  const evTypes = Array.from(new Set(r.evidence.map((e) => e.source_type))).sort();
  const evShown = r.evidence.filter((e) => (evType === 'all' || e.source_type === evType) && (!evFilter || JSON.stringify(e).toLowerCase().includes(evFilter.toLowerCase()))).slice(0, 400);
  const timeline = r.evidence.filter((e) => typeof e.t_ms === 'number' && ['network', 'script_url', 'datalayer', 'gtag', 'fbq', 'cmp', 'console'].includes(e.source_type))
    .sort((a, b) => (a.phase === b.phase ? a.t_ms! - b.t_ms! : a.phase.localeCompare(b.phase)));
  const copy = async () => { await navigator.clipboard.writeText(summaryText(r, language)); toast({ title: s.copySummary }); };
  const goTech = (findingId: string) => { setView('technical'); setTab('findings'); setFText(findingId); setFStatus('all'); setFSev('all'); setFCat('all'); setFVendor('all'); setFPage('all'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const cats = Object.keys(sum.byCategory);
  const sel = 'rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs';

  return (
    <div className="space-y-4 text-white">
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${r.status === 'completed' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}>{t(`report.state.${r.status}`)}</span>
              <span className="text-xs text-white/40">{r.mode === 'deep' ? s.deep : s.single}</span>
            </div>
            <h2 className="mt-1 break-all text-lg font-bold">{r.target?.final_url || r.target?.url}</h2>
            <p className="text-[11px] text-white/40">{s.scanId}: <span className="font-mono">{r.audit_id || r.scan_id}</span> · {formatDate(r.finished_at || r.started_at)} · {s.duration}: {Math.round((r.duration_ms || 0) / 1000)}s · HTTP {r.target?.http_status ?? '?'} · motor {r.engine_version} · pontuação {r.scoring_version}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => exportJson(r)}><FileJson className="mr-1 h-4 w-4" />{s.exportJson}</Button>
            <Button size="sm" variant="outline" onClick={() => exportFindingsCsv(r, language)}><Download className="mr-1 h-4 w-4" />{s.exportFindings}</Button>
            <Button size="sm" variant="outline" onClick={() => exportEvidenceCsv(r, language)}><Download className="mr-1 h-4 w-4" />{s.exportEvidence}</Button>
            <Button size="sm" variant="outline" onClick={copy}><Copy className="mr-1 h-4 w-4" />{s.copySummary}</Button>
          </div>
        </div>
        {(r.status !== 'completed' || !runtime) && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100" role="status">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><b>{s.partialWarn}.</b> {!runtime && s.staticWarn} {r.message && runtime ? r.message : ''}</div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label={s.report.switchHint} className="inline-flex rounded-xl border border-white/10 p-1">
            {(['manager', 'technical'] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === v ? 'bg-blue-600 text-white' : 'dt-text-muted hover:text-white'}`}>
                {v === 'manager' ? s.report.managerView : s.report.technicalView}</button>))}
          </div>
          <p className="text-xs dt-text-muted">{s.report.switchHint} · {t('report.topProblems')}: {sum.confirmed} · {t('report.toVerify')}: {sum.toVerify} · {s.findings}: {sum.total}</p>
        </div>
      </Card>

      <VisibilityCard v={vis} />

      {view === 'manager' ? <ManagerView r={r} onTech={goTech} /> : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-white/5 p-1">
            {[['overview', s.overview], ['findings', `${s.findings} ${countLabel(vis, 'findings', r.findings.length)}`], ['tags', `${s.tags} ${countLabel(vis, 'tags', r.tags.length)}`],
              ['consent', s.consent], ['events', s.events], ['cookies', s.cookies], ['network', s.network], ['timeline', s.timeline],
              ['evidence', `${s.evidence} ${countLabel(vis, 'evidence', r.evidence.length)}`], ...(r.mode === 'deep' ? [['pages', `${s.pages} (${r.pages.length})`]] : []), ['methodology', s.methodology]]
              .map(([v, l]) => <TabsTrigger key={v} value={v} className="text-xs">{l}</TabsTrigger>)}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <Card><p className="text-[11px] uppercase text-white/50">{s.overall}</p>
                <p className="text-4xl font-black">{r.scores.overall.score ?? s.notMeasured}</p>
                <p className="text-[11px] text-white/50">{s.coverage}: {Math.round((r.scores.overall.coverage || 0) * 100)}%</p>
                <p className="text-[11px] text-white/50">{s.confidence}: {r.scores.overall.confidence || s.notMeasured}</p>
                {r.scores.overall.score == null && r.scores.overall.null_reason && <p className="mt-1 text-[11px] italic text-amber-200/80">{r.scores.overall.null_reason}</p>}</Card>
              {Object.entries(r.scores.axes || {}).map(([k, a]) => (
                <Card key={k}><p className="text-[11px] uppercase text-white/50">{(s.axisNames as Record<string, string>)[k] || k}</p>
                  <p className="text-3xl font-black">{a.score ?? s.notMeasured}{a.score != null && <span className="text-base text-white/40">/100</span>}</p>
                  <p className="text-[11px] text-white/50">{s.coverage}: {Math.round(a.coverage * 100)}% · {a.passed}/{a.applicable}</p>
                  <p className="text-[11px] text-white/50">{s.confidence}: {a.confidence || s.notMeasured}</p>
                  {a.score == null && a.null_reason && <p className="mt-1 text-[11px] italic text-white/50">{a.null_reason}</p>}
                  <details className="mt-1 text-[11px]"><summary className="cursor-pointer text-blue-300">checks</summary>
                    {a.checks.map((c) => (<div key={c.id} className="mt-1"><span className={c.applicable ? (c.passed ? 'text-emerald-300' : 'text-red-300') : 'text-white/40'}>
                      {c.applicable ? (c.passed ? '✔' : '✖') : '–'} {c.label}</span>{!c.applicable && c.reason && <span className="text-white/40"> ({c.reason})</span>}</div>))}
                    <p className="mt-1 text-white/40">{a.formula}</p></details></Card>))}
            </div>
            <Card><H>{s.indicators}</H>
              {r.findings.filter((f) => f.severity !== 'info').length === 0 ? <p className="text-sm text-white/60">{s.noFindings}</p> :
                <div className="space-y-2">{sortFindings(r.findings.filter((f) => f.severity !== 'info')).slice(0, 8).map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center gap-2 border-b border-white/5 pb-2 text-sm">
                    <StatusBadge status={f.status} label={f.localized?.status_label} /><SeverityBadge severity={f.severity} label={f.localized?.priority} />
                    <span className="flex-1">{f.localized?.title}</span><EvidenceButton ids={f.evidence_ids} index={idx} /></div>))}</div>}<HiddenNote v={vis} list="findings" className="mt-2" /></Card>
            <Card><H>{s.tags}</H>{r.tags.length === 0 ? <p className="text-sm text-white/60">{s.noTags}</p> :
              <div className="flex flex-wrap gap-2">{r.tags.map((tg) => (<span key={tg.vendor_id} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
                {tg.technology}{tg.ids.length ? ` · ${tg.ids.join(', ')}` : ''} · <Firing v={tg.observed_firing} /></span>))}</div>}<HiddenNote v={vis} list="tags" className="mt-2" /></Card>
          </TabsContent>

          <TabsContent value="findings" className="space-y-3">
            <Card>
              <H>{s.report.filtersTitle}</H>
              <div className="flex flex-wrap items-center gap-2">
                <Input placeholder={s.filter} value={fText} onChange={(e) => setFText(e.target.value)} className="h-8 max-w-xs bg-white/5 text-xs" aria-label={s.filter} />
                <select className={sel} value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label={s.status}>
                  <option value="all">{s.status}: {s.all}</option>{Object.keys(s.statusLabel).map((k) => <option key={k} value={k}>{(s.statusLabel as Record<string, string>)[k]} ({sum.byStatus[k] || 0})</option>)}</select>
                <select className={sel} value={fSev} onChange={(e) => setFSev(e.target.value)} aria-label={s.report.priority}>
                  <option value="all">{s.report.priority}: {s.all}</option>{Object.keys(s.sevLabel).map((k) => <option key={k} value={k}>{(s.sevLabel as Record<string, string>)[k]} ({sum.bySeverity[k] || 0})</option>)}</select>
                <select className={sel} value={fCat} onChange={(e) => setFCat(e.target.value)} aria-label={s.report.technical.category}>
                  <option value="all">{s.report.category_all}</option>{cats.map((k) => <option key={k} value={k}>{(s.report.categories as Record<string, string>)[k] || k}</option>)}</select>
                <select className={sel} value={fVendor} onChange={(e) => setFVendor(e.target.value)} aria-label={s.report.technical.vendor}>
                  <option value="all">{s.report.vendor_all}</option>{vendorsOf(r).map((k) => <option key={k} value={k}>{k}</option>)}</select>
                <select className={sel} value={fPage} onChange={(e) => setFPage(e.target.value)} aria-label={s.pages}>
                  <option value="all">{s.report.page_all}</option>{r.pages.map((p) => <option key={p.url} value={p.url}>{p.url}</option>)}</select>
                <span className="text-xs text-white/50" role="status">{t('report.results', { n: findings.length })}</span>
              </div>
              <HiddenNote v={vis} list="findings" className="mt-2" />
            </Card>
            {findings.length === 0 ? <p className="text-sm text-white/60">{s.noFindings}</p> : findings.map((f) => <TechFinding key={f.id} f={f} idx={idx} />)}
          </TabsContent>

          <TabsContent value="tags"><Card className="overflow-x-auto"><HiddenNote v={vis} list="tags" className="mb-2" />
            {r.tags.length === 0 ? <p className="text-sm text-white/60">{s.noTags}</p> : (
              <table className="w-full"><caption className="sr-only">{s.tags}</caption><thead><tr><Th>{s.tags}</Th><Th>{s.ids}</Th><Th>{s.firing}</Th><Th>{s.methods}</Th><Th>{s.confidence}</Th><Th>{s.pages}</Th><Th /></tr></thead>
                <tbody>{r.tags.map((tg) => (
                  <tr key={tg.vendor_id} className="border-t border-white/5">
                    <Td><b>{tg.technology}</b><div className="text-white/40">{tg.category_label}</div>{tg.docs && <a className="text-[10px] text-blue-300" href={tg.docs} target="_blank" rel="noreferrer">docs</a>}</Td>
                    <Td className="font-mono">{tg.ids.join(', ') || '—'}{tg.placeholder_ids_in_source.length > 0 && <div className="text-amber-300">exemplo: {tg.placeholder_ids_in_source.join(', ')}</div>}</Td>
                    <Td><Firing v={tg.observed_firing} /><div className="text-[10px] text-white/40">{tg.observed_firing_note}</div></Td>
                    <Td className="text-white/70">{tg.detection_methods.join(', ')}</Td><Td>{tg.confidence}</Td><Td className="text-white/50">{tg.pages.length}</Td>
                    <Td><EvidenceButton ids={tg.evidence_ids} index={idx} /></Td></tr>))}</tbody></table>)}</Card></TabsContent>

          <TabsContent value="consent" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              {(['baseline', 'reject', 'accept'] as const).map((p) => { const ph = r.consent?.phases?.[p]; const it = ph?.interaction; return (
                <Card key={p}><p className="text-xs font-bold uppercase">{p}</p><p className="text-[11px] text-white/50">{s.status}: {ph?.status || '—'}</p>
                  {it && <div className="mt-2 text-xs"><p><b>{s.interaction}:</b> {it.status}</p>{it.method && <p className="text-white/60">método: {it.method}{it.adapter ? ` (${it.adapter})` : ''}</p>}
                    {it.verified_by?.length ? <p className="text-white/60">verificado por: {it.verified_by.join(', ')}</p> : null}{it.detail && <p className="mt-1 italic text-white/50">{it.detail}</p>}</div>}</Card>); })}
            </div>
            <Card className="text-sm">
              <p>{s.cmpObserved}: <b>{r.consent?.cmp_observed == null ? s.unknown : r.consent.cmp_observed ? `${s.yes} (${r.consent.cmp_vendors.join(', ') || 'banner'})` : s.no}</b></p>
              <p>{s.bannerVisible}: <b>{r.consent?.banner_visible_in_baseline == null ? s.unknown : r.consent.banner_visible_in_baseline ? s.yes : s.no}</b></p>
              <div className="mt-3"><p className="font-semibold"><Glossed text={s.consentMode} /></p>
                <p className="text-xs text-white/60">observado: {String(r.consent?.consent_mode?.observed ?? s.unknown)} · sinais v2: {String(r.consent?.consent_mode?.v2_signals ?? '—')}</p>
                {r.consent?.consent_mode?.default && <pre className="mt-1 overflow-auto rounded bg-black/30 p-2 text-[11px]">{s.defaultState}: {JSON.stringify(r.consent.consent_mode.default)}</pre>}
                {r.consent?.consent_mode?.gcs_values && Object.keys(r.consent.consent_mode.gcs_values).length > 0 && <pre className="mt-1 overflow-auto rounded bg-black/30 p-2 text-[11px]">{s.gcs}: {JSON.stringify(r.consent.consent_mode.gcs_values)}</pre>}
                {r.consent?.consent_mode?.note && <p className="text-[11px] italic text-white/50">{r.consent.consent_mode.note}</p>}</div>
            </Card>
            {sortFindings(r.findings.filter((f) => f.category === 'consent')).map((f) => <TechFinding key={f.id} f={f} idx={idx} />)}
          </TabsContent>

          <TabsContent value="events" className="space-y-3"><Card className="overflow-x-auto"><HiddenNote v={vis} list="events" className="mb-2" />
            {r.events.events.length === 0 ? <p className="text-sm text-white/60">{s.noFindings}</p> : (
              <table className="w-full"><caption className="sr-only">{s.events}</caption><thead><tr><Th>{s.events}</Th><Th>{s.report.eventGlossary}</Th><Th>{s.sentToGa4}</Th><Th>origem</Th><Th>{s.missing}</Th><Th /></tr></thead>
                <tbody>{r.events.events.map((e) => (
                  <tr key={e.name} className="border-t border-white/5">
                    <Td><b className="font-mono">{e.name}</b>{e.recommended_ga4_event && <span className="ml-1 text-[10px] text-blue-300">GA4</span>}<div className="text-[10px] text-white/40">{e.measurement_ids.join(', ')}</div></Td>
                    <Td><b>{e.glossary?.label}</b><div className="text-white/60">{e.glossary?.explanation}</div>{e.glossary?.caveat && <div className="text-[10px] italic text-amber-200/70">{s.report.caveat}: {e.glossary.caveat}</div>}</Td>
                    <Td>{e.name.startsWith('meta:') ? '—' : <Firing v={e.sent_to_ga4} />}{e.note && <div className="text-[10px] text-white/40">{e.note}</div>}</Td>
                    <Td className="text-white/60">{Object.entries(e.sources).map(([k, v]) => `${k}: ${v}`).join(' · ')}</Td>
                    <Td className="text-red-200">{e.validation_issues.map((v) => `${v.source}: ${v.missing.join(', ')}`).join(' | ') || '—'}</Td>
                    <Td><EvidenceButton ids={e.evidence_ids} index={idx} /></Td></tr>))}</tbody></table>)}</Card>
            {r.events.code_candidates.length > 0 && <Card><H>{s.codeOnly}</H><HiddenNote v={vis} list="code_candidates" className="mb-2" />{r.events.code_candidates.map((c) => <p key={c.name} className="text-xs"><b className="font-mono">{c.name}</b> — {c.note} (HTML: {c.html_lines.join(', ')})</p>)}</Card>}
          </TabsContent>

          <TabsContent value="cookies" className="space-y-3">
            {!runtime && <Card><p className="text-sm text-amber-200">{s.staticWarn}</p></Card>}
            <Card className="overflow-x-auto"><H>Cookies {countLabel(vis, 'cookies', r.cookies.length)}</H><HiddenNote v={vis} list="cookies" className="mb-2" />
              <table className="w-full"><caption className="sr-only">Cookies</caption><thead><tr><Th>nome</Th><Th>domínio</Th><Th>terceiro</Th><Th>fases</Th><Th>atributos</Th><Th /></tr></thead>
                <tbody>{r.cookies.map((c) => (<tr key={c.name + c.domain} className="border-t border-white/5">
                  <Td className="font-mono">{c.name}{c.known_tracking_cookie && <span className="ml-1 rounded bg-orange-500/20 px-1 text-[10px] text-orange-200">rastreamento</span>}</Td>
                  <Td>{c.domain}</Td><Td>{c.third_party ? s.yes : '—'}</Td><Td className="text-white/60">{c.observed_in.join(', ')}</Td>
                  <Td className="text-[10px] text-white/60">{['secure', 'httpOnly', 'sameSite', 'session', 'expires', 'value_length'].map((k) => c.attributes[k] != null ? `${k}=${c.attributes[k]}` : null).filter(Boolean).join(' · ')}</Td>
                  <Td><EvidenceButton ids={c.evidence_ids} index={idx} /></Td></tr>))}</tbody></table>
              <p className="mt-2 text-[10px] text-white/40">Valores de cookies nunca são armazenados nem exibidos.</p></Card>
            <Card className="overflow-x-auto"><H>Storage {countLabel(vis, 'storage', r.storage.length)}</H><HiddenNote v={vis} list="storage" className="mb-2" />
              <table className="w-full"><caption className="sr-only">Storage</caption><thead><tr><Th>tipo</Th><Th>chave</Th><Th>fases</Th><Th>valor</Th><Th /></tr></thead>
                <tbody>{r.storage.map((st) => (<tr key={st.type + st.key} className="border-t border-white/5"><Td>{st.type}</Td><Td className="font-mono">{st.key}</Td><Td>{st.phases.join(', ')}</Td>
                  <Td className="text-[10px] text-white/60">tamanho {st.value_length}{st.value_pii_kinds?.length ? <span className="ml-1 text-red-200">dado pessoal: {st.value_pii_kinds.join(', ')}</span> : ''}</Td>
                  <Td><EvidenceButton ids={st.evidence_ids} index={idx} /></Td></tr>))}</tbody></table></Card>
          </TabsContent>

          <TabsContent value="network" className="space-y-3"><Card className="overflow-x-auto"><HiddenNote v={vis} list="network_domains" className="mb-2" />
            <table className="w-full"><caption className="sr-only">{s.network}</caption><thead><tr><Th>domínio</Th><Th>terceiro</Th><Th>requisições</Th><Th>coleta</Th><Th>fornecedores</Th><Th>fases</Th></tr></thead>
              <tbody>{(r.network?.domains || []).map((d) => (<tr key={d.domain} className="border-t border-white/5"><Td className="font-mono">{d.domain}</Td><Td>{d.third_party ? s.yes : '—'}</Td><Td>{d.requests}</Td><Td>{d.collection_requests}</Td><Td>{d.vendors.join(', ')}</Td><Td className="text-white/60">{d.phases.join(', ')}</Td></tr>))}</tbody></table>
            <p className="mt-2 text-[10px] text-white/40">{r.network?.note}</p></Card>
            {(r.network?.blocked_by_guard?.length || 0) > 0 && <Card><H>{s.blocked}</H>{r.network!.blocked_by_guard.map((b, i) => <p key={i} className="font-mono text-xs">{b.host} — {b.reason} ({b.resource_type})</p>)}</Card>}
          </TabsContent>

          <TabsContent value="timeline"><Card>
            <p className="mb-2 text-[11px] text-white/40">t = ms desde o início da navegação em cada fase isolada (dataLayer ≈ ±150 ms).</p>
            <div className="max-h-[60vh] space-y-1 overflow-auto font-mono text-[11px]">{timeline.map((e) => (
              <div key={e.id} className="flex gap-2 border-b border-white/5 py-1"><span className="w-16 shrink-0 text-white/40">{e.phase}</span><span className="w-16 shrink-0 text-right text-white/60">{e.t_ms}ms</span>
                <span className="w-20 shrink-0 text-blue-300">{e.source_type}</span>{e.after_interaction === true && <span className="shrink-0 text-red-300">▲clique</span>}
                <span className="break-all text-white/80">{describeEvidence(e)}</span></div>))}</div></Card></TabsContent>

          <TabsContent value="evidence" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input placeholder={s.filter} value={evFilter} onChange={(e) => setEvFilter(e.target.value)} className="max-w-xs bg-white/5" aria-label={s.filter} />
              <select value={evType} onChange={(e) => setEvType(e.target.value)} className={sel} aria-label="tipo de evidência"><option value="all">{s.all}</option>{evTypes.map((x) => <option key={x} value={x}>{x}</option>)}</select>
            </div>
            <HiddenNote v={vis} list="evidence" />
            <EvidenceList items={evShown} />
          </TabsContent>

          {r.mode === 'deep' && <TabsContent value="pages" className="space-y-2">
            {r.pages.map((p) => (<Card key={p.url}><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded bg-white/10 px-2 py-0.5 uppercase">{p.status}</span><span className="rounded bg-white/5 px-2 py-0.5">{p.reason}</span><span className="break-all font-mono">{p.url}</span></div>
              <p className="mt-1 text-[11px] text-white/50">modo: {p.mode} · HTTP {p.http_status ?? '?'} · evidências: {p.evidence_count ?? 0} · achados: {(p.finding_ids || []).join(', ') || '—'}{(p.finding_ids_total ?? 0) > (p.finding_ids || []).length ? ` (${t('visibility.pageFindings', { released: (p.finding_ids || []).length, total: p.finding_ids_total ?? 0 })})` : ''}</p>
              {p.error && <p className="text-[11px] text-red-300">{p.error}</p>}{p.limitations?.map((l, i) => <p key={i} className="text-[11px] italic text-white/40">⚠ {l}</p>)}</Card>))}
            {r.crawl && <p className="text-[11px] text-white/40">links do mesmo domínio descobertos: {r.crawl.discovered} · ignorados: {JSON.stringify(r.crawl.skipped)}</p>}
          </TabsContent>}

          <TabsContent value="methodology" className="space-y-3">
            <Card><H>{s.methodology}</H><ul className="list-disc space-y-1 pl-5 text-sm text-white/70">{r.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></Card>
            <Card><H>{s.policyLinks}</H><HiddenNote v={vis} list="policy_links" className="mb-2" />{(r.policy_links || []).length === 0 ? <p className="text-sm text-white/60">—</p> :
              r.policy_links!.map((p) => <p key={p.evidence_id} className="text-xs"><span className="text-white/60">{p.text}</span> → <span className="font-mono">{p.url}</span></p>)}</Card>
            <Card><H>Etapas</H>{(r.stages || []).map((st, i) => <p key={i} className="font-mono text-[11px]"><span className={st.status === 'ok' || st.status === 'completed' ? 'text-emerald-300' : 'text-amber-300'}>{st.status}</span> {st.name} {st.duration_ms}ms {st.error ? `— ${st.error}` : ''}</p>)}</Card>
            <Card className="flex gap-2 text-xs text-white/60"><Info className="h-4 w-4 shrink-0" /><span><b>{s.disclaimerTitle}:</b> {r.disclaimer}</span></Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
