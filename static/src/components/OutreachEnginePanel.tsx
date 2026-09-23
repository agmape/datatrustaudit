/**
 * OutreachEnginePanel — Painel de Triagem e Prospecção (Audit & Outreach Engine)
 * Reads scanner data and produces: risk score, priority findings, export buttons,
 * and a dynamic B2B cold-pitch generator (LinkedIn + Cold Email).
 */
import { useState, useMemo, useCallback } from 'react';
import {
    AlertTriangle, ShieldAlert, ShieldX, Clock, FileText,
    FileSpreadsheet, Download, RefreshCw, Copy, Check,
    Linkedin, Mail, ChevronRight, Info, Zap, Eye,
    BarChart3, User, Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface SensitiveFinding {
    category?: string;
    type?: string;
    tag?: string;
    evidence?: string;
    severity?: string;
    lgpdArticle?: string;
}

interface PersonalFinding {
    type?: string;
    tag?: string;
    value?: string;
    severity?: string;
}

interface AuditResultSnapshot {
    url: string;
    score: number;
    tagCount: number;
    tags?: Array<{ name: string; isBeforeConsent?: boolean; type?: string }>;
    sensitiveDataFindings?: SensitiveFinding[];
    personalDataFindings?: PersonalFinding[];
    summary?: {
        consentDetected?: boolean;
        piiExposureCount?: number;
        sensitiveDataCount?: number;
        estimatedFine?: string;
    };
    privacy?: {
        has_consent_tool?: boolean;
        total_violations?: number;
        estimatedRiskExposure?: string;
    };
    duplicates?: Array<{ name?: string; occurrenceCount?: number; severity?: string }>;
}

interface OutreachEnginePanelProps {
    result: AuditResultSnapshot;
    onRescan?: () => void;
    onExportPDF?: () => void;
    onExportExcel?: () => void;
    onExportJSON?: () => void;
    canExportPDF?: boolean;
    canExportExcel?: boolean;
    canExportJSON?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const SENSITIVE_LABELS: Record<string, string> = {
    health: 'Dados de Saúde',
    biometric: 'Dados Biométricos',
    racial: 'Origem Racial/Étnica',
    religious: 'Crença Religiosa',
    political: 'Opinião Política',
    sexual: 'Vida Sexual',
    genetic: 'Dados Genéticos',
    criminal: 'Dados de Saúde/Criminal',
};

function getHostname(url: string): string {
    try { return new URL(url).hostname.replace('www.', ''); }
    catch { return url; }
}

function domainToCompany(url: string): string {
    const h = getHostname(url);
    return h.split('.')[0].charAt(0).toUpperCase() + h.split('.')[0].slice(1);
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

/** Compact severity badge */
const SeverityPill = ({ level }: { level: 'critical' | 'high' | 'medium' | 'low' }) => {
    const map = {
        critical: 'bg-red-500/20 text-red-400 border-red-500/40',
        high:     'bg-orange-500/20 text-orange-400 border-orange-500/40',
        medium:   'bg-amber-500/20 text-amber-400 border-amber-500/40',
        low:      'bg-slate-500/20 text-slate-400 border-slate-600/40',
    } as const;
    const labels = { critical: 'CRÍTICO', high: 'ALTO', medium: 'MÉDIO', low: 'BAIXO' } as const;
    return (
        <span className={`text-[9px] font-black tracking-widest border rounded px-1.5 py-0.5 ${map[level]}`}>
            {labels[level]}
        </span>
    );
};

/** A single risk row */
const RiskRow = ({
    icon: Icon,
    iconColor,
    title,
    description,
    severity,
    legalNote,
}: {
    icon: React.ElementType;
    iconColor: string;
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    legalNote?: string;
}) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-700/40 last:border-0 group">
        <div className={`mt-0.5 shrink-0 ${iconColor}`}>
            <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-sm font-semibold text-slate-100">{title}</span>
                <SeverityPill level={severity} />
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">{description}</p>
            {legalNote && (
                <div className="mt-1 flex items-start gap-1.5 bg-red-900/20 border border-red-700/30 rounded px-2 py-1">
                    <Info className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-red-300 leading-snug">{legalNote}</p>
                </div>
            )}
        </div>
    </div>
);

/** Copy button with success state */
const CopyButton = ({ text, label = 'Copiar' }: { text: string; label?: string }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast({ title: 'Copiado!', description: 'Texto copiado para a área de transferência.' });
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all bg-slate-700/60 border-slate-600/50 text-slate-300 hover:bg-slate-600/80 hover:text-white active:scale-95"
        >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copiado!' : label}
        </button>
    );
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function OutreachEnginePanel({
    result,
    onRescan,
    onExportPDF,
    onExportExcel,
    onExportJSON,
    canExportPDF = false,
    canExportExcel = false,
    canExportJSON = false,
}: OutreachEnginePanelProps) {
    const [pitchTab, setPitchTab] = useState<'linkedin' | 'email'>('linkedin');
    const [dpoName, setDpoName] = useState('');
    const [companyName, setCompanyName] = useState(domainToCompany(result.url));

    // ── Derived risk data ──────────────────────────────────────
    const sensitive = result.sensitiveDataFindings ?? [];
    const pii = result.personalDataFindings ?? [];
    const tagsBeforeConsent = (result.tags ?? []).filter(t => t.isBeforeConsent);
    const hasCmp = result.privacy?.has_consent_tool ?? result.summary?.consentDetected ?? false;
    const piiCount = result.summary?.piiExposureCount ?? pii.length;
    const sensitiveCount = result.summary?.sensitiveDataCount ?? sensitive.length;
    const totalViolations = result.privacy?.total_violations ?? 0;
    const hostname = getHostname(result.url);

    const firstSensitiveLabel = useMemo(() => {
        if (sensitive.length === 0) return null;
        const cat = sensitive[0]?.category ?? sensitive[0]?.type ?? '';
        return SENSITIVE_LABELS[cat.toLowerCase()] ?? cat ?? 'Dados Sensíveis';
    }, [sensitive]);

    // ── Risk items (sorted by severity) ───────────────────────
    const riskItems = useMemo(() => {
        const items: Parameters<typeof RiskRow>[0][] = [];

        if (sensitiveCount > 0) {
            items.push({
                icon: ShieldX,
                iconColor: 'text-red-500',
                title: `${sensitiveCount} Sinal(is) de Dado Pessoal Sensível Detectado(s)`,
                description: `Categorias: ${sensitive.slice(0, 3).map(s =>
                    SENSITIVE_LABELS[(s.category ?? s.type ?? '').toLowerCase()] ?? s.category ?? s.type ?? '?'
                ).join(', ')}${sensitive.length > 3 ? ` +${sensitive.length - 3}` : ''}.`,
                severity: 'critical' as const,
                legalNote: 'Dados sensíveis exigem revisão cuidadosa da finalidade, necessidade, base legal e controles aplicáveis. O scan não determina infração ou sanção.',
            });
        }

        if (piiCount > 0) {
            const piiTypes = [...new Set(pii.slice(0, 4).map(p => p.type ?? 'PII'))].join(', ');
            items.push({
                icon: ShieldAlert,
                iconColor: 'text-orange-500',
                title: `${piiCount} Sinal(is) de PII em Evidência Técnica`,
                description: `Tipos sinalizados: ${piiTypes || 'identificadores pessoais'}. Verifique a fonte, destino, finalidade e necessidade desses parâmetros.`,
                severity: 'high' as const,
            });
        }

        if (tagsBeforeConsent.length > 0) {
            const tagNames = tagsBeforeConsent.slice(0, 3).map(t => t.name).join(', ');
            items.push({
                icon: Clock,
                iconColor: 'text-amber-500',
                title: `${tagsBeforeConsent.length} Tag(s) Disparando Antes do Consentimento`,
                description: `${tagNames}${tagsBeforeConsent.length > 3 ? ` +${tagsBeforeConsent.length - 3}` : ''}. O backend marcou evidência/heurística de ativação antes de um sinal observável de consentimento; a base legal requer verificação.`,
                severity: 'medium' as const,
            });
        }

        if (!hasCmp) {
            items.push({
                icon: AlertTriangle,
                iconColor: 'text-amber-400',
                title: 'Nenhum CMP (Consent Management Platform) Detectado',
                description: 'Nenhum CMP conhecido foi observado. Isso não prova ausência de base legal ou de mecanismo customizado; requer verificação manual.',
                severity: 'high' as const,
            });
        }

        if (totalViolations > 0 && sensitiveCount === 0 && piiCount === 0) {
            items.push({
                icon: AlertTriangle,
                iconColor: 'text-orange-400',
                title: `${totalViolations} Indicador(es) Técnico(s) de Privacidade`,
                description: 'Sinais técnicos identificados no scanner que merecem revisão de privacidade e, quando necessário, avaliação jurídica.',
                severity: 'high' as const,
            });
        }

        return items;
    }, [sensitive, pii, tagsBeforeConsent, hasCmp, piiCount, sensitiveCount, totalViolations]);

    // ── Risk score (0–100, calculated) ────────────────────────
    const riskScore = useMemo(() => {
        const technicalScore = Number.isFinite(result.score) ? Number(result.score) : 50;
        return Math.round(Math.max(0, Math.min(100, 100 - technicalScore)));
    }, [result.score]);

    const riskLevel = riskScore >= 70 ? 'PRIORIDADE MUITO ALTA' : riskScore >= 45 ? 'PRIORIDADE ALTA' : riskScore >= 25 ? 'PRIORIDADE MÉDIA' : 'PRIORIDADE BAIXA';
    const riskColor = riskScore >= 70 ? 'text-red-400' : riskScore >= 45 ? 'text-orange-400' : riskScore >= 25 ? 'text-amber-400' : 'text-green-400';
    const riskRingColor = riskScore >= 70 ? 'border-red-500/60 shadow-red-900/30' : riskScore >= 45 ? 'border-orange-500/60 shadow-orange-900/30' : 'border-amber-500/60 shadow-amber-900/20';

    // ── Pitch text generators ──────────────────────────────────
    const dpoPart = dpoName ? `${dpoName}` : 'DPO/Responsável';
    const companyPart = companyName || hostname;

    const linkedinPitch = useMemo(() => {
        const base = sensitiveCount > 0
            ? `Detectamos exposição de ${firstSensitiveLabel} no site da ${companyPart}. Preparei evidências técnicas do risco LGPD. Posso te enviar?`
            : piiCount > 0
            ? `Detectamos ${piiCount} instâncias de PII trafegando sem proteção no site da ${companyPart}. Tenho um relatório técnico pronto. Posso te enviar?`
            : `Identificamos tags disparando antes do consentimento no site da ${companyPart}. Tenho evidências técnicas de não-conformidade LGPD. Posso te enviar?`;
        return `Olá, ${dpoPart}! ${base}`;
    }, [dpoPart, companyPart, sensitiveCount, piiCount, firstSensitiveLabel]);

    const emailPitch = useMemo(() => {
        const sensitiveBlock = sensitiveCount > 0
            ? `\n\n🔴 ACHADO CRÍTICO — Dados Sensíveis (Art. 5º, II):\nDetectamos ${sensitiveCount} instância(s) de ${firstSensitiveLabel} expostos em payloads de rede. Por se tratar de dado sensível, a ANPD aplica dosimetria agravada (Art. 52 §1º), com multas potencialmente superiores ao teto padrão.`
            : '';
        const piiBlock = piiCount > 0
            ? `\n\n🟠 PII em Texto Claro — ${piiCount} instância(s):\nDados como e-mail, CPF, User-ID e identificadores de usuário estão sendo transmitidos sem criptografia adicional — visíveis diretamente no Data Layer e em requests de rede.`
            : '';
        const consentBlock = tagsBeforeConsent.length > 0
            ? `\n\n🟡 Cookie Bypassing — ${tagsBeforeConsent.length} tag(s) pré-consentimento:\n${tagsBeforeConsent.slice(0, 3).map(t => t.name).join(', ')} disparam antes do opt-in do visitante. A ativação ocorreu antes de um sinal de consentimento observável; a base legal não é determinável externamente.`
            : '';

        return `Olá, ${dpoPart}. Tudo bem?

Realizamos uma análise técnica automatizada do front-end de ${companyPart} (${hostname}) e identificamos indicadores técnicos de privacidade e tracking que merecem revisão.
${sensitiveBlock}${piiBlock}${consentBlock}

📋 RESUMO DO RISCO:
• Índice técnico de priorização: ${riskScore}/100 (${riskLevel})
• Tags detectadas: ${result.tagCount}
• Indicadores técnicos: ${totalViolations}
• CMP/sinal de consentimento observado: ${hasCmp ? 'Sim' : 'Não observado'}

Geramos um relatório técnico com as evidências observadas, níveis de confiança, tags associadas e pontos que exigem validação manual.

Teríamos 15 minutos esta semana para apresentar essas evidências e como podemos mitigar os riscos rapidamente?

Att,
DataTrust Audit
https://datatrustaudit.com`;
    }, [dpoPart, companyPart, hostname, sensitiveCount, piiCount, firstSensitiveLabel,
        tagsBeforeConsent, riskScore, riskLevel, result.tagCount, totalViolations, hasCmp]);

    const charCount = linkedinPitch.length;

    // ── Export handler wrapper ─────────────────────────────────
    const handleLockedExport = useCallback((name: string) => {
        toast({
            title: 'Recurso Pro+',
            description: `Faça upgrade para acessar a exportação de ${name}.`,
            variant: 'destructive',
        });
    }, []);

    // ─────────────────────────────────────────────────────────
    return (
        <div className="space-y-4">

            {/* ══════════════════════════════════════════════════
                SECTION 1 — Risk Score Header
            ══════════════════════════════════════════════════ */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900 overflow-hidden">
                {/* Top bar */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/40 bg-slate-800/60">
                    <Zap className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-bold text-slate-100 tracking-tight">Triagem Técnica — Priorização de Evidências</span>
                    <span className="ml-auto text-[10px] text-slate-500 font-mono">{hostname}</span>
                </div>

                <div className="p-4 flex flex-col sm:flex-row items-start gap-5">

                    {/* Risk ring */}
                    <div className="flex flex-col items-center gap-2 shrink-0">
                        <div className={`w-24 h-24 rounded-full border-4 ${riskRingColor} shadow-lg flex flex-col items-center justify-center bg-slate-950`}>
                            <span className={`text-3xl font-black ${riskColor}`}>{riskScore}</span>
                            <span className="text-[9px] text-slate-500 uppercase tracking-widest -mt-0.5">/ 100</span>
                        </div>
                        <div className={`text-xs font-black tracking-widest uppercase ${riskColor}`}>{riskLevel}</div>
                        <div className="text-[9px] text-slate-500 text-center leading-tight max-w-[90px]">Índice técnico</div>
                    </div>

                    {/* Risk findings list */}
                    <div className="flex-1 min-w-0 w-full">
                        {riskItems.length === 0 ? (
                            <div className="flex items-center gap-2 text-green-400 text-sm py-4">
                                <Check className="w-4 h-4" />
                                <span>Nenhum achado crítico detectado nesta varredura.</span>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-700/40">
                                {riskItems.map((item, i) => <RiskRow key={i} {...item} />)}
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick stat pills */}
                <div className="px-4 pb-4 flex flex-wrap gap-2">
                    <StatPill icon={BarChart3} label="Tags" value={result.tagCount} color="blue" />
                    <StatPill icon={ShieldAlert} label="Indicadores" value={totalViolations} color="red" />
                    <StatPill icon={Eye} label="PII" value={piiCount} color="orange" />
                    <StatPill icon={ShieldX} label="Sensíveis" value={sensitiveCount} color="rose" />
                    <StatPill icon={Clock} label="Pré-consent" value={tagsBeforeConsent.length} color="amber" />
                    <StatPill icon={User} label="CMP" value={hasCmp ? '✓' : '✗'} color={hasCmp ? 'green' : 'red'} />
                </div>
            </div>

            {/* ══════════════════════════════════════════════════
                SECTION 2 — Action Bar (Exports + Re-scan)
            ══════════════════════════════════════════════════ */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/40 bg-slate-800/60">
                    <Download className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Exportação de Evidências</span>
                </div>
                <div className="p-3 flex flex-wrap gap-2">

                    {/* PDF */}
                    <ExportButton
                        icon={FileText}
                        label="Relatório PDF"
                        subtitle="Para o cliente"
                        color="red"
                        locked={!canExportPDF}
                        onClick={canExportPDF ? onExportPDF : () => handleLockedExport('PDF')}
                    />

                    {/* Excel */}
                    <ExportButton
                        icon={FileSpreadsheet}
                        label="Planilha Excel"
                        subtitle="Para análise de dados"
                        color="green"
                        locked={!canExportExcel}
                        onClick={canExportExcel ? onExportExcel : () => handleLockedExport('Excel')}
                    />

                    {/* JSON */}
                    <ExportButton
                        icon={Download}
                        label="Payload JSON"
                        subtitle="Evidência técnica"
                        color="blue"
                        locked={!canExportJSON}
                        onClick={canExportJSON ? onExportJSON : () => handleLockedExport('JSON')}
                    />

                    {/* Re-scan */}
                    <ExportButton
                        icon={RefreshCw}
                        label="Re-Scan"
                        subtitle="Validar persistência"
                        color="slate"
                        locked={false}
                        onClick={onRescan}
                    />
                </div>
            </div>

            {/* ══════════════════════════════════════════════════
                SECTION 3 — Dynamic Pitch Generator
            ══════════════════════════════════════════════════ */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900 overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/40 bg-slate-800/60">
                    <Zap className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Gerador de Abordagem Comercial</span>
                    <span className="ml-auto text-[10px] text-slate-500">Pitch dinâmico com base nos achados</span>
                </div>

                {/* Variables form */}
                <div className="px-4 pt-3 pb-2 flex flex-wrap gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Nome do DPO / Contato</label>
                        <input
                            value={dpoName}
                            onChange={e => setDpoName(e.target.value)}
                            placeholder="Ex: João Silva"
                            className="h-8 text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 w-48"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Nome da Empresa</label>
                        <input
                            value={companyName}
                            onChange={e => setCompanyName(e.target.value)}
                            placeholder="Ex: TechCorp"
                            className="h-8 text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 w-48"
                        />
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-4 flex gap-1 border-b border-slate-700/40">
                    {(['linkedin', 'email'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setPitchTab(tab)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                                pitchTab === tab
                                    ? 'border-blue-500 text-blue-400'
                                    : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {tab === 'linkedin'
                                ? <><Linkedin className="w-3.5 h-3.5" /> LinkedIn (Tiro Rápido)</>
                                : <><Mail className="w-3.5 h-3.5" /> Cold Email (Completo)</>}
                        </button>
                    ))}
                </div>

                {/* Pitch content */}
                <div className="p-4 space-y-3">
                    {pitchTab === 'linkedin' && (
                        <>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                                    Nota de Conexão LinkedIn
                                </span>
                                <span className={`text-[10px] font-mono ${charCount > 200 ? 'text-red-400' : charCount > 180 ? 'text-amber-400' : 'text-slate-500'}`}>
                                    {charCount}/200 chars
                                </span>
                            </div>
                            <div className="relative">
                                <textarea
                                    value={linkedinPitch}
                                    readOnly
                                    rows={3}
                                    className="w-full bg-slate-800/80 border border-slate-700/60 rounded-lg p-3 text-sm text-slate-200 resize-none focus:outline-none focus:border-blue-500 leading-relaxed font-medium scrollbar-thin"
                                />
                                {charCount > 200 && (
                                    <div className="absolute bottom-2 left-3 right-3 text-[10px] text-red-400 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Texto excede 200 caracteres — ajuste os campos acima.
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <CopyButton text={linkedinPitch} label="Copiar para LinkedIn" />
                                <span className="text-[10px] text-slate-600">Texto otimizado para campo de mensagem de conexão</span>
                            </div>
                        </>
                    )}

                    {pitchTab === 'email' && (
                        <>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                                    Cold Email — Evidência Técnica LGPD
                                </span>
                                <span className="text-[10px] text-slate-600 font-mono">{emailPitch.length} chars</span>
                            </div>
                            <textarea
                                value={emailPitch}
                                readOnly
                                rows={14}
                                className="w-full bg-slate-800/80 border border-slate-700/60 rounded-lg p-3 text-xs text-slate-200 resize-none focus:outline-none focus:border-blue-500 leading-relaxed font-mono scrollbar-thin"
                            />
                            <div className="flex items-center gap-2 flex-wrap">
                                <CopyButton text={emailPitch} label="Copiar E-mail Completo" />
                                <button
                                    onClick={() => {
                                        const subject = encodeURIComponent(`[DataTrust Audit] Vulnerabilidades LGPD detectadas — ${companyPart}`);
                                        const body = encodeURIComponent(emailPitch);
                                        window.open(`mailto:?subject=${subject}&body=${body}`);
                                    }}
                                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-600/50 bg-indigo-900/20 text-indigo-300 hover:bg-indigo-800/40 transition-all active:scale-95"
                                >
                                    <Mail className="w-3.5 h-3.5" />
                                    Abrir no cliente de e-mail
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* LGPD legal footer */}
                <div className="px-4 pb-4">
                    <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg px-3 py-2 flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-slate-500 leading-snug">
                            <span className="text-slate-400 font-semibold">Base legal da abordagem:</span> Os achados são tecnicamente comprovados via varredura passiva do front-end público.
                            Evidências extraídas de Data Layer, headers de rede e source code — 100% auditáveis e não-invasivas.
                            Conforme Art. 5º, I e II da LGPD (Lei nº 13.709/2018) e Resolução CD/ANPD nº 4/2023.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Internal helpers (co-located)
// ─────────────────────────────────────────────────────────────
const COLOR_MAP = {
    blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-600/30'   },
    red:    { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-600/30'    },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-600/30' },
    amber:  { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-600/30'  },
    green:  { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-600/30'  },
    rose:   { bg: 'bg-rose-500/10',   text: 'text-rose-400',   border: 'border-rose-600/30'   },
    slate:  { bg: 'bg-slate-700/40',  text: 'text-slate-300',  border: 'border-slate-600/30'  },
} as const;

function StatPill({ icon: Icon, label, value, color }: {
    icon: React.ElementType; label: string; value: number | string; color: keyof typeof COLOR_MAP;
}) {
    const c = COLOR_MAP[color];
    return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${c.bg} ${c.text} ${c.border}`}>
            <Icon className="w-3 h-3" />
            <span className="text-slate-400 font-normal">{label}</span>
            <span>{value}</span>
        </div>
    );
}

function ExportButton({ icon: Icon, label, subtitle, color, locked, onClick }: {
    icon: React.ElementType; label: string; subtitle: string;
    color: keyof typeof COLOR_MAP; locked: boolean; onClick?: () => void;
}) {
    const c = COLOR_MAP[color];
    return (
        <button
            onClick={onClick}
            className={`relative flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all active:scale-95 group
                ${locked
                    ? 'opacity-50 cursor-not-allowed border-dashed border-slate-600 bg-slate-800/30'
                    : `${c.bg} ${c.border} border hover:brightness-125 hover:shadow-md`
                }`}
            title={locked ? `Faça upgrade para acessar ${label}` : label}
        >
            <div className={`${c.text} ${locked ? 'opacity-40' : ''}`}>
                {locked ? <Lock className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
            </div>
            <div className="text-left">
                <div className={`text-xs font-bold ${locked ? 'text-slate-500' : c.text}`}>{label}</div>
                <div className="text-[9px] text-slate-600 leading-none mt-0.5">{subtitle}</div>
            </div>
            {!locked && <ChevronRight className={`w-3.5 h-3.5 ${c.text} opacity-0 group-hover:opacity-100 transition-opacity ml-1`} />}
        </button>
    );
}
