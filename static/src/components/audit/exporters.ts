import type { AuditReport } from './types';

const download = (name: string, content: string, type: string) => {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/** Neutralise spreadsheet formula injection: cells starting with = + - @ (or control chars) are prefixed with an apostrophe.
 *  Legitimate numbers (e.g. -12.5 or +55) are left untouched. */
export const safeCell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  let s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return s;
};

// UTF-8 BOM so Excel opens accents correctly; ';' is the Excel delimiter in pt-BR locales, ',' elsewhere.
export const csv = (rows: unknown[][], delimiter = ';') =>
  '\ufeff' + rows.map((r) => r.map((v) => `"${safeCell(v).replace(/"/g, '""')}"`).join(delimiter)).join('\r\n');

const host = (r: AuditReport) => {
  try { return new URL(r.target?.final_url || r.target?.url || r.target?.input_url || '').hostname.replace(/[^a-z0-9.-]/gi, '_'); } catch { return 'auditoria'; }
};

const pt = (lang: string) => lang === 'pt-BR';
const delim = (lang: string) => (pt(lang) ? ';' : ',');

export const exportJson = (r: AuditReport) =>
  download(`datatrust-${host(r)}-${r.audit_id || r.scan_id}.json`, JSON.stringify(r, null, 2), 'application/json');

export const exportFindingsCsv = (r: AuditReport, lang = 'pt-BR') =>
  download(`datatrust-${host(r)}-achados.csv`, csv([
    pt(lang) ? ['id', 'regra', 'titulo', 'estado', 'prioridade', 'confianca', 'categoria', 'responsavel_sugerido', 'evidencias', 'paginas', 'o_que_encontramos', 'o_que_pedir']
      : ['id', 'rule_id', 'title', 'status', 'priority', 'confidence', 'category', 'suggested_owner', 'evidence_ids', 'pages', 'what_we_found', 'what_to_ask'],
    ...r.findings.map((f) => [f.id, f.rule_id, f.localized?.title ?? f.title, f.localized?.status_label ?? f.status, f.localized?.priority ?? f.severity,
      f.confidence, f.category, f.localized?.owner_label ?? '', f.evidence_ids.join(' '), f.pages.join(' '), f.localized?.found ?? f.description, f.localized?.ask ?? '']),
  ], delim(lang)), 'text/csv');

export const exportEvidenceCsv = (r: AuditReport, lang = 'pt-BR') =>
  download(`datatrust-${host(r)}-evidencias.csv`, csv([
    pt(lang) ? ['id', 'tipo', 'fase', 'pagina', 'horario', 't_ms', 'confianca', 'fornecedor', 'url_ou_script', 'dominio', 'terceiro', 'depois_do_clique', 'linha_html', 'cookie', 'dominio_cookie', 'chave_storage', 'mascarado']
      : ['id', 'source_type', 'phase', 'page_url', 'timestamp', 't_ms', 'confidence', 'vendor', 'request_url', 'domain', 'third_party', 'after_interaction', 'html_line', 'cookie_name', 'cookie_domain', 'storage_key', 'redacted'],
    ...r.evidence.map((e) => [e.id, e.source_type, e.phase, e.page_url, e.timestamp, e.t_ms, e.confidence, e.vendor_hint,
      e.request_url || e.script_url, e.domain, e.third_party, e.after_interaction, e.html_line, e.cookie_name, e.cookie_domain, e.storage_key, e.redaction?.redacted ?? false]),
  ], delim(lang)), 'text/csv');

export const summaryText = (r: AuditReport, lang = 'pt-BR') => {
  const o = r.scores?.overall;
  const L = pt(lang);
  const v = r.visibility;
  const vf = v?.lists?.findings;
  // exports carry only the records the server released; the line states the plan visibility explicitly
  const visLine = v ? (L ? `Visibilidade do plano: ${v.percent}% — ${vf ? `${vf.released} de ${vf.total} achados` : `${v.released_details} de ${v.total_details} detalhes`}`
    : `Plan visibility: ${v.percent}% — ${vf ? `${vf.released} of ${vf.total} findings` : `${v.released_details} of ${v.total_details} details`}`) : null;
  return [
    `DataTrust Audit — ${r.target?.final_url || r.target?.url}`,
    `${L ? 'auditoria' : 'audit'}: ${r.audit_id || r.scan_id} | ${L ? 'estado' : 'status'}: ${r.status} | ${L ? 'motor' : 'engine'} ${r.engine_version} | ${L ? 'pontuação' : 'scoring'} ${r.scoring_version}`,
    `${L ? 'Nota' : 'Score'}: ${o?.score ?? (L ? 'N/D' : 'N/A')}${o?.score == null && o?.null_reason ? ` (${o.null_reason})` : ''}`,
    ...(visLine ? [visLine] : []),
    '',
    ...r.findings.map((f) => `[${f.id}] [${f.localized?.status_label ?? f.status}] [${f.localized?.priority ?? f.severity}] ${f.localized?.title ?? f.title} — ${L ? 'evidências' : 'evidence'}: ${f.evidence_ids.slice(0, 8).join(', ') || (L ? 'nenhuma' : 'none')}`),
    '',
    r.disclaimer || '',
  ].join('\n');
};
