import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import {
    BarChart3,
    Shield,
    Clock,
    FileText,
    Download,
    AlertTriangle,
    CheckCircle,
    Copy,
    Globe,
    PieChart,
    Sparkles,
    FileSpreadsheet,
    Lock,
    Activity,
    Box,
    ChevronDown,
    ChevronUp,
    Briefcase,
    Fingerprint,
} from 'lucide-react';
import ScriptTimeline from './ScriptTimeline';
import LGPDReport from './LGPDReport';
import AIChat from './AIChat';
import Dashboard from './Dashboard';
import PDFExport from './PDFExport';
import DeepAnalysisPanel from './DeepAnalysisPanel';
import FeatureGate from './FeatureGate';
import EventAuditPanel from './EventAuditPanel';
import GTMQualityPanel from './GTMQualityPanel';
import DataQualityNotes from './DataQualityNotes';
import PrivacyExposurePanel from './PrivacyExposurePanel';
import RegulatoryExposurePanel from './RegulatoryExposurePanel';
import OutreachEnginePanel from './OutreachEnginePanel';
import ForensicEvidencePanel from './ForensicEvidencePanel';
import { useI18n } from '@/context/I18nContext';
import { toast } from '@/hooks/use-toast';
import { downloadAuditPDF, downloadAuditExcel } from '@/lib/exportUtils';

interface Tag {
    id: string;
    name: string;
    type: string;
    position: number;
    lineNumber: number;
    matchedPattern: string;
    tagId: string | null;
    dataCollected: string[];
    lgpdRisk: string;
    context: string;
    isBeforeConsent: boolean;
}

interface NewAuditResult {
    url: string;
    timestamp: string;
    tags: Tag[];
    tagCount: number;
    typeCounts: Record<string, number>;
    duplicates: any[];
    loadingOrder: any[];
    privacy: {
        jurisdiction: string;
        framework: string;
        confidenceLevel: string;
        consentRisks: string[];
        disclosureGaps: string[];
        violations: any[];
        total_violations: number;
        estimatedRiskExposure: string;
        has_consent_tool: boolean;
        has_universal_analytics: boolean;
        compliance_score: number;
    };
    score: number;
    scoreAvailable?: boolean;
    scores?: {
        auditScore: number;
        trackingQualityScore: number;
        eventArchitectureScore: number;
        datalayerQualityScore: number;
        consentIntegrityScore: number;
        privacyRiskScore: number;
        tagDuplicationRisk?: number;
        estimatedBusinessImpact?: string;
    };
    gtmQuality?: any;
    events?: any;
    consentAudit?: any;
    recommendations?: any[];
    dataQualityNotes?: any[];
    // New privacy engine
    personalDataFindings?: any[];
    sensitiveDataFindings?: any[];
    regulatoryExposure?: any;
    scanMethod?: string;
    summary: {
        totalTags: number;
        consentDetected: boolean;
        consentModeV2?: boolean;
        hasUniversalAnalytics: boolean;
        violationsCount: number;
        estimatedFine: string;
        piiExposureCount?: number;
        sensitiveDataCount?: number;
        securityIssuesCount?: number;
        eventsDetected?: number;
        duplicatesDetected?: number;
    };
    pageReports?: any[];
}

const NewAuditResults = ({ result, scanId }: { result: NewAuditResult, scanId?: string }) => {
    const { t } = useI18n();
    const limits = {
        showViolationDetails: true,
        showLineNumbers: true,
        visibilityPercentage: 100,
    };
    const isFeatureAvailable = (_feature: string) => true;
    const handleUpgradeLock = (_feature: string) => {};


    // Accordion state for duplicates section
    const [dupSectionOpen, setDupSectionOpen] = useState(true);
    const [dupExpanded, setDupExpanded] = useState<Record<number, boolean>>({});
    const expandAllDups = () => {
        const all: Record<number, boolean> = {};
        (result.duplicates || []).forEach((_, i) => { all[i] = true; });
        setDupExpanded(all);
    };
    const collapseAllDups = () => setDupExpanded({});
    const anyDupOpen = Object.values(dupExpanded).some(Boolean);

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-600 bg-green-100';
        if (score >= 50) return 'text-yellow-600 bg-yellow-100';
        return 'text-red-600 bg-red-100';
    };

    const handleCopyReport = () => {
        const violationsText = result.privacy.violations
            .map(v => `- ${v.tag}: ${v.violation} (${v.article})`)
            .join('\n');

        const tagsText = result.tags
            .map(t => `- ${t.name} (${t.type}) — Linha ${t.lineNumber || 'não disponível'}`)
            .join('\n');

        const report = `
DataTrust Audit Report
================
URL: ${result.url}
Data: ${new Date(result.timestamp).toLocaleString('pt-BR')}

Score Técnico de Auditoria: ${result.scoreAvailable === false ? 'Não disponível' : `${result.score}%`}
Total de Tags: ${result.tagCount}
Indicadores Técnicos: ${result.privacy.total_violations}
Contexto de Exposição: ${result.privacy.estimatedRiskExposure}
Jurisdição: ${result.privacy.jurisdiction} (${result.privacy.framework})

Tags Detectadas:
${tagsText}

Violações:
${violationsText}
        `.trim();

        navigator.clipboard.writeText(report);
        toast({ title: 'Relatório copiado!', description: 'Resumo copiado para a área de transferência.' });
    };

    const handleExportJSON = () => {
        const exportData = result;

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `datatrust-audit-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: 'Exportado!', description: 'Relatório exportado em formato JSON.' });
    };

    const handleExportPDF = async () => {
        try {
            toast({ title: 'Gerando PDF...', description: 'Aguarde, criando relatório profissional.' });
            await downloadAuditPDF(result as any);
            toast({ title: '✅ PDF Exportado!', description: 'Relatório DataTrust baixado com sucesso.' });
        } catch (err) {
            console.error('[exportPDF] erro:', err);
            toast({ title: 'Erro ao gerar PDF', description: String(err), variant: 'destructive' });
        }
    };

    const handleExportExcel = async () => {
        try {
            toast({ title: 'Gerando Excel...', description: 'Aguarde, criando planilha com todas as evidências.' });
            downloadAuditExcel(result as any);
            toast({ title: '✅ Excel Exportado!', description: 'Planilha com 7 abas de evidências baixada.' });
        } catch (err) {
            console.error('[exportExcel] erro:', err);
            toast({ title: 'Erro ao gerar Excel', description: String(err), variant: 'destructive' });
        }
    };

    const visibleTagCount = result.tags.length;
    const visibleTags = result.tags;
    const hasMoreTags = false;

    return (
        <div className="space-y-4">
            {/* ─── Header banner ─── */}
            <Card className="shadow-lg border-0 bg-gradient-to-r from-blue-600 to-indigo-700 text-white overflow-hidden">
                <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                                <Globe className="w-6 h-6" />
                                {t('result.title')}
                            </h2>
                            <p className="text-blue-100 flex items-center gap-2">
                                <code className="bg-white/20 px-2 py-1 rounded text-sm">{result.url}</code>
                            </p>
                            <p className="text-blue-200 text-sm mt-2">
                                {new Date(result.timestamp).toLocaleString('pt-BR')}
                            </p>
                        </div>
                        <div className="text-center">
                            <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold ${result.scoreAvailable === false ? "text-slate-600 bg-slate-100" : getScoreColor(result.score)} shadow-lg`}>
                                {result.scoreAvailable === false ? "N/A" : result.score}
                            </div>
                            <p className="text-blue-100 text-sm mt-2">{t('dashboard.score_title')}</p>
                        </div>
                    </div>

                    {/* Quick stats */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
                        <div className="bg-white/10 rounded-lg p-4 text-center backdrop-blur-sm">
                            <div className="text-3xl font-bold">{result.tagCount}</div>
                            <div className="text-sm text-blue-100">{t('dashboard.tags_detected')}</div>
                        </div>
                        <div className="bg-white/10 rounded-lg p-4 text-center backdrop-blur-sm">
                            <div className="text-3xl font-bold text-red-300">{result.privacy.total_violations}</div>
                            <div className="text-sm text-blue-100">Indicadores técnicos</div>
                        </div>
                        <div className="bg-white/10 rounded-lg p-4 text-center backdrop-blur-sm">
                            <div className="text-3xl font-bold text-cyan-300">{result.summary?.eventsDetected ?? 0}</div>
                            <div className="text-sm text-blue-100">{t('result.events_ga4')}</div>
                        </div>
                        <div className="bg-white/10 rounded-lg p-4 text-center backdrop-blur-sm">
                            {result.privacy.has_consent_tool ? (
                                <CheckCircle className="w-8 h-8 text-green-400 mx-auto" />
                            ) : (
                                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                            )}
                            <div className="text-sm text-blue-100 mt-2">
                                {result.privacy.has_consent_tool ? 'CMP/sinal de consentimento observado' : 'CMP não observado'}
                            </div>
                        </div>
                        <div className="bg-white/10 rounded-lg p-4 text-center backdrop-blur-sm">
                            {limits.showViolationDetails ? (
                                <div className="text-lg font-bold text-orange-300 line-clamp-2 leading-tight mt-1">{result.privacy.estimatedRiskExposure}</div>
                            ) : (
                                <button
                                    onClick={() => handleUpgradeLock('showViolationDetails')}
                                    className="text-lg font-bold text-orange-300 blur-sm select-none cursor-pointer hover:blur-none transition-all mt-1"
                                    title={t('result.estimated_risk_hint')}
                                >
                                    {t('result.estimated_risk_blurred')}
                                </button>
                            )}
                            <div className="text-sm text-blue-100 mt-1">Contexto regulatório</div>
                        </div>
                    </div>

                    {/* ─── Export buttons — all available ─── */}
                    <div className="flex gap-2 mt-6 flex-wrap">
                        <Button variant="secondary" size="sm" onClick={handleCopyReport} className="flex items-center gap-2">
                            <Copy className="w-4 h-4" />
                            {t('buttons.copy')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleExportJSON} className="flex items-center gap-2">
                            <Download className="w-4 h-4" />
                            {t('buttons.export_json')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleExportPDF} className="flex items-center gap-2 bg-red-100 hover:bg-red-200 text-red-800">
                            <FileText className="w-4 h-4" />
                            {t('buttons.export_pdf')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleExportExcel} className="flex items-center gap-2 bg-green-100 hover:bg-green-200 text-green-800">
                            <FileSpreadsheet className="w-4 h-4" />
                            {t('buttons.export_excel')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* ─── Tags by type — MOVED below nav, inside first tab ─── */}
            {/* This now appears AFTER the nav, in the Dashboard tab */}

            {/* ─── Tags by category card + Duplicates ─── */}
            <Card className="shadow-lg border border-slate-800 bg-slate-900">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-slate-100">
                        <BarChart3 className="w-5 h-5 text-blue-400" />
                        {t('result.tags_by_category')}
                        <Badge className="ml-auto text-xs bg-slate-800 text-slate-300 border border-slate-700">
                            {limits.visibilityPercentage}% {t('result.visible')}
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(result.typeCounts || {}).map(([type, count]) => {
                            const typeLabels: Record<string, { label: string; color: string }> = {
                                consent:     { label: '🔐 Consentimento', color: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/60' },
                                tag_manager: { label: '📦 Tag Manager',  color: 'bg-blue-900/50 text-blue-300 border border-blue-700/60' },
                                analytics:   { label: '📊 Analytics',    color: 'bg-indigo-900/50 text-indigo-300 border border-indigo-700/60' },
                                advertising: { label: '📢 Publicidade',  color: 'bg-orange-900/50 text-orange-300 border border-orange-700/60' },
                                heatmap:     { label: '🔥 Heatmap',      color: 'bg-red-900/50 text-red-300 border border-red-700/60' },
                                support:     { label: '💬 Suporte',      color: 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/60' },
                            };
                            const info = typeLabels[type] || { label: type, color: 'bg-slate-800 text-slate-300 border border-slate-700' };
                            return (
                                <Badge key={type} className={`${info.color} text-sm px-3 py-1.5 font-medium`}>
                                    {info.label}: {count}
                                </Badge>
                            );
                        })}
                    </div>

                    {/* Duplicates — disponível — Collapsible container + simple list */}
                    {result.duplicates && result.duplicates.length > 0 && (
                        <FeatureGate feature="showViolationDetails" featureName="Tags duplicadas">
                            <div className="mt-4 rounded-xl border border-orange-500/30 bg-slate-900/90 shadow-md overflow-hidden">

                                {/* ── Header (accordion trigger) ── */}
                                <button
                                    onClick={() => setDupSectionOpen(v => !v)}
                                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-orange-900/20 transition-colors group border-b border-orange-500/20"
                                    aria-expanded={dupSectionOpen}
                                >
                                    <span className="flex items-center gap-2 font-semibold text-orange-300 text-sm">
                                        <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                                        {t('duplicates.title')}
                                        <span className="bg-orange-500/20 text-orange-300 border border-orange-600/40 text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                                            {result.duplicates.length}
                                        </span>
                                    </span>
                                    {dupSectionOpen
                                        ? <ChevronUp className="w-4 h-4 text-orange-400 group-hover:text-orange-200 transition-colors shrink-0" />
                                        : <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-orange-300 transition-colors shrink-0" />}
                                </button>

                                {/* ── Body ── */}
                                {dupSectionOpen && (
                                    <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-700/40 scrollbar-thin scrollbar-thumb-orange-700/30 scrollbar-track-transparent">
                                        {result.duplicates.map((dup, i) => {
                                            const isCritical = dup.severity === 'critical';
                                            const entityLabel: Record<string, string> = {
                                                tag: 'Tag', event: 'Evento', pixel: 'Pixel', ga4_config: 'GA4'
                                            };
                                            return (
                                                <div key={i} className="group/row px-4 py-2 flex items-start gap-3 hover:bg-slate-800/50 transition-colors">
                                                    {/* Severity dot */}
                                                    <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isCritical ? 'bg-red-500' : 'bg-amber-400'}`} />

                                                    {/* Name + recommendation */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-sm font-semibold text-orange-100 leading-tight">
                                                                {dup.name || dup.tag || '—'}
                                                            </span>
                                                            <span className="text-[10px] font-medium bg-slate-700/80 text-slate-400 border border-slate-600/50 rounded px-1.5 py-0.5 shrink-0">
                                                                {entityLabel[dup.entityType] || dup.entityType || 'Tag'}
                                                            </span>
                                                        </div>
                                                        {dup.recommendation && (
                                                            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug line-clamp-2 group-hover/row:line-clamp-none transition-all">
                                                                {dup.recommendation}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Count + severity */}
                                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                                                            isCritical
                                                                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                                                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                                        }`}>
                                                            {dup.occurrenceCount ?? dup.count ?? '?'}×
                                                        </span>
                                                        <span className={`text-[9px] font-semibold uppercase tracking-wide ${isCritical ? 'text-red-500' : 'text-amber-500'}`}>
                                                            {isCritical ? 'Crítico' : 'Aviso'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </FeatureGate>
                    )}
                </CardContent>
            </Card>

            {/* ─── Main tabs ─── */}
            <Tabs defaultValue="dashboard" className="w-full">
                {/* Sticky nav positioned right below header — clears app header height */}
                <div className="sticky top-[56px] z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 -mx-4 px-4 shadow-sm">
                    <TabsList className="flex overflow-x-auto w-full h-auto gap-0.5 p-1 bg-transparent scrollbar-hide">
                        <TabsTrigger value="dashboard" className="flex items-center gap-1.5 text-xs rounded-lg whitespace-nowrap shrink-0">
                            <PieChart className="w-3.5 h-3.5" />
                            {t('audit_nav.overview')}
                        </TabsTrigger>

                        <TabsTrigger value="events" className="flex items-center gap-1.5 text-xs rounded-lg whitespace-nowrap shrink-0">
                            <Activity className="w-3.5 h-3.5" />
                            {t('audit_nav.events')}
                        </TabsTrigger>

                        <TabsTrigger value="gtm-quality" className="flex items-center gap-1.5 text-xs rounded-lg whitespace-nowrap shrink-0">
                            <Box className="w-3.5 h-3.5" />
                            {t('audit_nav.gtmQuality')}
                        </TabsTrigger>

                        <TabsTrigger value="deep" className="flex items-center gap-1.5 text-xs rounded-lg whitespace-nowrap shrink-0">
                            <Sparkles className="w-3.5 h-3.5" />
                            Análise IA
                        </TabsTrigger>

                        <TabsTrigger value="timeline" className="flex items-center gap-1.5 text-xs rounded-lg whitespace-nowrap shrink-0">
                            <Clock className="w-3.5 h-3.5" />
                            {t('audit_nav.timeline')}
                        </TabsTrigger>

                        <TabsTrigger value="lgpd" className="flex items-center gap-1.5 text-xs rounded-lg whitespace-nowrap shrink-0">
                            <Shield className="w-3.5 h-3.5" />
                            {t('audit_nav.privacy')}
                        </TabsTrigger>

                        <TabsTrigger value="privacy-exposure" className="flex items-center gap-1.5 text-xs rounded-lg whitespace-nowrap shrink-0">
                            <Shield className="w-3.5 h-3.5 text-orange-500" />
                            {t('audit_nav.dataExposure')}
                            {(result.sensitiveDataFindings?.length ?? 0) > 0 && (
                                <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                                    {result.sensitiveDataFindings!.length}
                                </span>
                            )}
                        </TabsTrigger>

                        <TabsTrigger value="regulatory" className="flex items-center gap-1.5 text-xs rounded-lg whitespace-nowrap shrink-0">
                            <FileText className="w-3.5 h-3.5 text-blue-500" />
                            {t('audit_nav.regulatoryExposure')}
                        </TabsTrigger>

                        {result.pageReports && (
                            <TabsTrigger value="deep-scan" className="flex items-center gap-1.5 text-xs rounded-lg whitespace-nowrap shrink-0">
                                <Globe className="w-3.5 h-3.5" />
                                {t('audit_nav.deepScan')}
                            </TabsTrigger>
                        )}

                        <TabsTrigger value="details" className="flex items-center gap-1.5 text-xs rounded-lg whitespace-nowrap shrink-0">
                            <FileText className="w-3.5 h-3.5" />
                            {t('audit_nav.results')}
                        </TabsTrigger>

                        {/* Outreach Engine — always visible */}
                        <TabsTrigger value="outreach" className="flex items-center gap-1.5 text-xs rounded-lg whitespace-nowrap shrink-0">
                            <Briefcase className="w-3.5 h-3.5 text-violet-400" />
                            <span className="text-violet-400 font-semibold">Prospecção</span>
                            {(result.sensitiveDataFindings?.length ?? 0) > 0 && (
                                <span className="ml-0.5 bg-red-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none animate-pulse">
                                    !
                                </span>
                            )}
                        </TabsTrigger>

                        {/* Forensic Evidence — always visible */}
                        <TabsTrigger value="forensic" className="flex items-center gap-1.5 text-xs rounded-lg whitespace-nowrap shrink-0">
                            <Fingerprint className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="text-cyan-400 font-semibold">Forense</span>
                            {result.tags.some(t => t.isBeforeConsent) && (
                                <span className="ml-0.5 bg-red-600 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none animate-pulse">
                                    !
                                </span>
                            )}
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* Dashboard */}
                <TabsContent value="dashboard" className="mt-6">
                    <Dashboard result={result} />
                </TabsContent>

                {/* Events */}
                <TabsContent value="events" className="mt-6">
                    <EventAuditPanel data={result.events || null} />
                </TabsContent>

                {/* GTM Quality */}
                <TabsContent value="gtm-quality" className="mt-6">
                    <GTMQualityPanel data={result.gtmQuality || null} />
                </TabsContent>

                {/* AI Deep Analysis — disponível */}
                <TabsContent value="deep" className="mt-6">
                    <FeatureGate feature="deepAnalysis" featureName="Análise completa">
                        <DeepAnalysisPanel
                            url={result.url}
                            detectedTags={result.tags}
                            hasConsentTool={result.privacy.has_consent_tool}
                        />
                    </FeatureGate>
                </TabsContent>

                {/* Timeline — disponível */}
                <TabsContent value="timeline" className="mt-6">
                    <FeatureGate feature="showLineNumbers" featureName="Script Timeline com linha de código">
                        <ScriptTimeline
                            tags={result.tags}
                            loadingOrder={result.loadingOrder}
                            hasConsentTool={result.privacy.has_consent_tool}
                        />
                    </FeatureGate>
                </TabsContent>

                <TabsContent value="lgpd" className="mt-6">
                    <FeatureGate feature="showViolationDetails" featureName="Relatório de Privacidade completo">
                        <LGPDReport 
                            lgpdAnalysis={{
                                ...result.privacy,
                                totalViolations: result.privacy.total_violations,
                                hasConsentTool: result.privacy.has_consent_tool,
                                hasUniversalAnalytics: result.privacy.has_universal_analytics,
                                complianceScore: result.privacy.compliance_score
                            } as any} 
                            url={result.url} 
                        />
                    </FeatureGate>
                </TabsContent>

                {/* Privacy Exposure — new */}
                <TabsContent value="privacy-exposure" className="mt-4">
                    <PrivacyExposurePanel
                        personalDataFindings={result.personalDataFindings || []}
                        sensitiveDataFindings={result.sensitiveDataFindings || []}
                        hasConsentMechanism={result.privacy.has_consent_tool}
                        scanMethod={result.scanMethod || 'html_source'}
                    />
                </TabsContent>

                {/* Regulatory Exposure — new */}
                <TabsContent value="regulatory" className="mt-4">
                    <RegulatoryExposurePanel
                        regulatoryExposure={result.regulatoryExposure || null}
                        personalDataFindings={result.personalDataFindings || []}
                        sensitiveDataFindings={result.sensitiveDataFindings || []}
                        tags={result.tags || []}
                        estimatedRiskExposure={result.privacy?.estimatedRiskExposure}
                        score={result.score}
                    />
                </TabsContent>


                {/* Deep Scan multi-page */}
                {result.pageReports && (
                    <TabsContent value="deep-scan" className="mt-6">
                        <FeatureGate feature="deepAnalysis" featureName="Deep Scan multi-página">
                            <DeepAnalysisPanel
                                url={result.url}
                                detectedTags={result.tags}
                                hasConsentTool={result.privacy.has_consent_tool}
                                pages={result.pageReports}
                                ga4PropertyId={result.tags.find(t => t.name.includes('GA4'))?.tagId || ''}
                            />
                        </FeatureGate>
                    </TabsContent>
                )}

                {/* Tag details table */}
                <TabsContent value="details" className="mt-6">
                    <Card className="shadow-lg border-0">
                        <CardHeader>
                            <CardTitle>📋 {t('result.tag_list_title')}</CardTitle>
                            <CardDescription>
                                {hasMoreTags ? (
                                    <span className="flex items-center gap-2">
                                        <Lock className="w-3 h-3" />
                                        {t('result.showing_of').replace('{visible}', String(visibleTagCount)).replace('{total}', String(result.tags.length)).replace('{pct}', String(limits.visibilityPercentage))}{' '}
                                        <button
                                            className="text-blue-600 underline hover:no-underline"
                                            onClick={() => handleUpgradeLock('showViolationDetails')}
                                        >
                                            {t('result.upgrade_to_see_all')}
                                        </button>
                                        )
                                    </span>
                                ) : (
                                    t('result.tags_in_source').replace('{n}', String(result.tags.length))
                                )}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="border-b-2 border-gray-200">
                                            <th className="text-left p-3 font-semibold">#</th>
                                            <th className="text-left p-3 font-semibold">Tag</th>
                                            <th className="text-left p-3 font-semibold">{t('tracker.type_label')}</th>
                                            <th className="text-left p-3 font-semibold flex items-center gap-1.5">
                                                {t('tracker.line_in_code')}
                                                {!isFeatureAvailable('showLineNumbers') && <Lock className="w-3 h-3 text-amber-500" />}
                                            </th>
                                            {/* Tag ID / pattern — disponível */}
                                            {isFeatureAvailable('showViolationDetails') && (
                                                <th className="text-left p-3 font-semibold">{t('tracker.id_pattern')}</th>
                                            )}
                                            <th className="text-left p-3 font-semibold">{t('result.risk_lgpd')}</th>
                                            <th className="text-left p-3 font-semibold">{t('result.status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleTags.map((tag, index) => (
                                            <tr
                                                key={index}
                                                className={`border-b border-gray-100 hover:bg-gray-50 ${tag.isBeforeConsent ? 'bg-red-50' : ''}`}
                                            >
                                                <td className="p-3">
                                                    <Badge variant="outline">{index + 1}</Badge>
                                                </td>
                                                <td className="p-3 font-medium">{tag.name}</td>
                                                <td className="p-3">
                                                    <Badge className={
                                                        tag.type === 'consent' ? 'bg-green-100 text-green-800' :
                                                            tag.type === 'tag_manager' ? 'bg-blue-100 text-blue-800' :
                                                                tag.type === 'analytics' ? 'bg-indigo-100 text-indigo-800' :
                                                                    tag.type === 'advertising' ? 'bg-orange-100 text-orange-800' :
                                                                        tag.type === 'heatmap' ? 'bg-red-100 text-red-800' :
                                                                            'bg-gray-100 text-gray-800'
                                                    }>
                                                        {tag.type}
                                                    </Badge>
                                                </td>
                                                <td className="p-3">
                                                    {isFeatureAvailable('showLineNumbers') ? (
                                                        (tag.lineNumber && tag.lineNumber > 0)
                                                            ? <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{tag.lineNumber}</code>
                                                            : <span className="text-xs text-gray-400 italic">{t('tracker.loaded_dynamically')}</span>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[10px] uppercase bg-amber-50 text-amber-600 border-amber-200 gap-1 opacity-70 cursor-pointer hover:opacity-100 transition-opacity" onClick={() => handleUpgradeLock('showLineNumbers')}>
                                                            <Lock className="w-2.5 h-2.5" />
                                                            {t('result.locked_premium')}
                                                        </Badge>
                                                    )}
                                                </td>
                                                {/* ID/Pattern — disponível */}
                                                {isFeatureAvailable('showViolationDetails') && (
                                                    <td className="p-3">
                                                        <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                                                            {tag.tagId || (tag.matchedPattern ? tag.matchedPattern.substring(0, 20) : '—')}
                                                        </code>
                                                    </td>
                                                )}
                                                <td className="p-3">
                                                    <Badge className={
                                                        tag.lgpdRisk === 'critical' ? 'bg-red-100 text-red-800' :
                                                            tag.lgpdRisk === 'high' ? 'bg-orange-100 text-orange-800' :
                                                                tag.lgpdRisk === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                                    'bg-green-100 text-green-800'
                                                    }>
                                                        {tag.lgpdRisk}
                                                    </Badge>
                                                </td>
                                                <td className="p-3">
                                                    {tag.isBeforeConsent ? (
                                                        <Badge className="bg-amber-100 text-amber-800">Sinal pré-consentimento</Badge>
                                                    ) : (
                                                        <Badge className="bg-slate-100 text-slate-700">Não observado antes do consentimento</Badge>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}

                                        {/* Locked rows hint */}
                                        {hasMoreTags && (
                                            <tr className="border-b border-dashed border-gray-200 bg-gray-50/50">
                                                <td colSpan={7} className="p-3 text-center">
                                                    <button
                                                        className="flex items-center gap-2 mx-auto text-sm text-gray-400 hover:text-blue-600"
                                                        onClick={() => handleUpgradeLock('showViolationDetails')}
                                                    >
                                                        <Lock className="w-3 h-3" />
                                                        {t('result.hidden_tags').replace('{n}', String(result.tags.length - visibleTagCount))}
                                                    </button>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Outreach Engine — Audit & Prospect */}
                <TabsContent value="outreach" className="mt-4">
                    <OutreachEnginePanel
                        result={result}
                        onRescan={undefined}
                        onExportPDF={isFeatureAvailable('pdfExport') ? handleExportPDF : undefined}
                        onExportExcel={isFeatureAvailable('excelExport') ? handleExportExcel : undefined}
                        onExportJSON={isFeatureAvailable('jsonExport') ? handleExportJSON : undefined}
                        canExportPDF={isFeatureAvailable('pdfExport')}
                        canExportExcel={isFeatureAvailable('excelExport')}
                        canExportJSON={isFeatureAvailable('jsonExport')}
                    />
                </TabsContent>

                {/* Forensic Evidence */}
                <TabsContent value="forensic" className="mt-4">
                    <ForensicEvidencePanel
                        tags={result.tags}
                        hasConsentTool={result.privacy.has_consent_tool ?? false}
                        scanTimestamp={result.timestamp}
                        personalDataFindings={result.personalDataFindings ?? []}
                        sensitiveDataFindings={result.sensitiveDataFindings ?? []}
                        url={result.url}
                    />
                </TabsContent>
            </Tabs>

            {/* Data Quality Notes */}
            {result.dataQualityNotes && result.dataQualityNotes.length > 0 && (
                <DataQualityNotes notes={result.dataQualityNotes} />
            )}

            {/* AI Chat — dual mode: General + LGPD Compliance Bot */}
            <AIChat
                context={{
                    violations: result.privacy.total_violations,
                    score: result.score,
                    hasConsentTool: result.privacy.has_consent_tool,
                    tags: result.tags,
                    personalDataFindings: result.personalDataFindings || [],
                    sensitiveDataFindings: result.sensitiveDataFindings || [],
                    estimatedFine: result.privacy.estimatedRiskExposure,
                    url: result.url,
                    piiExposure: result.summary?.piiExposureCount || 0,
                    securityIssues: result.summary?.securityIssuesCount || 0,
                    isDeepScan: !!result.pageReports,
                    exposureLevel: result.regulatoryExposure?.exposure_level,
                }}
            />

        </div>
    );
};

export default NewAuditResults;
