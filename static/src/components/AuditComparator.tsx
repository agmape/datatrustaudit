import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
    GitCompare,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    TrendingUp,
    TrendingDown,
    Shield,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Calendar,
    RefreshCw
} from 'lucide-react';

interface AuditHistory {
    url: string;
    timestamp: string;
    score: number;
    violations: number;
    tags: number;
}

interface ComparisonResult {
    scoreDiff: number;
    violationsDiff: number;
    tagsDiff: number;
    newViolations: string[];
    fixedViolations: string[];
    statusChange: 'improved' | 'worsened' | 'unchanged';
}

const AuditComparator = () => {
    const [history, setHistory] = useState<AuditHistory[]>([]);
    const [selectedAudit1, setSelectedAudit1] = useState<string>('');
    const [selectedAudit2, setSelectedAudit2] = useState<string>('');
    const [comparison, setComparison] = useState<ComparisonResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const response = await fetch('/history');
            const data = await response.json();
            if (data.history) {
                setHistory(data.history.map((h: any, i: number) => ({
                    url: h.url || 'Unknown',
                    timestamp: h.timestamp || new Date().toISOString(),
                    score: h.lgpdAnalysis?.complianceScore || 0,
                    violations: h.lgpdAnalysis?.totalViolations || 0,
                    tags: h.detectedTags?.length || 0,
                    id: `audit-${i}`
                })));
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        }
    };

    const compareAudits = () => {
        if (!selectedAudit1 || !selectedAudit2) return;

        setIsLoading(true);

        const audit1 = history.find((_, i) => `audit-${i}` === selectedAudit1);
        const audit2 = history.find((_, i) => `audit-${i}` === selectedAudit2);

        if (!audit1 || !audit2) {
            setIsLoading(false);
            return;
        }

        setTimeout(() => {
            const scoreDiff = audit2.score - audit1.score;
            const violationsDiff = audit2.violations - audit1.violations;
            const tagsDiff = audit2.tags - audit1.tags;

            let statusChange: 'improved' | 'worsened' | 'unchanged' = 'unchanged';
            if (scoreDiff > 5) statusChange = 'improved';
            else if (scoreDiff < -5) statusChange = 'worsened';

            setComparison({
                scoreDiff,
                violationsDiff,
                tagsDiff,
                newViolations: violationsDiff > 0 ? ['Nova violação detectada'] : [],
                fixedViolations: violationsDiff < 0 ? ['Violação corrigida'] : [],
                statusChange
            });
            setIsLoading(false);
        }, 500);
    };

    const getDiffIcon = (diff: number, inverse = false) => {
        const isPositive = inverse ? diff < 0 : diff > 0;
        const isNegative = inverse ? diff > 0 : diff < 0;

        if (isPositive) return <ArrowUpRight className="h-4 w-4 text-green-500" />;
        if (isNegative) return <ArrowDownRight className="h-4 w-4 text-red-500" />;
        return <Minus className="h-4 w-4 text-gray-400" />;
    };

    const getDiffColor = (diff: number, inverse = false) => {
        const isPositive = inverse ? diff < 0 : diff > 0;
        const isNegative = inverse ? diff > 0 : diff < 0;

        if (isPositive) return 'text-green-600 dark:text-green-400';
        if (isNegative) return 'text-red-600 dark:text-red-400';
        return 'text-gray-500';
    };

    const formatDiff = (diff: number) => {
        if (diff === 0) return '0';
        return diff > 0 ? `+${diff}` : `${diff}`;
    };

    return (
        <Card className="border-0 shadow-xl bg-white dark:bg-gray-900">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
                        <GitCompare className="h-5 w-5" />
                    </div>
                    Comparador de Auditorias
                </CardTitle>
                <CardDescription>
                    Compare duas auditorias para ver a evolução do compliance LGPD
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {history.length < 2 ? (
                    <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            Você precisa de pelo menos 2 auditorias no histórico para comparar.
                            Faça mais auditorias para usar esta funcionalidade.
                        </AlertDescription>
                    </Alert>
                ) : (
                    <>
                        {/* Seleção de auditorias */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Auditoria Anterior (Base)
                                </label>
                                <Select value={selectedAudit1} onValueChange={setSelectedAudit1}>
                                    <SelectTrigger className="h-12">
                                        <SelectValue placeholder="Selecione a auditoria base" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {history.map((audit, i) => (
                                            <SelectItem key={i} value={`audit-${i}`}>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-4 w-4 text-gray-400" />
                                                    <span className="font-medium">{audit.url}</span>
                                                    <Badge variant="outline" className="text-xs">
                                                        Score: {audit.score}
                                                    </Badge>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Auditoria Atual (Comparação)
                                </label>
                                <Select value={selectedAudit2} onValueChange={setSelectedAudit2}>
                                    <SelectTrigger className="h-12">
                                        <SelectValue placeholder="Selecione para comparar" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {history.map((audit, i) => (
                                            <SelectItem key={i} value={`audit-${i}`}>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-4 w-4 text-gray-400" />
                                                    <span className="font-medium">{audit.url}</span>
                                                    <Badge variant="outline" className="text-xs">
                                                        Score: {audit.score}
                                                    </Badge>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <Button
                            onClick={compareAudits}
                            disabled={!selectedAudit1 || !selectedAudit2 || isLoading}
                            className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                        >
                            {isLoading ? (
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <GitCompare className="h-4 w-4 mr-2" />
                            )}
                            Comparar Auditorias
                        </Button>

                        {/* Resultado da comparação */}
                        {comparison && (
                            <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                                {/* Status geral */}
                                <div className={`p-4 rounded-xl ${comparison.statusChange === 'improved'
                                        ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'
                                        : comparison.statusChange === 'worsened'
                                            ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                                            : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                                    }`}>
                                    <div className="flex items-center gap-3">
                                        {comparison.statusChange === 'improved' ? (
                                            <TrendingUp className="h-8 w-8 text-green-600" />
                                        ) : comparison.statusChange === 'worsened' ? (
                                            <TrendingDown className="h-8 w-8 text-red-600" />
                                        ) : (
                                            <Minus className="h-8 w-8 text-gray-400" />
                                        )}
                                        <div>
                                            <h3 className={`text-lg font-semibold ${comparison.statusChange === 'improved' ? 'text-green-800 dark:text-green-200' :
                                                    comparison.statusChange === 'worsened' ? 'text-red-800 dark:text-red-200' :
                                                        'text-gray-800 dark:text-gray-200'
                                                }`}>
                                                {comparison.statusChange === 'improved' ? 'Compliance Melhorou! 🎉' :
                                                    comparison.statusChange === 'worsened' ? 'Compliance Piorou ⚠️' :
                                                        'Sem Alterações Significativas'}
                                            </h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                {comparison.statusChange === 'improved'
                                                    ? 'O site está mais conforme com a LGPD'
                                                    : comparison.statusChange === 'worsened'
                                                        ? 'Novas violações foram detectadas'
                                                        : 'O nível de compliance permanece similar'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Métricas detalhadas */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <Shield className="h-5 w-5 text-blue-500" />
                                            <span className={`text-2xl font-bold ${getDiffColor(comparison.scoreDiff)}`}>
                                                {formatDiff(comparison.scoreDiff)}
                                            </span>
                                            {getDiffIcon(comparison.scoreDiff)}
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Score</p>
                                    </div>

                                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <AlertTriangle className="h-5 w-5 text-orange-500" />
                                            <span className={`text-2xl font-bold ${getDiffColor(comparison.violationsDiff, true)}`}>
                                                {formatDiff(comparison.violationsDiff)}
                                            </span>
                                            {getDiffIcon(comparison.violationsDiff, true)}
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Violações</p>
                                    </div>

                                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <span className={`text-2xl font-bold ${getDiffColor(comparison.tagsDiff)}`}>
                                                {formatDiff(comparison.tagsDiff)}
                                            </span>
                                            {getDiffIcon(comparison.tagsDiff)}
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Tags</p>
                                    </div>
                                </div>

                                {/* Detalhes de violações */}
                                {(comparison.newViolations.length > 0 || comparison.fixedViolations.length > 0) && (
                                    <div className="grid grid-cols-2 gap-4">
                                        {comparison.fixedViolations.length > 0 && (
                                            <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/30">
                                                <h4 className="font-medium text-green-800 dark:text-green-200 flex items-center gap-2 mb-2">
                                                    <CheckCircle className="h-4 w-4" />
                                                    Violações Corrigidas
                                                </h4>
                                                <ul className="space-y-1">
                                                    {comparison.fixedViolations.map((v, i) => (
                                                        <li key={i} className="text-sm text-green-700 dark:text-green-300">
                                                            • {v}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {comparison.newViolations.length > 0 && (
                                            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30">
                                                <h4 className="font-medium text-red-800 dark:text-red-200 flex items-center gap-2 mb-2">
                                                    <XCircle className="h-4 w-4" />
                                                    Novas Violações
                                                </h4>
                                                <ul className="space-y-1">
                                                    {comparison.newViolations.map((v, i) => (
                                                        <li key={i} className="text-sm text-red-700 dark:text-red-300">
                                                            • {v}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};

export default AuditComparator;
