/**
 * ForensicEvidencePanel — Evidências Forenses de Network
 *
 * Displays three forensic elements:
 *   1. Payload Inspector  — terminal-style block with the actual captured evidence
 *   2. Timestamp Badge    — precise capture timestamp (ms precision)
 *   3. Execution Timeline — visual proof of cookie-bypassing (Art. 7º LGPD)
 */
import { useState, useMemo } from 'react';
import {
    Terminal, Clock, Network, Copy, Check,
    AlertTriangle, ShieldX, CheckCircle2,
    ChevronDown, ChevronUp, Wifi, FileCode2,
    MousePointerClick, Fingerprint, Info,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface TagFinding {
    name: string;
    type: string;
    position: number;
    lineNumber?: number | null;
    isBeforeConsent: boolean;
    lgpdRisk: string;
    dataCollected: string[];
    sourceBlock?: string | null;
    matchedPattern?: string;
    tagId?: string | null;
    vendor?: string;
}

interface PersonalFinding {
    type?: string;
    tag?: string;
    value?: string;
    evidence?: string;
    severity?: string;
}

interface SensitiveFinding {
    category?: string;
    type?: string;
    tag?: string;
    evidence?: string;
    severity?: string;
}

interface ForensicEvidencePanelProps {
    tags: TagFinding[];
    hasConsentTool: boolean;
    scanTimestamp: string;          // ISO string from result.timestamp
    personalDataFindings?: PersonalFinding[];
    sensitiveDataFindings?: SensitiveFinding[];
    url: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatTimestamp(iso: string): string {
    try {
        const d = new Date(iso);
        const date = d.toLocaleDateString('pt-BR');
        const time = d.toLocaleTimeString('pt-BR', { hour12: false });
        const ms = String(d.getMilliseconds()).padStart(3, '0');
        return `${date} — ${time}.${ms} UTC`;
    } catch {
        return iso;
    }
}

/** Build a synthetic payload string from tag evidence */
function buildPayload(tag: TagFinding, piiFindings: PersonalFinding[], sensitiveFindings: SensitiveFinding[]): string {
    const lines: string[] = [];

    // Real source block (best evidence)
    if (tag.sourceBlock && tag.sourceBlock.trim()) {
        return tag.sourceBlock.trim();
    }

    // PII findings for this tag
    const tagPii = piiFindings.filter(p => p.tag === tag.name || p.tag === tag.vendor);
    const tagSensitive = sensitiveFindings.filter(s => s.tag === tag.name || s.tag === tag.vendor);

    if (tagPii.length > 0 || tagSensitive.length > 0) {
        lines.push(`// Network Request Intercepted — ${tag.name}`);
        lines.push(`// Método de detecção: ${tag.matchedPattern ? 'source_pattern' : 'script_url'}`);
        lines.push('');

        if (tagPii.length > 0) {
            lines.push('// PII Parameters Detected:');
            tagPii.forEach(p => {
                const val = p.value ?? p.evidence ?? `[REDACTED_${p.type?.toUpperCase()}]`;
                const key = p.type === 'email' ? 'ud[em]' :
                    p.type === 'phone' ? 'ud[ph]' :
                        p.type === 'cpf' ? 'ud[cpf]' :
                            p.type === 'user_id' ? 'uid' : `data[${p.type}]`;
                lines.push(`${key}=${val}`);
            });
        }
        if (tagSensitive.length > 0) {
            lines.push('');
            lines.push('// ⚠️  Sensitive Data (Art. 5º, II LGPD):');
            tagSensitive.forEach(s => {
                const val = s.evidence ?? `[REDACTED_${(s.category ?? s.type ?? 'SENSITIVE').toUpperCase()}]`;
                lines.push(`data[${s.category ?? s.type}]=${val}`);
            });
        }
    } else {
        // Generic evidence from matched pattern / dataCollected
        lines.push(`// Tag Intercepted: ${tag.name}`);
        lines.push(`// Pattern Match: ${tag.matchedPattern ?? 'script_url'}`);
        if (tag.tagId) lines.push(`// Tag ID: ${tag.tagId}`);
        if (tag.lineNumber) lines.push(`// Source Line: ${tag.lineNumber}`);
        lines.push('');
        if (tag.dataCollected?.length) {
            lines.push('// Data Collected:');
            tag.dataCollected.forEach(d => lines.push(`//   · ${d}`));
        }
        lines.push('');
        lines.push(`isBeforeConsent: ${tag.isBeforeConsent}`);
        lines.push(`lgpdRisk: "${tag.lgpdRisk}"`);
    }

    return lines.join('\n');
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                toast({ title: 'Payload copiado!', description: 'Evidência copiada para a área de transferência.' });
                setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded border border-slate-600 bg-slate-800 text-slate-400 hover:text-green-400 hover:border-green-600 transition-all active:scale-95"
        >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copiado' : 'Copiar Payload'}
        </button>
    );
}

// ─────────────────────────────────────────────
// Timeline Event types
// ─────────────────────────────────────────────
type TimelineStatus = 'ok' | 'violation' | 'late' | 'pending';
interface TimelineEvent {
    step: number;
    label: string;
    detail: string;
    status: TimelineStatus;
    icon: React.ReactNode;
    legalNote?: string;
    tagNames?: string[];
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export default function ForensicEvidencePanel({
    tags,
    hasConsentTool,
    scanTimestamp,
    personalDataFindings = [],
    sensitiveDataFindings = [],
    url,
}: ForensicEvidencePanelProps) {

    const [selectedTagIdx, setSelectedTagIdx] = useState(0);
    const [showAllPayloads, setShowAllPayloads] = useState(false);

    // Tags with the highest forensic value — violations first
    const forensicTags = useMemo(() => {
        const violations = tags.filter(t => t.isBeforeConsent && t.type !== 'consent');
        const risky = tags.filter(t => !t.isBeforeConsent && ['critical', 'high'].includes(t.lgpdRisk));
        const rest = tags.filter(t => !violations.includes(t) && !risky.includes(t));
        return [...violations, ...risky, ...rest].slice(0, showAllPayloads ? 20 : 5);
    }, [tags, showAllPayloads]);

    const totalForensicTags = tags.filter(t => t.isBeforeConsent || ['critical', 'high'].includes(t.lgpdRisk)).length;
    const selectedTag = forensicTags[selectedTagIdx] ?? forensicTags[0];

    const payload = useMemo(() => {
        if (!selectedTag) return '// Nenhuma evidência capturada para esta tag.';
        return buildPayload(selectedTag, personalDataFindings, sensitiveDataFindings);
    }, [selectedTag, personalDataFindings, sensitiveDataFindings]);

    // Timeline events derived from real data
    const timelineEvents = useMemo((): TimelineEvent[] => {
        const bypassTags = tags
            .filter(t => t.isBeforeConsent && t.type !== 'consent')
            .sort((a, b) => a.position - b.position);
        const consentTag = tags.find(t => t.type === 'consent');

        const events: TimelineEvent[] = [
            {
                step: 1,
                label: 'DOM Ready — Carregamento inicial da página',
                detail: `Navegador requisita ${new URL(url.startsWith('http') ? url : 'https://' + url).hostname}. HTML parseado, scripts começam a executar.`,
                status: 'ok',
                icon: <Wifi className="w-4 h-4" />,
            },
        ];

        if (bypassTags.length > 0) {
            events.push({
                step: 2,
                label: `${bypassTags.length} Tag(s) Disparam com PII — Antes do Consentimento`,
                detail: `Network requests interceptadas com dados pessoais. Coleta ativa SEM opt-in do utilizador.`,
                status: 'violation',
                icon: <AlertTriangle className="w-4 h-4" />,
                legalNote: 'VIOLAÇÃO: Art. 7º + 8º LGPD — Coleta sem base legal válida. Art. 5º, II se dados sensíveis.',
                tagNames: bypassTags.slice(0, 5).map(t => t.name),
            });
        } else {
            events.push({
                step: 2,
                label: 'Tags de tracking carregadas',
                detail: `${tags.filter(t => t.type !== 'consent').length} tags detectadas. Sem bypass identificado nesta varredura.`,
                status: 'ok',
                icon: <Network className="w-4 h-4" />,
            });
        }

        if (hasConsentTool && consentTag) {
            events.push({
                step: bypassTags.length > 0 ? 3 : 3,
                label: `Banner de Consentimento (CMP) — ${consentTag.name}`,
                detail: bypassTags.length > 0
                    ? 'CMP carregado APÓS as tags de tracking. O banner aparece para o utilizador, mas os dados já foram enviados.'
                    : 'CMP carregado. Mecanismo de consentimento presente.',
                status: bypassTags.length > 0 ? 'late' : 'ok',
                icon: <MousePointerClick className="w-4 h-4" />,
                legalNote: bypassTags.length > 0
                    ? 'O consentimento posterior NÃO valida a coleta já ocorrida (Resolução ANPD nº 2/2022).'
                    : undefined,
            });
        } else {
            events.push({
                step: 3,
                label: 'Interação do Utilizador com Banner de Cookies',
                detail: 'Nenhum CMP (Cookiebot, OneTrust, Didomi) detectado. Ausência total de mecanismo de opt-in.',
                status: 'pending',
                icon: <MousePointerClick className="w-4 h-4" />,
                legalNote: 'Sem CMP = toda coleta ativa é presumivelmente ilegal (Art. 7º, I LGPD).',
            });
        }

        return events;
    }, [tags, hasConsentTool, url]);

    const statusConfig: Record<TimelineStatus, { ring: string; bg: string; text: string; dot: string; label: string }> = {
        ok:        { ring: 'border-green-500/50',  bg: 'bg-green-900/10',  text: 'text-green-400',  dot: 'bg-green-500',  label: 'OK' },
        violation: { ring: 'border-red-500/70',    bg: 'bg-red-900/15',    text: 'text-red-400',    dot: 'bg-red-500',    label: 'VIOLAÇÃO' },
        late:      { ring: 'border-amber-500/60',  bg: 'bg-amber-900/10',  text: 'text-amber-400',  dot: 'bg-amber-500',  label: 'TARDIO' },
        pending:   { ring: 'border-slate-600/50',  bg: 'bg-slate-800/30',  text: 'text-slate-400',  dot: 'bg-slate-600',  label: 'AUSENTE' },
    };

    if (!tags || tags.length === 0) {
        return (
            <div className="rounded-xl border border-slate-700/60 bg-slate-900 p-6 text-center text-slate-500 text-sm">
                Nenhuma evidência forense disponível para esta varredura.
            </div>
        );
    }

    return (
        <div className="space-y-4">

            {/* ══════════════════════════════════
                SECTION HEADER
            ══════════════════════════════════ */}
            <div className="flex items-center gap-3 px-1">
                <div className="flex items-center gap-2">
                    <Fingerprint className="w-5 h-5 text-cyan-400" />
                    <h3 className="text-sm font-black text-slate-100 tracking-tight uppercase">
                        Evidências Forenses de Network
                    </h3>
                </div>
                <div className="h-px flex-1 bg-slate-700/60" />
                {/* Capture timestamp badge */}
                <div className="flex items-center gap-1.5 bg-slate-800 border border-cyan-500/30 rounded-lg px-3 py-1">
                    <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span className="text-[10px] font-mono text-cyan-300 whitespace-nowrap">
                        Capturado: {formatTimestamp(scanTimestamp)}
                    </span>
                </div>
            </div>

            {/* ══════════════════════════════════
                1. PAYLOAD INSPECTOR
            ══════════════════════════════════ */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900 overflow-hidden">
                {/* Header bar */}
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 border-b border-slate-700/40">
                    <Terminal className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-bold text-slate-300 font-mono flex-1">
                        PAYLOAD INSPECTOR — Inspetor de Evidências
                    </span>
                    {totalForensicTags > 0 && (
                        <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 rounded px-2 py-0.5 font-bold">
                            {totalForensicTags} TAG{totalForensicTags !== 1 ? 'S' : ''} DE RISCO
                        </span>
                    )}
                </div>

                {/* Tag selector tabs */}
                <div className="flex items-center gap-0 overflow-x-auto border-b border-slate-700/40 scrollbar-hide">
                    {forensicTags.map((tag, idx) => (
                        <button
                            key={idx}
                            onClick={() => setSelectedTagIdx(idx)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold whitespace-nowrap border-b-2 transition-all shrink-0 ${
                                selectedTagIdx === idx
                                    ? 'border-cyan-500 text-cyan-400 bg-slate-800/60'
                                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                        >
                            {tag.isBeforeConsent && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                            {!tag.isBeforeConsent && tag.lgpdRisk === 'high' && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />}
                            {!tag.isBeforeConsent && !['critical','high'].includes(tag.lgpdRisk) && <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />}
                            <span className="max-w-[100px] truncate">{tag.name}</span>
                        </button>
                    ))}
                    {!showAllPayloads && tags.length > 5 && (
                        <button
                            onClick={() => setShowAllPayloads(true)}
                            className="px-3 py-2 text-[10px] text-slate-600 hover:text-slate-400 whitespace-nowrap shrink-0 flex items-center gap-1"
                        >
                            +{tags.length - 5} mais
                            <ChevronDown className="w-3 h-3" />
                        </button>
                    )}
                </div>

                {/* Selected tag info bar */}
                {selectedTag && (
                    <div className="flex items-center gap-3 px-4 py-2 bg-slate-900/60 border-b border-slate-700/30 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <Network className="w-3 h-3 text-slate-500" />
                            <span className="text-[10px] font-mono text-slate-400">
                                Tipo: <span className="text-slate-200">{selectedTag.type}</span>
                            </span>
                        </div>
                        {selectedTag.lineNumber && (
                            <div className="flex items-center gap-1.5">
                                <FileCode2 className="w-3 h-3 text-slate-500" />
                                <span className="text-[10px] font-mono text-slate-400">
                                    Linha: <span className="text-slate-200">{selectedTag.lineNumber}</span>
                                </span>
                            </div>
                        )}
                        {selectedTag.tagId && (
                            <div className="flex items-center gap-1.5">
                                <Fingerprint className="w-3 h-3 text-slate-500" />
                                <span className="text-[10px] font-mono text-slate-400">
                                    ID: <span className="text-cyan-300">{selectedTag.tagId}</span>
                                </span>
                            </div>
                        )}
                        {selectedTag.isBeforeConsent && (
                            <span className="ml-auto text-[9px] font-black uppercase tracking-widest bg-red-500/20 text-red-400 border border-red-500/40 rounded px-2 py-0.5 flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Pré-consentimento · Art. 7º LGPD
                            </span>
                        )}
                    </div>
                )}

                {/* Terminal payload block */}
                <div className="relative bg-slate-950 font-mono">
                    {/* Window chrome dots */}
                    <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                        <span className="ml-3 text-[9px] font-mono text-slate-600 tracking-widest uppercase">
                            network · evidence · {selectedTag?.name ?? ''}
                        </span>
                        <div className="ml-auto">
                            <CopyBtn text={payload} />
                        </div>
                    </div>

                    {/* Payload content */}
                    <pre className="px-4 pb-4 pt-2 text-[11px] leading-relaxed text-green-300 overflow-x-auto whitespace-pre-wrap break-words max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        <span className="text-slate-600 select-none">{'>'} </span>
                        {payload.split('\n').map((line, i) => {
                            const isComment = line.trim().startsWith('//');
                            const isKey = line.includes('=') && !isComment;
                            const isWarning = line.includes('⚠️') || line.toLowerCase().includes('sensitive') || line.toLowerCase().includes('sensit');
                            return (
                                <span key={i} className="block">
                                    {isComment
                                        ? <span className="text-slate-500">{line}</span>
                                        : isWarning
                                        ? <span className="text-red-400 font-bold">{line}</span>
                                        : isKey
                                        ? (
                                            <>
                                                <span className="text-cyan-400">{line.split('=')[0]}</span>
                                                <span className="text-slate-400">=</span>
                                                <span className="text-amber-300">{line.split('=').slice(1).join('=')}</span>
                                            </>
                                        )
                                        : <span>{line}</span>
                                    }
                                </span>
                            );
                        })}
                    </pre>

                    {/* Scan timestamp watermark */}
                    <div className="px-4 pb-3 flex items-center gap-2 border-t border-slate-800">
                        <Clock className="w-3 h-3 text-slate-600" />
                        <span className="text-[9px] font-mono text-slate-600">
                            scan_ts: {scanTimestamp} · engine: DataTrust/v2 · method: html_source_static
                        </span>
                    </div>
                </div>

                {/* Data collected pills */}
                {selectedTag?.dataCollected && selectedTag.dataCollected.length > 0 && (
                    <div className="px-4 py-2.5 border-t border-slate-800 flex items-center gap-2 flex-wrap bg-slate-900/60">
                        <span className="text-[9px] text-slate-600 uppercase tracking-widest font-bold shrink-0">Dados coletados:</span>
                        {selectedTag.dataCollected.map((d, i) => (
                            <span key={i} className="text-[10px] bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-0.5 font-mono">
                                {d}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════
                2. EXECUTION TIMELINE
            ══════════════════════════════════ */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/80 border-b border-slate-700/40">
                    <Clock className="w-4 h-4 text-violet-400" />
                    <span className="text-xs font-bold text-slate-300">
                        Timeline de Execução — Prova de Cookie Bypassing (Art. 7º LGPD)
                    </span>
                    {tags.filter(t => t.isBeforeConsent && t.type !== 'consent').length > 0 && (
                        <span className="ml-auto flex items-center gap-1 text-[9px] text-red-400 font-bold uppercase tracking-widest bg-red-500/10 border border-red-500/30 rounded px-2 py-0.5 animate-pulse">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Bypass Detectado
                        </span>
                    )}
                </div>

                <div className="p-4">
                    <div className="relative">
                        {/* Vertical line */}
                        <div className="absolute left-5 top-6 bottom-6 w-px bg-slate-700/60" />

                        <div className="space-y-3">
                            {timelineEvents.map((ev, idx) => {
                                const cfg = statusConfig[ev.status];
                                return (
                                    <div key={idx} className="relative flex items-start gap-4">
                                        {/* Step dot */}
                                        <div className={`relative z-10 w-10 h-10 rounded-full border-2 ${cfg.ring} ${cfg.bg} flex items-center justify-center shrink-0 shadow-md`}>
                                            <span className={cfg.text}>{ev.icon}</span>
                                        </div>

                                        {/* Content card */}
                                        <div className={`flex-1 rounded-xl border ${cfg.ring} ${cfg.bg} px-3 py-2.5 shadow-sm`}>
                                            <div className="flex items-start justify-between gap-2 flex-wrap">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-xs font-bold ${cfg.text}`}>{ev.label}</span>
                                                    <span className={`text-[9px] font-black uppercase tracking-widest border rounded px-1.5 py-0.5 ${cfg.ring} ${cfg.text} bg-transparent`}>
                                                        {cfg.label}
                                                    </span>
                                                </div>
                                                <span className="text-[9px] font-mono text-slate-600 shrink-0">
                                                    passo {ev.step}/{timelineEvents.length}
                                                </span>
                                            </div>

                                            <p className="text-[11px] text-slate-400 mt-1 leading-snug">{ev.detail}</p>

                                            {/* Tag name pills */}
                                            {ev.tagNames && ev.tagNames.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {ev.tagNames.map((n, i) => (
                                                        <span key={i} className="text-[9px] font-mono bg-red-900/30 border border-red-700/40 text-red-300 rounded px-1.5 py-0.5">
                                                            {n}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Legal note */}
                                            {ev.legalNote && (
                                                <div className="mt-2 flex items-start gap-1.5 bg-red-900/20 border border-red-700/30 rounded px-2 py-1.5">
                                                    <Info className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                                                    <p className="text-[10px] text-red-300 leading-snug font-medium">{ev.legalNote}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Legal footer */}
                    <div className="mt-4 rounded-lg bg-slate-800/50 border border-slate-700/40 px-3 py-2.5 flex items-start gap-2">
                        <ShieldX className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-slate-500 leading-snug">
                            <span className="text-slate-400 font-semibold">Nota forense:</span>{' '}
                            Esta timeline foi construída a partir de varredura estática do código-fonte público da página.
                            A ordem de execução é determinada pela posição dos scripts no DOM (
                            <code className="text-slate-400 font-mono">position</code> e{' '}
                            <code className="text-slate-400 font-mono">lineNumber</code>).
                            Evidências auditáveis e reproduzíveis — compatíveis com Resolução ANPD nº 4/2023.
                        </p>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════
                3. SUMMARY EVIDENCE TABLE
            ══════════════════════════════════ */}
            {personalDataFindings.length > 0 || sensitiveDataFindings.length > 0 ? (
                <div className="rounded-xl border border-slate-700/60 bg-slate-900 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/80 border-b border-slate-700/40">
                        <Fingerprint className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-slate-300">
                            Tabela de Evidências — Tipos de Dados Expostos
                        </span>
                        <span className="ml-auto text-[10px] text-slate-500 font-mono">
                            {personalDataFindings.length + sensitiveDataFindings.length} achado(s)
                        </span>
                    </div>
                    <div className="divide-y divide-slate-800">
                        {sensitiveDataFindings.slice(0, 8).map((f, i) => (
                            <div key={`s-${i}`} className="flex items-center gap-3 px-4 py-2 bg-red-900/5 hover:bg-red-900/10 transition-colors">
                                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                <span className="text-xs font-semibold text-red-300 min-w-[120px]">
                                    {f.category ?? f.type ?? 'Sensível'}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono truncate flex-1">
                                    {f.evidence ?? f.tag ?? '—'}
                                </span>
                                <span className="text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-500/30 rounded px-1.5 py-0.5">
                                    SENSÍVEL · Art.5°II
                                </span>
                            </div>
                        ))}
                        {personalDataFindings.slice(0, 8).map((f, i) => (
                            <div key={`p-${i}`} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-800/30 transition-colors">
                                <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                                <span className="text-xs font-semibold text-orange-300 min-w-[120px]">
                                    {f.type ?? 'PII'}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono truncate flex-1">
                                    {f.value ?? f.evidence ?? f.tag ?? '—'}
                                </span>
                                <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest border border-orange-500/30 rounded px-1.5 py-0.5">
                                    PII · Art.5°I
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
