/**
 * exportUtils.ts — Client-side export engine for DataTrust Audit.
 *
 * Generates professional PDF reports and structured Excel workbooks
 * directly in the browser from the AuditResult object.
 * No backend required. No scanId dependency.
 *
 * Libraries:
 *   jspdf            — PDF generation
 *   jspdf-autotable  — Table plugin for jsPDF
 *   xlsx (SheetJS)   — Excel workbook generation
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────────────────────────────────────
// Brand colours (RGB)
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = {
    dark:   [15,  23,  42]  as [number, number, number],  // slate-900
    blue:   [37,  99,  235] as [number, number, number],  // blue-600
    red:    [220, 38,  38]  as [number, number, number],  // red-600
    orange: [234, 88,  12]  as [number, number, number],  // orange-600
    amber:  [217, 119, 6]   as [number, number, number],  // amber-600
    green:  [22,  163, 74]  as [number, number, number],  // green-600
    white:  [255, 255, 255] as [number, number, number],
    light:  [248, 250, 252] as [number, number, number],  // slate-50
    muted:  [100, 116, 139] as [number, number, number],  // slate-500
};

function riskColor(severity?: string): [number, number, number] {
    if (!severity) return BRAND.muted;
    const s = severity.toLowerCase();
    if (s === 'critical') return BRAND.red;
    if (s === 'high')     return BRAND.orange;
    if (s === 'medium')   return BRAND.amber;
    return BRAND.green;
}

function safeStr(v: unknown): string {
    if (v === null || v === undefined) return '—';
    return String(v).trim() || '—';
}

function getHostname(url: string): string {
    try { return new URL(url).hostname.replace('www.', ''); }
    catch { return url; }
}

function formatDate(iso?: string): string {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(): string {
    return new Date().toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirrors NewAuditResults / OutreachEnginePanel shapes)
// ─────────────────────────────────────────────────────────────────────────────
export interface ExportAuditResult {
    url: string;
    score?: number;
    status?: string;
    plan?: string;
    tags?: Array<{
        name?: string;
        type?: string;
        tagId?: string;
        isBeforeConsent?: boolean;
        severity?: string;
        confidence?: string;
    }>;
    violations?: Array<{
        title?: string;
        severity?: string;
        description?: string;
        impact?: string;
    }>;
    recommendations?: Array<{
        title?: string;
        severity?: string;
        description?: string;
        howToFix?: string;
    }>;
    personalDataFindings?: Array<{
        type?: string;
        tag?: string;
        value?: string;
        severity?: string;
        evidence?: string;
    }>;
    sensitiveDataFindings?: Array<{
        category?: string;
        type?: string;
        tag?: string;
        evidence?: string;
        severity?: string;
        lgpdArticle?: string;
    }>;
    duplicates?: Array<{
        name?: string;
        occurrenceCount?: number;
        severity?: string;
    }>;
    summary?: {
        totalTags?: number;
        totalViolations?: number;
        totalRecommendations?: number;
        consentDetected?: boolean;
        piiExposureCount?: number;
        sensitiveDataCount?: number;
        estimatedFine?: string;
    };
    privacy?: {
        jurisdiction?: string;
        framework?: string;
        lgpdRisk?: string;
        gdprRisk?: string;
        cmpName?: string;
        estimatedRiskExposure?: string;
        tagsBeforeConsent?: string[];
    };
    consent?: {
        cmpDetected?: boolean;
        cmpName?: string;
    };
    gtm?: {
        containerIds?: string[];
    };
    ga4?: {
        measurementIds?: string[];
    };
    debugging?: {
        networkHints?: Array<{ url?: string; domain?: string; resourceType?: string }>;
    };
    scanMethod?: string;
    started_at?: string;
    finished_at?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export async function downloadAuditPDF(result: ExportAuditResult): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentW = pageW - margin * 2;
    let cursorY = 0;

    // ── Helper: new page guard ────────────────────────────────────────────────
    const checkPageBreak = (needed: number) => {
        if (cursorY + needed > pageH - 20) {
            doc.addPage();
            cursorY = 16;
        }
    };

    // ── Section header ────────────────────────────────────────────────────────
    const sectionHeader = (title: string, iconChar = '▌') => {
        checkPageBreak(14);
        doc.setFillColor(...BRAND.blue);
        doc.roundedRect(margin, cursorY, contentW, 8, 1.5, 1.5, 'F');
        doc.setTextColor(...BRAND.white);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`${iconChar}  ${title.toUpperCase()}`, margin + 3, cursorY + 5.5);
        cursorY += 11;
        doc.setTextColor(...BRAND.dark);
    };

    // ════════════════════════════════════════════════════════════════════════
    // 1. COVER HEADER
    // ════════════════════════════════════════════════════════════════════════
    // Dark gradient header bar
    doc.setFillColor(...BRAND.dark);
    doc.rect(0, 0, pageW, 42, 'F');

    // Brand name
    doc.setTextColor(...BRAND.white);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('DataTrust Audit', margin, 18);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('Relatório de Auditoria Técnica de Dados & Privacidade', margin, 26);

    // Score badge (top-right)
    const score = result.score ?? 0;
    const scoreColor: [number,number,number] = score >= 70 ? BRAND.green : score >= 45 ? BRAND.amber : BRAND.red;
    doc.setFillColor(...scoreColor);
    doc.roundedRect(pageW - margin - 24, 6, 24, 20, 3, 3, 'F');
    doc.setTextColor(...BRAND.white);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(String(score), pageW - margin - 12, 19, { align: 'center' });
    doc.setFontSize(7);
    doc.text('SCORE', pageW - margin - 12, 24, { align: 'center' });

    cursorY = 50;

    // ── Meta info grid ────────────────────────────────────────────────────────
    doc.setTextColor(...BRAND.muted);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');

    const meta = [
        ['URL Analisada',  result.url],
        ['Domínio',        getHostname(result.url)],
        ['Data do Scan',   formatDate(result.started_at)],
        ['Gerado em',      formatDateTime()],
        ['Plano',          (result.plan ?? 'premium').toUpperCase()],
        ['Método',         result.scanMethod ?? 'browser'],
        ['Status',         result.status ?? 'completed'],
    ];

    meta.forEach(([key, val], i) => {
        const col = i % 2 === 0 ? margin : pageW / 2 + 2;
        const row = Math.floor(i / 2);
        const y = cursorY + row * 6.5;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND.dark);
        doc.text(key + ':', col, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...BRAND.muted);
        doc.text(String(val).substring(0, 55), col + 28, y);
    });
    cursorY += Math.ceil(meta.length / 2) * 6.5 + 8;

    // Divider
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, cursorY, pageW - margin, cursorY);
    cursorY += 8;

    // ════════════════════════════════════════════════════════════════════════
    // 2. EXECUTIVE SUMMARY
    // ════════════════════════════════════════════════════════════════════════
    sectionHeader('Resumo Executivo', '📊');

    const summary = result.summary ?? {};
    const summaryRows = [
        ['Tags Detectadas',          String(summary.totalTags ?? result.tags?.length ?? 0)],
        ['Indicadores Técnicos',      String(summary.totalViolations ?? result.violations?.length ?? 0)],
        ['Instâncias de PII',        String(summary.piiExposureCount ?? result.personalDataFindings?.length ?? 0)],
        ['Dados Sensíveis',          String(summary.sensitiveDataCount ?? result.sensitiveDataFindings?.length ?? 0)],
        ['CMP Detectado',            (summary.consentDetected || result.consent?.cmpDetected) ? 'Sim' : '❌ Não'],
        ['Risco Técnico',             result.privacy?.lgpdRisk?.toUpperCase() ?? '—'],
        ['Contexto de Exposição',     result.privacy?.estimatedRiskExposure ?? summary.estimatedFine ?? '—'],
        ['Jurisdição',               result.privacy?.jurisdiction ?? '—'],
    ];

    autoTable(doc, {
        startY: cursorY,
        head: [['Métrica', 'Valor']],
        body: summaryRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8.5, cellPadding: 3.5 },
        headStyles: { fillColor: BRAND.blue, textColor: BRAND.white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: BRAND.light },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { cellWidth: contentW - 70 } },
    });
    cursorY = (doc as any).lastAutoTable.finalY + 10;

    // ════════════════════════════════════════════════════════════════════════
    // 3. DADOS SENSÍVEIS DETECTADOS (nível crítico)
    // ════════════════════════════════════════════════════════════════════════
    const sensitiveData = result.sensitiveDataFindings ?? [];
    if (sensitiveData.length > 0) {
        sectionHeader('Sinais de Dados Pessoais Sensíveis', '🔴');
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.red);
        doc.setFont('helvetica', 'italic');
        doc.text(
            'Sinais técnicos de dados sensíveis exigem revisão de finalidade, necessidade, base legal e controles; o scan não determina infração ou sanção.',
            margin, cursorY
        );
        cursorY += 6;
        doc.setTextColor(...BRAND.dark);

        autoTable(doc, {
            startY: cursorY,
            head: [['Categoria / Tipo', 'Tag Responsável', 'Evidência', 'Artigo LGPD', 'Severidade']],
            body: sensitiveData.map(f => [
                safeStr(f.category ?? f.type),
                safeStr(f.tag),
                safeStr(f.evidence).substring(0, 60),
                safeStr(f.lgpdArticle),
                safeStr(f.severity).toUpperCase(),
            ]),
            margin: { left: margin, right: margin },
            styles: { fontSize: 7.5, cellPadding: 3 },
            headStyles: { fillColor: BRAND.red, textColor: BRAND.white, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [255, 245, 245] as [number,number,number] },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 4) {
                    const val = String(data.cell.raw ?? '').toLowerCase();
                    data.cell.styles.textColor =
                        val === 'critical' ? BRAND.red :
                        val === 'high'     ? BRAND.orange :
                                             BRAND.amber;
                    data.cell.styles.fontStyle = 'bold';
                }
            },
        });
        cursorY = (doc as any).lastAutoTable.finalY + 10;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 4. PII DETECTADO
    // ════════════════════════════════════════════════════════════════════════
    const piiData = result.personalDataFindings ?? [];
    if (piiData.length > 0) {
        checkPageBreak(20);
        sectionHeader('Sinais de Dados Pessoais (PII)', '🟠');

        autoTable(doc, {
            startY: cursorY,
            head: [['Tipo de Dado', 'Tag / Origem', 'Valor Capturado', 'Risco']],
            body: piiData.map(f => [
                safeStr(f.type),
                safeStr(f.tag),
                safeStr(f.value ?? f.evidence).substring(0, 50),
                safeStr(f.severity).toUpperCase(),
            ]),
            margin: { left: margin, right: margin },
            styles: { fontSize: 7.5, cellPadding: 3 },
            headStyles: { fillColor: BRAND.orange, textColor: BRAND.white, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [255, 250, 245] as [number,number,number] },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 3) {
                    data.cell.styles.textColor = riskColor(String(data.cell.raw ?? ''));
                    data.cell.styles.fontStyle = 'bold';
                }
            },
        });
        cursorY = (doc as any).lastAutoTable.finalY + 10;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 5. TAGS GTM DETECTADAS
    // ════════════════════════════════════════════════════════════════════════
    const tags = result.tags ?? [];
    if (tags.length > 0) {
        checkPageBreak(20);
        sectionHeader('Tags e Rastreadores Detectados', '🏷');

        autoTable(doc, {
            startY: cursorY,
            head: [['Nome / Tag', 'Tipo', 'ID', 'Pré-Consentimento', 'Confiança']],
            body: tags.slice(0, 60).map(t => [
                safeStr(t.name),
                safeStr(t.type),
                safeStr(t.tagId),
                t.isBeforeConsent ? '⚠ SIM' : 'Não',
                safeStr(t.confidence),
            ]),
            margin: { left: margin, right: margin },
            styles: { fontSize: 7.5, cellPadding: 2.8 },
            headStyles: { fillColor: BRAND.blue, textColor: BRAND.white, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: BRAND.light },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 3) {
                    const val = String(data.cell.raw ?? '');
                    if (val.includes('SIM')) {
                        data.cell.styles.textColor = BRAND.red;
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            },
        });
        if (tags.length > 60) {
            cursorY = (doc as any).lastAutoTable.finalY + 3;
            doc.setFontSize(7);
            doc.setTextColor(...BRAND.muted);
            doc.text(`+ ${tags.length - 60} tags adicionais não exibidas neste relatório.`, margin, cursorY);
        }
        cursorY = (doc as any).lastAutoTable.finalY + 10;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 6. VIOLAÇÕES DE PRIVACIDADE
    // ════════════════════════════════════════════════════════════════════════
    const violations = result.violations ?? [];
    if (violations.length > 0) {
        checkPageBreak(20);
        sectionHeader('Indicadores Técnicos de Privacidade', '⚖');

        autoTable(doc, {
            startY: cursorY,
            head: [['Indicador', 'Severidade', 'Descrição', 'Impacto Potencial']],
            body: violations.map(v => [
                safeStr(v.title),
                safeStr(v.severity).toUpperCase(),
                safeStr(v.description).substring(0, 80),
                safeStr(v.impact).substring(0, 60),
            ]),
            margin: { left: margin, right: margin },
            styles: { fontSize: 7.5, cellPadding: 3 },
            headStyles: { fillColor: BRAND.red, textColor: BRAND.white, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [255, 245, 245] as [number,number,number] },
            columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 22 } },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 1) {
                    data.cell.styles.textColor = riskColor(String(data.cell.raw ?? ''));
                    data.cell.styles.fontStyle = 'bold';
                }
            },
        });
        cursorY = (doc as any).lastAutoTable.finalY + 10;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 7. RECOMENDAÇÕES
    // ════════════════════════════════════════════════════════════════════════
    const recs = result.recommendations ?? [];
    if (recs.length > 0) {
        checkPageBreak(20);
        sectionHeader('Recomendações de Remediação', '✅');

        autoTable(doc, {
            startY: cursorY,
            head: [['Recomendação', 'Prioridade', 'Como Corrigir']],
            body: recs.map(r => [
                safeStr(r.title),
                safeStr(r.severity).toUpperCase(),
                safeStr(r.howToFix ?? r.description).substring(0, 100),
            ]),
            margin: { left: margin, right: margin },
            styles: { fontSize: 7.5, cellPadding: 3 },
            headStyles: { fillColor: BRAND.green, textColor: BRAND.white, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 255, 250] as [number,number,number] },
            columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 22 } },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 1) {
                    data.cell.styles.textColor = riskColor(String(data.cell.raw ?? ''));
                    data.cell.styles.fontStyle = 'bold';
                }
            },
        });
        cursorY = (doc as any).lastAutoTable.finalY + 10;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 8. RODAPÉ EM TODAS AS PÁGINAS
    // ════════════════════════════════════════════════════════════════════════
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFillColor(15, 23, 42);
        doc.rect(0, pageH - 12, pageW, 12, 'F');
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('DataTrust Audit — Evidência técnica observável; não constitui parecer jurídico ou certificação de conformidade.', margin, pageH - 4.5);
        doc.text(`Pág. ${i} / ${totalPages}`, pageW - margin, pageH - 4.5, { align: 'right' });
        doc.text(`datatrustaudit.com | ${formatDateTime()}`, pageW / 2, pageH - 4.5, { align: 'center' });
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    const hostname = getHostname(result.url).replace(/[^a-z0-9.-]/gi, '-');
    const dateStr = new Date().toISOString().split('T')[0];
    doc.save(`auditoria-datatrust-${hostname}-${dateStr}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export function downloadAuditExcel(result: ExportAuditResult): void {
    const wb = XLSX.utils.book_new();
    const hostname = getHostname(result.url);
    const now = formatDateTime();

    // ── Helper: add sheet ─────────────────────────────────────────────────────
    function addSheet(name: string, rows: unknown[][], headers: string[]) {
        if (rows.length === 0) {
            const ws = XLSX.utils.aoa_to_sheet([[`Nenhum dado encontrado para: ${name}`]]);
            XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
            return;
        }
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

        // Style header row (bold, blue background)
        const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddr = XLSX.utils.encode_cell({ r: 0, c: col });
            if (!ws[cellAddr]) continue;
            ws[cellAddr].s = {
                font: { bold: true, color: { rgb: 'FFFFFF' } },
                fill: { fgColor: { rgb: '2563EB' } },
                alignment: { horizontal: 'center' },
            };
        }

        // Column widths (auto-fit)
        ws['!cols'] = headers.map((h, i) => ({
            wch: Math.max(
                h.length,
                ...rows.map(r => String(r[i] ?? '').length),
            ) + 4,
        }));

        XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
    }

    // ── 1. Resumo Executivo ───────────────────────────────────────────────────
    const summary = result.summary ?? {};
    const summarySheet = XLSX.utils.aoa_to_sheet([
        ['RELATÓRIO DE AUDITORIA DATATRUST'],
        [],
        ['URL',             result.url],
        ['Domínio',         hostname],
        ['Data',            formatDate(result.started_at)],
        ['Gerado em',       now],
        ['Score',           result.score ?? '—'],
        ['Status',          result.status ?? '—'],
        ['Plano',           result.plan ?? '—'],
        ['Método de Scan',  result.scanMethod ?? '—'],
        [],
        ['MÉTRICAS PRINCIPAIS'],
        ['Total de Tags',        summary.totalTags ?? result.tags?.length ?? 0],
        ['Indicadores Técnicos',  summary.totalViolations ?? result.violations?.length ?? 0],
        ['Instâncias de PII',    summary.piiExposureCount ?? result.personalDataFindings?.length ?? 0],
        ['Dados Sensíveis',      summary.sensitiveDataCount ?? result.sensitiveDataFindings?.length ?? 0],
        ['CMP Detectado',        (summary.consentDetected || result.consent?.cmpDetected) ? 'Sim' : 'Não'],
        ['Risco Técnico',         result.privacy?.lgpdRisk?.toUpperCase() ?? '—'],
        ['Contexto de Exposição', result.privacy?.estimatedRiskExposure ?? summary.estimatedFine ?? '—'],
        ['Jurisdição',           result.privacy?.jurisdiction ?? '—'],
        ['Framework',            result.privacy?.framework ?? '—'],
        [],
        ['Containers GTM',   (result.gtm?.containerIds ?? []).join(', ') || '—'],
        ['IDs GA4',          (result.ga4?.measurementIds ?? []).join(', ') || '—'],
        ['CMP Nome',         result.consent?.cmpName ?? result.privacy?.cmpName ?? '—'],
    ]);
    summarySheet['!cols'] = [{ wch: 28 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumo');

    // ── 2. Dados Sensíveis (LGPD Art 5 II) ───────────────────────────────────
    const sensitiveRows = (result.sensitiveDataFindings ?? []).map(f => [
        safeStr(f.category ?? f.type),
        safeStr(f.tag),
        safeStr(f.evidence),
        safeStr(f.lgpdArticle),
        safeStr(f.severity),
    ]);
    addSheet(
        'Dados Sensíveis',
        sensitiveRows,
        ['Categoria / Tipo', 'Tag Responsável', 'Evidência Capturada', 'Artigo LGPD', 'Severidade'],
    );

    // ── 3. Sinais de dados pessoais ─────────────────────────────────────────────
    const piiRows = (result.personalDataFindings ?? []).map(f => [
        safeStr(f.type),
        safeStr(f.tag),
        safeStr(f.value ?? f.evidence),
        safeStr(f.severity),
    ]);
    addSheet(
        'Sinais de PII',
        piiRows,
        ['Tipo de Dado', 'Tag / Origem', 'Valor Capturado', 'Risco'],
    );

    // ── 4. GTM Tags Detectadas ────────────────────────────────────────────────
    const tagRows = (result.tags ?? []).map(t => [
        safeStr(t.name),
        safeStr(t.type),
        safeStr(t.tagId),
        t.isBeforeConsent ? 'SIM ⚠' : 'Não',
        safeStr(t.confidence),
        safeStr(t.severity),
    ]);
    addSheet(
        'GTM Tags',
        tagRows,
        ['Nome da Tag', 'Tipo', 'ID', 'Pré-Consentimento', 'Confiança', 'Severidade'],
    );

    // ── 5. Indicadores técnicos de privacidade ─────────────────────────────────
    const violationRows = (result.violations ?? []).map(v => [
        safeStr(v.title),
        safeStr(v.severity),
        safeStr(v.description),
        safeStr(v.impact),
    ]);
    addSheet(
        'Indicadores',
        violationRows,
        ['Indicador', 'Severidade', 'Descrição', 'Impacto Potencial'],
    );

    // ── 6. Recomendações ──────────────────────────────────────────────────────
    const recRows = (result.recommendations ?? []).map(r => [
        safeStr(r.title),
        safeStr(r.severity),
        safeStr(r.description),
        safeStr(r.howToFix),
    ]);
    addSheet(
        'Recomendações',
        recRows,
        ['Recomendação', 'Prioridade', 'Descrição', 'Como Corrigir'],
    );

    // ── 7. Evidências de Rede (Network Hints) ─────────────────────────────────
    const networkRows = (result.debugging?.networkHints ?? []).map(h => [
        safeStr(h.url).substring(0, 120),
        safeStr(h.domain),
        safeStr(h.resourceType),
    ]);
    addSheet(
        'Evidências de Rede',
        networkRows,
        ['URL Capturada', 'Domínio', 'Tipo de Recurso'],
    );

    // ── 8. Tags Pré-Consentimento ─────────────────────────────────────────────
    const preConsentTags = (result.tags ?? []).filter(t => t.isBeforeConsent);
    const preConsentRows = preConsentTags.map(t => [
        safeStr(t.name),
        safeStr(t.type),
        safeStr(t.tagId),
        'Observado/indicado antes de sinal de consentimento',
        'Requer revisão de base legal e consentimento',
    ]);
    addSheet(
        'Tags Pré-Consentimento',
        preConsentRows,
        ['Tag', 'Tipo', 'ID', 'Evidência', 'Contexto Regulatório'],
    );

    // ── Save ──────────────────────────────────────────────────────────────────
    const safeName = hostname.replace(/[^a-z0-9.-]/gi, '-');
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `evidencias-datatrust-${safeName}-${dateStr}.xlsx`);
}
