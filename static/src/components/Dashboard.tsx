import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
    LineChart,
    Line,
    Area,
    AreaChart,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar
} from 'recharts';
import {
    Shield,
    AlertTriangle,
    CheckCircle,
    TrendingUp,
    BarChart3,
    PieChart as PieIcon,
    Activity
} from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { usePlan } from '@/context/PlanContext';

interface DashboardProps {
    result: {
        tags: any[];
        typeCounts: Record<string, number>;
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
        scores?: {
            auditScore: number;
            trackingQualityScore: number;
            eventArchitectureScore: number;
            datalayerQualityScore: number;
            consentIntegrityScore: number;
            privacyRiskScore: number;
        };
        loadingOrder: any[];
        summary: {
            piiExposureCount?: number;
            securityIssuesCount?: number;
        };
    };
}

const Dashboard = ({ result }: DashboardProps) => {
    const { t } = useI18n();
    const { limits } = usePlan();
    
    const visibilityPercentage = limits.visibilityPercentage || 100;
    const isTruncated = visibilityPercentage < 100;
    const visibleCount = Math.ceil(result.tags.length * (visibilityPercentage / 100));
    const visibleTags = result.tags.slice(0, visibleCount);
    
    // Dados para o gráfico de pizza de tipos de tags
    const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#6B7280'];

    const pieData = Object.entries(result.typeCounts || {}).map(([type, count], index) => {
        const labels: Record<string, string> = {
            consent: 'Consentimento',
            tag_manager: 'Tag Manager',
            analytics: 'Analytics',
            advertising: 'Publicidade',
            heatmap: 'Heatmap',
            support: 'Suporte',
            custom: 'Customizado'
        };
        return {
            name: labels[type] || type,
            value: count,
            color: COLORS[index % COLORS.length]
        };
    });

    // Dados para gráfico de barras de severidade
    const severityData = [
        {
            name: 'Crítico',
            count: result.privacy.violations.filter(v => v.severity === 'critical').length,
            color: '#EF4444'
        },
        {
            name: 'Alto',
            count: result.privacy.violations.filter(v => v.severity === 'high').length,
            color: '#F97316'
        },
        {
            name: 'Médio',
            count: result.privacy.violations.filter(v => v.severity === 'medium').length,
            color: '#EAB308'
        },
        {
            name: 'Baixo',
            count: result.privacy.violations.filter(v => v.severity === 'low').length,
            color: '#3B82F6'
        }
    ];

    // Dados para timeline de carregamento (limited by visibility)
    const timelineData = visibleTags.map((tag, index) => {
        const tagName = tag.name || tag.vendor || 'Unknown Tag';
        return {
            position: index + 1,
            name: tagName.length > 15 ? tagName.substring(0, 15) + '...' : tagName,
            fullName: tagName,
            lineNumber: tag.lineNumber || 0,
            risk: tag.lgpdRisk === 'critical' ? 100 :
                tag.lgpdRisk === 'high' ? 75 :
                    tag.lgpdRisk === 'medium' ? 50 : 25,
            isViolation: tag.isBeforeConsent ? 1 : 0
        };
    });

    // Score gauge data
    const scoreData = [
        { name: 'Score', value: result.score },
        { name: 'Remaining', value: 100 - result.score }
    ];

    const getScoreColor = (score: number) => {
        if (score >= 80) return '#10B981';
        if (score >= 50) return '#EAB308';
        return '#EF4444';
    };

    // 6-axis scores data
    const scores = result.scores;
    const radarData = scores ? [
        { axis: 'Tracking', value: scores.trackingQualityScore, fullMark: 100 },
        { axis: 'Eventos', value: scores.eventArchitectureScore, fullMark: 100 },
        { axis: 'DataLayer', value: scores.datalayerQualityScore, fullMark: 100 },
        { axis: 'Consent', value: scores.consentIntegrityScore, fullMark: 100 },
        { axis: 'Privacidade', value: scores.privacyRiskScore, fullMark: 100 },
        { axis: 'Geral', value: scores.auditScore, fullMark: 100 },
    ] : null;

    return (
        <div className="space-y-6">
            {/* Header Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-blue-100 text-sm">{t('dashboard.tags_detected')}</p>
                                <p className="text-3xl font-bold">{result.tags.length}</p>
                            </div>
                            <BarChart3 className="w-10 h-10 text-blue-200" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-red-100 text-sm">Indicadores de Privacidade</p>
                                <p className="text-3xl font-bold">{result.privacy.total_violations}</p>
                            </div>
                            <AlertTriangle className="w-10 h-10 text-red-200" />
                        </div>
                    </CardContent>
                </Card>

                <Card className={`bg-gradient-to-br ${result.privacy.has_consent_tool ? 'from-green-500 to-green-600' : 'from-orange-500 to-orange-600'} text-white`}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-white/80 text-sm">CMP Status</p>
                                <p className="text-xl font-bold">
                                    {result.privacy.has_consent_tool ? 'Detectado' : 'Ausente'}
                                </p>
                            </div>
                            {result.privacy.has_consent_tool ? (
                                <CheckCircle className="w-10 h-10 text-green-200" />
                            ) : (
                                <Shield className="w-10 h-10 text-orange-200" />
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-xl">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-indigo-100 text-sm">{t('dashboard.score_title')}</p>
                                <p className="text-3xl font-bold">{result.score}%</p>
                            </div>
                            <div className="relative">
                                <TrendingUp className="w-10 h-10 text-indigo-200" />
                                <Badge className="absolute -top-1 -right-1 bg-white text-indigo-600 border-indigo-200 text-[10px] px-1">PRO</Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Risk Dashboard - New Indicators */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <Card className="border-l-4 border-l-red-500 shadow-md transform transition-all hover:scale-[1.01]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700">
                            <AlertTriangle className="w-4 h-4" />
                            Exposição de PII (Vazamento de Dados)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div className="text-3xl font-bold text-red-600">
                                {result.summary?.piiExposureCount || 0}
                            </div>
                            <div className="text-right">
                                <Badge variant="destructive" className="animate-pulse">Risco Crítico</Badge>
                                <p className="text-xs text-gray-500 mt-1">{t('dashboard.pii_exposure')}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-orange-500 shadow-md transform transition-all hover:scale-[1.01]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-700">
                            <Shield className="w-4 h-4" />
                            Vulnerabilidades de Script (SRI/HTTPS)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div className="text-3xl font-bold text-orange-600">
                                {result.summary?.securityIssuesCount || 0}
                            </div>
                            <div className="text-right">
                                <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">Risco de Injeção</Badge>
                                <p className="text-xs text-gray-500 mt-1">Scripts carregados sem integridade ou via HTTP</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid md:grid-cols-2 gap-6">
                {/* Pie Chart - Tipos de Tags */}
                <Card className="shadow-lg border-0">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <PieIcon className="w-5 h-5" />
                            Distribuição por Tipo
                        </CardTitle>
                        <CardDescription>
                            Categorias de tags detectadas no site
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                    outerRadius={100}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Bar Chart - Severidade das Violações */}
                <Card className="shadow-lg border-0">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5" />
                            Violações por Severidade
                        </CardTitle>
                        <CardDescription>
                            Distribuição das violações LGPD por nível de risco
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={severityData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="count" name="Quantidade">
                                    {severityData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Timeline Chart - Ordem de Carregamento */}
            <Card className="shadow-lg border-0">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        Timeline de Risco por Posição de Carregamento
                    </CardTitle>
                    <CardDescription>
                        Nível de risco LGPD de cada tag na ordem em que são carregadas
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={timelineData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="position" label={{ value: 'Posição', position: 'bottom' }} />
                            <YAxis
                                domain={[0, 100]}
                                tickFormatter={(value) => {
                                    if (value === 100) return 'Crítico';
                                    if (value === 75) return 'Alto';
                                    if (value === 50) return 'Médio';
                                    if (value === 25) return 'Baixo';
                                    return '';
                                }}
                            />
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-white p-3 rounded-lg shadow-lg border">
                                                <p className="font-semibold">{data.fullName}</p>
                                                <p className="text-sm text-gray-600">Linha: {data.lineNumber}</p>
                                                <p className="text-sm">
                                                    Risco técnico: {data.risk === 100 ? 'Crítico' :
                                                        data.risk === 75 ? 'Alto' :
                                                            data.risk === 50 ? 'Médio' : 'Baixo'}
                                                </p>
                                                {data.isViolation === 1 && (
                                                    <Badge className="mt-1 bg-amber-100 text-amber-800">Sinal pré-consentimento</Badge>
                                                )}
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <defs>
                                <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.2} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="risk"
                                stroke="#8884d8"
                                fill="url(#riskGradient)"
                                name="Nível de Risco"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* 6-Axis Scores (if available) or Score Gauge fallback */}
            {radarData ? (
                <Card className="shadow-lg border-0">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="w-5 h-5" />
                            Scores de Auditoria (6 Eixos)
                        </CardTitle>
                        <CardDescription>
                            Avaliação multidimensional da implementação técnica
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid md:grid-cols-2 gap-6">
                            <ResponsiveContainer width="100%" height={300}>
                                <RadarChart data={radarData}>
                                    <PolarGrid stroke="#e2e8f0" />
                                    <PolarAngleAxis
                                        dataKey="axis"
                                        tick={{ fontSize: 12, fill: '#64748b' }}
                                    />
                                    <PolarRadiusAxis
                                        angle={30}
                                        domain={[0, 100]}
                                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    />
                                    <Radar
                                        name="Score"
                                        dataKey="value"
                                        stroke="#3b82f6"
                                        fill="#3b82f6"
                                        fillOpacity={0.2}
                                        strokeWidth={2}
                                    />
                                    <Tooltip />
                                </RadarChart>
                            </ResponsiveContainer>
                            <div className="flex flex-col justify-center space-y-3">
                                {radarData.map((item) => (
                                    <div key={item.axis} className="flex items-center gap-3">
                                        <span className="text-sm text-gray-600 w-24 text-right">{item.axis}</span>
                                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-500"
                                                style={{
                                                    width: `${item.value}%`,
                                                    backgroundColor: getScoreColor(item.value),
                                                }}
                                            />
                                        </div>
                                        <span className={`text-sm font-bold w-10 ${item.value >= 80 ? 'text-emerald-600' : item.value >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                            {item.value}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card className="shadow-lg border-0">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="w-5 h-5" />
                            Score de Conformidade LGPD
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center">
                            <div className="relative">
                                <ResponsiveContainer width={250} height={250}>
                                    <PieChart>
                                        <Pie
                                            data={scoreData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={80}
                                            outerRadius={100}
                                            startAngle={180}
                                            endAngle={0}
                                            dataKey="value"
                                        >
                                            <Cell fill={getScoreColor(result.score)} />
                                            <Cell fill="#E5E7EB" />
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                                    <div className="text-4xl font-bold" style={{ color: getScoreColor(result.score) }}>
                                        {result.score}%
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {result.score >= 80 ? 'Bom' : result.score >= 50 ? 'Regular' : 'Crítico'}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-center gap-6 mt-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                <span className="text-sm text-gray-600">80-100: Bom</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                <span className="text-sm text-gray-600">50-79: Regular</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                <span className="text-sm text-gray-600">0-49: Crítico</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Multa Estimada Destaque */}
            <Card className="shadow-lg border-0 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
                <CardContent className="pt-6">
                    <div className="text-center">
                        <p className="text-amber-800 text-lg mb-2">💰 Exposição de Risco Estimado</p>
                        <p className="text-3xl font-bold text-amber-900">
                            {result.privacy.estimatedRiskExposure}
                        </p>
                        <p className="text-sm text-amber-700 mt-2">
                            Baseado no Art. 52 da Lei 13.709/2018 (LGPD)
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default Dashboard;
