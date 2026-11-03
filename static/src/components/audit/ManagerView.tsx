import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ClipboardCopy, Info, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useI18n } from '@/context/I18nContext';
import type { AuditReport, Finding } from './types';
import { Glossed } from './Glossed';
import { SeverityBadge, StatusBadge } from './Evidence';
import { HiddenNote } from './Visibility';
import { isActionable, isConfirmedProblem, isToVerify, planText, sortFindings, summarize } from './findings';

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <section className={`dt-card rounded-2xl border border-white/10 p-5 ${className}`}>{children}</section>
);
const H2 = ({ children, id }: { children: React.ReactNode; id?: string }) => <h2 id={id} className="mb-3 text-base font-bold dt-text-primary">{children}</h2>;

const copy = async (text: string, ok: string) => {
  try { await navigator.clipboard.writeText(text); toast({ title: ok }); } catch { toast({ title: ok + ' (selecione e copie manualmente)', description: text.slice(0, 200) }); }
};

function FindingCard({ f, onTech, open, onToggle }: { f: Finding; onTech: (id: string) => void; open: boolean; onToggle: (id: string) => void }) {
  const { t } = useI18n();
  const L = f.localized;
  if (!L) return null;
  const bodyId = `fbody-${f.id}`;
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/20" aria-labelledby={`f-${f.id}`}>
      {/* collapsed header: always visible (state, priority, title, one-line summary) */}
      <div className="flex cursor-pointer items-start gap-3 p-4" onClick={() => onToggle(f.id)}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={f.status} label={L.status_label} />
            <SeverityBadge severity={f.severity} label={L.priority} />
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] dt-text-muted">{t('report.owner')}: {L.owner_label}</span>
            <span className="font-mono text-[11px] text-white/40">{f.id}</span>
          </div>
          <h3 id={`f-${f.id}`} className="mt-2 text-lg font-bold dt-text-primary">{L.title}</h3>
          {!open && <p className="mt-1 line-clamp-1 text-sm dt-text-muted">{L.found}</p>}
        </div>
        <button type="button" aria-expanded={open} aria-controls={bodyId}
          onClick={(e) => { e.stopPropagation(); onToggle(f.id); }}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
          {open ? t('report.collapse') : t('report.expand')}
          <ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div id={bodyId} className="px-4 pb-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          <dl className="space-y-3 text-sm">
            <div><dt className="font-semibold text-white/80">{t('report.what')}</dt><dd className="dt-text-muted"><Glossed text={L.found} /></dd></div>
            <div><dt className="font-semibold text-white/80">{t('report.why')}</dt>
              <dd className="space-y-1 dt-text-muted">
                {L.impact_observed && <p><b className="text-white/70">{t('report.whyObserved')}:</b> {L.impact_observed}</p>}
                {L.impact_possible && <p><b className="text-white/70">{t('report.whyPossible')}:</b> <Glossed text={L.impact_possible} /></p>}
              </dd></div>
            <div><dt className="font-semibold text-white/80">{t('report.ask')}</dt><dd className="dt-text-muted"><Glossed text={L.ask} /></dd></div>
            <div><dt className="font-semibold text-white/80">{t('report.confirmFix')}</dt><dd className="dt-text-muted">{L.confirm}</dd></div>
            <div><dt className="font-semibold text-white/80">{t('report.priority')}: {L.priority}</dt><dd className="dt-text-muted">{L.priority_reason}</dd></div>
            <div><dt className="font-semibold text-white/80">{t('report.confidence')}: {f.confidence} · {t('report.stateLabel')}: {L.status_label}</dt><dd className="dt-text-muted">{L.status_condition}</dd></div>
          </dl>
          <p className="mt-2 text-[11px] text-white/40">{t('report.evidenceCount', { n: f.evidence_ids.length })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onTech(f.id)}>{t('report.viewTech')}</Button>
            <Button size="sm" variant="outline" onClick={() => copy(L.copy_request, t('report.requestCopied'))}><ClipboardCopy className="mr-1 h-4 w-4" />{t('report.copyRequest')}</Button>
          </div>
        </div>
      )}
    </article>
  );
}

/** Expanded/collapsed state per audit, persisted locally. Default: only the first priority item open. */
function useExpansion(auditKey: string, defaultOpen: string[]) {
  const storageKey = `dt-expand:${auditKey}`;
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    try { const v = localStorage.getItem(storageKey); if (v) return new Set(JSON.parse(v)); } catch { /* ignore */ }
    return new Set(defaultOpen);
  });
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify([...openIds])); } catch { /* ignore */ } }, [storageKey, openIds]);
  const toggle = useCallback((id: string) => setOpenIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const setAll = useCallback((ids: string[]) => setOpenIds(new Set(ids)), []);
  return { openIds, toggle, setAll };
}

export default function ManagerView({ r, onTech }: { r: AuditReport; onTech: (findingId: string) => void }) {
  const { t, formatDate } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const sum = useMemo(() => summarize(r.findings), [r.findings]);
  const confirmed = useMemo(() => sortFindings(r.findings.filter(isConfirmedProblem)), [r.findings]);
  const verify = useMemo(() => sortFindings(r.findings.filter((f) => isToVerify(f) && !isConfirmedProblem(f))), [r.findings]);
  const plan = useMemo(() => sortFindings(r.findings.filter(isActionable)), [r.findings]);
  const rules = new Set(r.findings.map((f) => f.rule_id));
  const confirmedCats = new Set(confirmed.map((f) => f.category));
  const pagesOk = r.pages.filter((p) => ['completed', 'partial'].includes(p.status)).length;
  const phases = r.consent?.phases || {};
  const stateKey = r.status;
  const opps: { title: string; why: string }[] = [];
  if (rules.has('CMP_NOT_OBSERVED') || rules.has('TRACKING_WITHOUT_OBSERVED_CMP')) opps.push({ title: t('report.oppNoCmp'), why: t('report.oppNoCmpWhy') });
  if ([...rules].some((x) => x.startsWith('GTM_') || x.includes('DUPLICATE'))) opps.push({ title: t('report.oppGtm'), why: t('report.oppGtmWhy') });
  if (rules.has('EVENT_MISSING_REQUIRED_PARAMS') || rules.has('EVENT_CODE_CANDIDATES_NOT_FIRED')) opps.push({ title: t('report.oppEvents'), why: t('report.oppEventsWhy') });
  opps.push({ title: t('report.oppGtmFile'), why: t('report.oppGtmFileWhy') });
  const shownConfirmed = showAll ? confirmed : confirmed.slice(0, 5);
  const cardIds = useMemo(() => [...confirmed, ...verify].map((f) => f.id), [confirmed, verify]);
  const { openIds, toggle, setAll } = useExpansion(r.audit_id || r.scan_id || 'audit', cardIds.slice(0, 1));
  const allOpen = cardIds.length > 0 && cardIds.every((id) => openIds.has(id));
  const expandControls = cardIds.length > 1 && (
    <div className="mb-3 flex justify-end gap-2">
      <Button size="sm" variant="ghost" onClick={() => setAll(cardIds)} disabled={allOpen}>{t('report.expandAll')}</Button>
      <Button size="sm" variant="ghost" onClick={() => setAll([])} disabled={openIds.size === 0}>{t('report.collapseAll')}</Button>
    </div>
  );
  const share = [
    `${t('report.site')}: ${r.target?.final_url || r.target?.url}`,
    `${t('report.when')}: ${formatDate(r.finished_at || r.started_at)}`,
    `${t('report.resultState')}: ${t(`report.state.${stateKey}`)}`,
    `${t('report.topProblems')}: ${confirmed.length} · ${t('report.toVerify')}: ${verify.length}`,
    '', ...confirmed.slice(0, 5).map((f, i) => `${i + 1}. ${f.localized?.title} (${f.localized?.priority} · ${f.localized?.owner_label})`),
  ].join('\n');

  return (
    <div className="space-y-4 text-white">
      <Card>
        <H2>{t('report.scope')}</H2>
        <dl className="grid gap-3 text-sm md:grid-cols-4">
          <div><dt className="dt-text-muted">{t('report.site')}</dt><dd className="break-all font-semibold">{r.target?.final_url || r.target?.url}</dd></div>
          <div><dt className="dt-text-muted">{t('report.when')}</dt><dd className="font-semibold">{formatDate(r.finished_at || r.started_at)}</dd></div>
          <div><dt className="dt-text-muted">{t('report.pagesChecked')}</dt>
            <dd className="font-semibold">{pagesOk} / {r.pages.length}{r.crawl ? ` (${r.crawl.discovered} ${t('report.pagesDiscovered')})` : ''}</dd></div>
          <div><dt className="dt-text-muted">{t('report.scenarios')}</dt>
            <dd className="font-semibold">{(['baseline', 'reject', 'accept'] as const).map((p) => `${p}: ${phases[p]?.interaction?.status ?? phases[p]?.status ?? '—'}`).join(' · ')}</dd></div>
        </dl>
        <div className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${r.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/30 bg-amber-500/10 text-amber-100'}`} role="status">
          {r.status === 'completed' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div><b>{t('report.resultState')}: {t(`report.state.${stateKey}`)}.</b> {t(`report.stateExplain.${stateKey}`)}</div>
        </div>
        <p className="mt-3 text-xs dt-text-muted">{t('report.timeZoneNote')}</p>
      </Card>

      <Card>
        <H2>{t('report.topProblems')}</H2>
        <p className="mb-3 text-sm dt-text-muted">{sum.confirmed} · {t('report.toVerify')}: {sum.toVerify} · {t('report.whatToDo')}: {plan.length}</p>
        <HiddenNote v={r.visibility} list="findings" className="mb-3" />
        {expandControls}
        {confirmed.length === 0 ? <p className="text-sm dt-text-muted">{t('report.noConfirmed')}</p> : (
          <div className="space-y-3">{shownConfirmed.map((f) => <FindingCard key={f.id} f={f} onTech={onTech} open={openIds.has(f.id)} onToggle={toggle} />)}</div>
        )}
        {confirmed.length > 5 && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)}>{showAll ? t('common.close') : `${t('common.all')} (${confirmed.length})`}</Button>}
      </Card>

      {verify.length > 0 && (
        <Card>
          <H2>{t('report.toVerify')}</H2>
          <div className="space-y-3">{verify.map((f) => <FindingCard key={f.id} f={f} onTech={onTech} open={openIds.has(f.id)} onToggle={toggle} />)}</div>
        </Card>
      )}

      <Card>
        <H2>{t('report.impact')}</H2>
        <p className="mb-2 text-sm dt-text-muted">{t('report.impactIntro')}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm dt-text-muted">
          {(confirmedCats.has('implementation') || confirmedCats.has('events')) && <li>{t('report.impactTracking')}</li>}
          {(confirmedCats.has('consent') || confirmedCats.has('privacy')) && <li>{t('report.impactConsent')}</li>}
          {!confirmedCats.size && <li>{t('report.impactNone')}</li>}
        </ul>
      </Card>

      <Card>
        <H2>{t('report.opportunities')}</H2>
        <p className="mb-2 text-sm dt-text-muted">{t('report.oppNote')}</p>
        <ul className="space-y-2 text-sm">{opps.map((o) => <li key={o.title} className="rounded-lg border border-white/10 p-3"><b>{o.title}</b><br /><span className="dt-text-muted"><Glossed text={o.why} /></span></li>)}</ul>
      </Card>

      <Card>
        <H2>{t('report.actionPlan')}</H2>
        <p className="mb-3 text-sm dt-text-muted">{t('report.actionPlanHint')}</p>
        <HiddenNote v={r.visibility} list="findings" className="mb-3" />
        {plan.length === 0 ? <p className="text-sm dt-text-muted">{t('noFindings')}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('report.actionPlan')}</caption>
              <thead><tr className="text-left text-[11px] uppercase text-white/50">
                <th scope="col" className="px-2 py-2">{t('report.priority')}</th><th scope="col" className="px-2 py-2">{t('findings')}</th>
                <th scope="col" className="px-2 py-2">{t('report.owner')}</th><th scope="col" className="px-2 py-2">{t('report.stateLabel')}</th></tr></thead>
              <tbody>{plan.map((f) => (
                <tr key={f.id} className="border-t border-white/5 align-top">
                  <td className="px-2 py-2">{f.localized?.priority}</td><td className="px-2 py-2">{f.localized?.title}<div className="font-mono text-[10px] text-white/40">{f.id}</div></td>
                  <td className="px-2 py-2">{f.localized?.owner_label}</td><td className="px-2 py-2">{f.localized?.status_label}</td></tr>))}</tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!plan.length} onClick={() => copy(planText(r, 'pt-BR', { owner: t('report.owner'), priority: t('report.priority'), state: t('report.stateLabel'), ask: t('report.ask'), subject: t('report.actionPlan') }), t('report.requestCopied'))}>
            <ClipboardCopy className="mr-1 h-4 w-4" />{t('report.copyRequest')}</Button>
          <Button size="sm" variant="outline" onClick={() => copy(share, t('common.copied'))}><Share2 className="mr-1 h-4 w-4" />{t('report.shareSummary')}</Button>
        </div>
      </Card>

      <Card>
        <H2>{t('report.limitsTitle')}</H2>
        <p className="mb-3 text-sm dt-text-muted">{t('report.limitsIntro')}</p>
        <h3 className="mb-2 text-sm font-semibold">{t('report.modalities')}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {([['modA', 'modAState', 'modAText', true], ['modB', 'modBState', 'modBText', false], ['modC', 'modCState', 'modCText', false]] as const).map(([a, b, c, on]) => (
            <div key={a} className="rounded-lg border border-white/10 p-3 text-sm">
              <p className="font-semibold">{t(`report.${a}`)}</p>
              <p className={on ? 'text-emerald-300' : 'text-amber-300'}>{t(`report.${b}`)}</p>
              <p className="mt-1 text-xs dt-text-muted"><Glossed text={t(`report.${c}`)} /></p>
            </div>))}
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm dt-text-muted">{r.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <p className="mt-3 flex gap-2 text-xs text-white/50"><Info className="h-4 w-4 shrink-0" /><span><b>{t('disclaimerTitle')}:</b> {r.disclaimer}</span></p>
      </Card>
    </div>
  );
}
