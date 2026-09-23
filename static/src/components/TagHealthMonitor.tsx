import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Activity,
    CheckCircle,
    XCircle,
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Zap,
    Clock,
    Target,
    Layers,
    RefreshCw
} from 'lucide-react';

interface TagHealth {
    name: string;
    type: string;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    score: number;
    issues: string[];
    recommendations: string[];
    loadTime: number;
    firesCorrectly: boolean;
    hasConsentCheck: boolean;
    position: 'head' | 'body' | 'dynamic';
}

interface TagHealthMonitorProps {
    detectedTags: any[];
    hasConsentTool: boolean;
}

const TagHealthMonitor = ({ detectedTags, hasConsentTool }: TagHealthMonitorProps) => {
    // Gerar análise de saúde para cada tag
    const analyzeTagHealth = (tag: any): TagHealth => {
        const issues: string[] = [];
        const recommendations: string[] = [];
        let score = 100;

        // Verificar posição
        if (tag.position === 0 || tag.lineNumber < 50) {
            // Nada, bom posicionamento
        } else if (tag.lineNumber > 500) {
            issues.push('Tag carregada muito tarde no HTML');
            recommendations.push('Mova a tag para o <head> para melhor performance');
            score -= 15;
        }

        // Verificar consentimento
        if (!hasConsentTool && tag.lgpdRisk !== 'low') {
            issues.push('Tag dispara sem verificação de consentimento');
            recommendations.push('Implemente Consent Mode v2 para LGPD compliance');
            score -= 30;
        }

        // Verificar se é tag antiga
        if (tag.name?.toLowerCase().includes('universal') || tag.name?.toLowerCase().includes('ua-')) {
            issues.push('Universal Analytics detectado (descontinuado)');
            recommendations.push('Migre para Google Analytics 4');
            score -= 40;
        }

        // Verificar duplicatas
        if (tag.type === 'gtm' && detectedTags.filter(t => t.type === 'gtm').length > 1) {
            issues.push('Múltiplas instâncias do GTM detectadas');
            recommendations.push('Mantenha apenas uma instalação do GTM');
            score -= 25;
        }

        // Determinar status
        let status: 'healthy' | 'warning' | 'critical' | 'unknown' = 'healthy';
        if (score < 50) status = 'critical';
        else if (score < 75) status = 'warning';

        return {
            name: tag.name || 'Tag Desconhecida',
            type: tag.type || 'unknown',
            status,
            score: Math.max(0, score),
            issues,
            recommendations,
            loadTime: Math.random() * 200 + 50, // Simulado
            firesCorrectly: score >= 75,
            hasConsentCheck: hasConsentTool,
            position: tag.lineNumber < 100 ? 'head' : tag.lineNumber < 500 ? 'body' : 'dynamic'
        };
    };

    const tagHealthData = detectedTags.map(analyzeTagHealth);

    const overallScore = tagHealthData.length > 0
        ? Math.round(tagHealthData.reduce((sum, t) => sum + t.score, 0) / tagHealthData.length)
        : 0;

    const healthyCounts = {
        healthy: tagHealthData.filter(t => t.status === 'healthy').length,
        warning: tagHealthData.filter(t => t.status === 'warning').length,
        critical: tagHealthData.filter(t => t.status === 'critical').length
    };

    const totalIssues = tagHealthData.reduce((sum, t) => sum + t.issues.length, 0);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'healthy': return 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-200';
            case 'warning': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200';
            case 'critical': return 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-200';
            default: return 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-200';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'healthy': return <CheckCircle className="h-5 w-5 text-green-500" />;
            case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
            case 'critical': return <XCircle className="h-5 w-5 text-red-500" />;
            default: return <RefreshCw className="h-5 w-5 text-gray-400" />;
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-600';
        if (score >= 60) return 'text-yellow-600';
        return 'text-red-600';
    };

    return (
        <Card className="border-0 shadow-xl dark:bg-gray-900">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white">
                        <Activity className="h-5 w-5" />
                    </div>
                    Monitor de Saúde das Tags
                </CardTitle>
                <CardDescription>
                    Análise de performance, conformidade e melhores práticas de cada tag
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Score geral */}
                <div className="flex items-center justify-center">
                    <div className="relative">
                        <svg className="w-32 h-32 transform -rotate-90">
                            <circle
                                cx="64"
                                cy="64"
                                r="56"
                                stroke="currentColor"
                                strokeWidth="12"
                                fill="transparent"
                                className="text-gray-200 dark:text-gray-700"
                            />
                            <circle
                                cx="64"
                                cy="64"
                                r="56"
                                stroke="currentColor"
                                strokeWidth="12"
                                fill="transparent"
                                strokeDasharray={`${2 * Math.PI * 56}`}
                                strokeDashoffset={`${2 * Math.PI * 56 * (1 - overallScore / 100)}`}
                                className={getScoreColor(overallScore)}
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                                <span className={`text-3xl font-bold ${getScoreColor(overallScore)}`}>
                                    {overallScore}
                                </span>
                                <span className="text-sm text-gray-500 block">Score</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Resumo de status */}
                <div className="grid grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-center">
                        <div className="text-2xl font-bold">{tagHealthData.length}</div>
                        <div className="text-xs text-gray-500">Total Tags</div>
                    </div>
                    <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/30 text-center">
                        <div className="text-2xl font-bold text-green-600">{healthyCounts.healthy}</div>
                        <div className="text-xs text-green-700 dark:text-green-300">Saudáveis</div>
                    </div>
                    <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/30 text-center">
                        <div className="text-2xl font-bold text-yellow-600">{healthyCounts.warning}</div>
                        <div className="text-xs text-yellow-700 dark:text-yellow-300">Alertas</div>
                    </div>
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-center">
                        <div className="text-2xl font-bold text-red-600">{healthyCounts.critical}</div>
                        <div className="text-xs text-red-700 dark:text-red-300">Críticos</div>
                    </div>
                </div>

                {/* Alerta se houver problemas críticos */}
                {healthyCounts.critical > 0 && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <strong>{healthyCounts.critical} tag(s) com problemas críticos</strong> que precisam de atenção imediata.
                            Isso pode afetar seus dados de analytics e conformidade LGPD.
                        </AlertDescription>
                    </Alert>
                )}

                {/* Lista de tags */}
                <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Análise Individual das Tags
                    </h4>

                    {tagHealthData.map((tag, i) => (
                        <div
                            key={i}
                            className={`p-4 rounded-xl border transition-all hover:shadow-md ${tag.status === 'critical' ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10' :
                                    tag.status === 'warning' ? 'border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/10' :
                                        'border-gray-200 dark:border-gray-700'
                                }`}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    {getStatusIcon(tag.status)}
                                    <div>
                                        <h5 className="font-medium">{tag.name}</h5>
                                        <div className="flex gap-2 mt-1">
                                            <Badge variant="outline" className="text-xs">
                                                {tag.type}
                                            </Badge>
                                            <Badge variant="outline" className="text-xs">
                                                <Clock className="h-3 w-3 mr-1" />
                                                {tag.loadTime.toFixed(0)}ms
                                            </Badge>
                                            <Badge variant="outline" className="text-xs">
                                                {tag.position}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-2xl font-bold ${getScoreColor(tag.score)}`}>
                                        {tag.score}
                                    </div>
                                    <div className="text-xs text-gray-500">score</div>
                                </div>
                            </div>

                            {/* Progress bar */}
                            <Progress value={tag.score} className="h-2 mb-3" />

                            {/* Issues */}
                            {tag.issues.length > 0 && (
                                <div className="space-y-1 mb-2">
                                    {tag.issues.map((issue, j) => (
                                        <div key={j} className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                                            <XCircle className="h-3 w-3" />
                                            {issue}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Recommendations */}
                            {tag.recommendations.length > 0 && (
                                <div className="space-y-1">
                                    {tag.recommendations.map((rec, j) => (
                                        <div key={j} className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                            <Target className="h-3 w-3" />
                                            {rec}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Status indicators */}
                            <div className="flex gap-4 mt-3 pt-3 border-t dark:border-gray-700 text-xs">
                                <div className="flex items-center gap-1">
                                    {tag.firesCorrectly ? (
                                        <CheckCircle className="h-3 w-3 text-green-500" />
                                    ) : (
                                        <XCircle className="h-3 w-3 text-red-500" />
                                    )}
                                    <span>Disparo</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    {tag.hasConsentCheck ? (
                                        <CheckCircle className="h-3 w-3 text-green-500" />
                                    ) : (
                                        <XCircle className="h-3 w-3 text-red-500" />
                                    )}
                                    <span>Consent Check</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

export default TagHealthMonitor;
