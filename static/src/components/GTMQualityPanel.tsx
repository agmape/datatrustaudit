import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    CheckCircle,
    XCircle,
    AlertTriangle,
    Box,
    Code2,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import ConfidenceBadge from './ConfidenceBadge';
import { useI18n } from '@/context/I18nContext';

interface GTMQualityFinding {
    check: string;
    label: string;
    status: string;
    description: string;
    evidence: string | null;
    recommendation: string | null;
    confidence: string;
}

interface GTMQualityData {
    containers: string[];
    containerCount: number;
    hasNoscript: boolean;
    datalayerInitBeforeGtm: boolean;
    datalayerOverwritten: boolean;
    gtmInHead: boolean;
    gtmLoadedMultipleTimes: boolean;
    findings: GTMQualityFinding[];
    score: number;
}

interface GTMQualityPanelProps {
    data: GTMQualityData | null;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    ok: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
    critical: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
};

const GTMQualityPanel = ({ data }: GTMQualityPanelProps) => {
    const { t } = useI18n();
    const [findingsExpanded, setFindingsExpanded] = useState<Record<number, boolean>>({});
    const expandAll = () => {
        const all: Record<number, boolean> = {};
        (data?.findings || []).forEach((_, i) => { all[i] = true; });
        setFindingsExpanded(all);
    };
    const collapseAll = () => setFindingsExpanded({});
    const anyOpen = Object.values(findingsExpanded).some(Boolean);

    if (!data || data.containerCount === 0) {
        return (
            <Card className="shadow-lg border-0">
                <CardContent className="pt-6">
                    <div className="text-center py-12 text-gray-500">
                        <Box className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-medium">{t('gtm.no_container')}</p>
                        <p className="text-sm mt-2">
                            {t('gtm.no_container_desc')}
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const scoreColor = data.score >= 80 ? 'text-emerald-600' : data.score >= 50 ? 'text-amber-600' : 'text-red-600';
    const progressColor = data.score >= 80 ? 'bg-emerald-500' : data.score >= 50 ? 'bg-amber-500' : 'bg-red-500';

    return (
        <div className="space-y-6">
            {/* Score + Containers Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-2 shadow-lg border-0">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Box className="w-5 h-5" />
                            {t('gtm.quality_title')}
                        </CardTitle>
                        <CardDescription>{t('gtm.quality_desc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-4 mb-4">
                            <div className={`text-4xl font-bold ${scoreColor}`}>{data.score}%</div>
                            <div className="flex-1">
                                <Progress value={data.score} className="h-3" />
                            </div>
                        </div>
                        <style>{`.progress-bar-fill [data-state="complete"],.progress-bar-fill [role="progressbar"] > div { background: var(--bar-color) !important; }`}</style>
                    </CardContent>
                </Card>

                <Card className="shadow-lg border-0">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <Code2 className="w-4 h-4" />
                            {t('gtm.containers_title')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {data.containers.map((id) => (
                                <Badge key={id} className="bg-blue-100 text-blue-800 border-blue-200 font-mono mr-2">
                                    {id}
                                </Badge>
                            ))}
                            {data.gtmLoadedMultipleTimes && (
                                <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    {t('gtm.duplicate_container')}
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick checklist */}
            <Card className="shadow-lg border-0">
                <CardHeader>
                    <CardTitle className="text-lg">{t('gtm.checklist_title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                            { label: t('gtm.check_noscript'), ok: data.hasNoscript },
                            { label: t('gtm.check_datalayer_before'), ok: data.datalayerInitBeforeGtm },
                            { label: t('gtm.check_gtm_in_head'), ok: data.gtmInHead },
                            { label: t('gtm.check_single_container'), ok: !data.gtmLoadedMultipleTimes },
                            { label: t('gtm.check_datalayer_not_overwritten'), ok: !data.datalayerOverwritten },
                        ].map((item) => (
                            <div
                                key={item.label}
                                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                    item.ok
                                        ? 'bg-emerald-50 border-emerald-200'
                                        : 'bg-red-50 border-red-200'
                                }`}
                            >
                                {item.ok ? (
                                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                                ) : (
                                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                                )}
                                <span className={`text-sm font-medium ${item.ok ? 'text-emerald-800' : 'text-red-800'}`}>
                                    {item.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Detailed findings — with accordion */}
            {data.findings.length > 0 && (
                <Card className="shadow-lg border-0">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center justify-between">
                            <span>{t('gtm.findings_title')}</span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={expandAll}
                                    className="text-xs font-normal text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-2 py-1 bg-blue-50 transition-colors"
                                >
                                    {t('gtm.expand_all')}
                                </button>
                                {anyOpen && (
                                    <button
                                        onClick={collapseAll}
                                        className="text-xs font-normal text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-2 py-1 bg-blue-50 transition-colors"
                                    >
                                        {t('gtm.collapse_all')}
                                    </button>
                                )}
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {data.findings.map((finding, i) => {
                                const sc = STATUS_CONFIG[finding.status] || STATUS_CONFIG.warning;
                                const StatusIcon = sc.icon;
                                const isOpen = !!findingsExpanded[i];

                                return (
                                    <div
                                        key={`${finding.check}-${i}`}
                                        className={`rounded-lg border overflow-hidden ${sc.bg}`}
                                    >
                                        <button
                                            className="w-full flex items-center justify-between px-4 py-3 text-left"
                                            onClick={() => setFindingsExpanded(prev => ({ ...prev, [i]: !prev[i] }))}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <StatusIcon className={`w-4 h-4 shrink-0 ${sc.color}`} />
                                                <span className="font-semibold text-sm truncate">{finding.label}</span>
                                                <ConfidenceBadge level={finding.confidence as 'high' | 'medium' | 'low'} />
                                            </div>
                                            {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                                        </button>
                                        {isOpen && (
                                            <div className="px-4 pb-3 pt-1 border-t border-gray-200/50">
                                                <p className="text-sm text-gray-600">{finding.description}</p>
                                                {finding.evidence && (
                                                    <pre className="text-[11px] bg-gray-900 text-gray-100 p-2 rounded mt-2 overflow-x-auto max-w-full">
                                                        {finding.evidence}
                                                    </pre>
                                                )}
                                                {finding.recommendation && (
                                                    <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded p-2 mt-2">
                                                        💡 {finding.recommendation}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default GTMQualityPanel;
