import type { AuditReport, Finding } from './types';

/** Shared by the manager and technical views so their numbers always match (same findings, same rules). */
export const PRIORITY_ORDER = ['critical', 'high', 'needs_manual_review', 'medium', 'low', 'info'] as const;
export const prioRank = (sev: string) => { const i = (PRIORITY_ORDER as readonly string[]).indexOf(sev); return i < 0 ? 99 : i; };

export const isConfirmedProblem = (f: Finding) => f.status === 'OBSERVED' && f.severity !== 'info';
export const isToVerify = (f: Finding) => f.status === 'INFERRED' || f.status === 'UNVERIFIABLE' || (f.status === 'OBSERVED' && f.severity === 'needs_manual_review');
export const isActionable = (f: Finding) => f.severity !== 'info' && f.status !== 'NOT_OBSERVED';

export interface Summary {
  total: number; confirmed: number; toVerify: number; notObserved: number; info: number;
  byStatus: Record<string, number>; bySeverity: Record<string, number>; byCategory: Record<string, number>;
}

export function summarize(findings: Finding[]): Summary {
  const s: Summary = { total: findings.length, confirmed: 0, toVerify: 0, notObserved: 0, info: 0, byStatus: {}, bySeverity: {}, byCategory: {} };
  for (const f of findings) {
    s.byStatus[f.status] = (s.byStatus[f.status] || 0) + 1;
    s.bySeverity[f.severity] = (s.bySeverity[f.severity] || 0) + 1;
    s.byCategory[f.category] = (s.byCategory[f.category] || 0) + 1;
    if (isConfirmedProblem(f)) s.confirmed++;
    else if (isToVerify(f)) s.toVerify++;
    if (f.status === 'NOT_OBSERVED') s.notObserved++;
    if (f.severity === 'info') s.info++;
  }
  return s;
}

export const sortFindings = (arr: Finding[]) => [...arr].sort((a, b) => prioRank(a.severity) - prioRank(b.severity) || a.id.localeCompare(b.id));

export const vendorsOf = (r: AuditReport) => Array.from(new Set(r.findings.map((f) => f.vendor).filter(Boolean) as string[])).sort();

export function planText(r: AuditReport, lang: string, labels: { owner: string; priority: string; state: string; ask: string; subject: string }): string {
  const rows = sortFindings(r.findings.filter(isActionable)).map((f, i) =>
    `${i + 1}. [${f.localized?.priority}] ${f.localized?.title}\n   ${labels.owner}: ${f.localized?.owner_label} | ${labels.state}: ${f.localized?.status_label}\n   ${labels.ask}: ${f.localized?.ask}\n   (${f.id} · ${f.rule_id})`);
  return `${labels.subject}: ${r.target?.final_url || r.target?.url}\n\n${rows.join('\n\n')}`;
}
