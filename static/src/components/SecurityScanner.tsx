import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Shield,
    Lock,
    Unlock,
    AlertTriangle,
    CheckCircle,
    XCircle,
    ExternalLink,
    Eye,
    EyeOff,
    Globe,
    Fingerprint,
    KeyRound,
    Bug,
    Scan
} from 'lucide-react';

interface SecurityIssue {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: 'privacy' | 'security' | 'compliance' | 'tracking';
    title: string;
    description: string;
    impact: string;
    recommendation: string;
    article?: string;
}

interface SecurityScannerProps {
    detectedTags: any[];
    hasConsentTool: boolean;
    url: string;
}

const SecurityScanner = ({ detectedTags, hasConsentTool, url }: SecurityScannerProps) => {
    // Gerar issues de segurança baseadas na análise
    const generateSecurityIssues = (): SecurityIssue[] => {
        const issues: SecurityIssue[] = [];

        // Verificar third-party scripts
        const thirdPartyTags = detectedTags.filter(t =>
            t.name?.toLowerCase().includes('facebook') ||
            t.name?.toLowerCase().includes('meta') ||
            t.name?.toLowerCase().includes('tiktok') ||
            t.name?.toLowerCase().includes('linkedin')
        );

        if (thirdPartyTags.length > 0) {
            issues.push({
                id: 'tp-tracking',
                severity: 'high',
                category: 'privacy',
                title: 'Scripts de Rastreamento de Terceiros',
                description: `${thirdPartyTags.length} scripts de terceiros detectados que coletam dados do usuário.`,
                impact: 'Dados pessoais sendo compartilhados com terceiros sem consentimento explícito.',
                recommendation: 'Implemente CMP com granularidade para cada provedor de terceiros.',
                article: 'Art. 7º LGPD - Consentimento específico'
            });
        }

        // Verificar consent
        if (!hasConsentTool) {
            issues.push({
                id: 'no-consent',
                severity: 'critical',
                category: 'compliance',
                title: 'Ausência de Mecanismo de Consentimento',
                description: 'Nenhuma CMP (Consent Management Platform) detectada no site.',
                impact: 'Violação direta do Art. 7º da LGPD. Multa de até 2% do faturamento.',
                recommendation: 'Implemente imediatamente uma CMP certificada (ex: OneTrust, CookieYes, Osano).',
                article: 'Art. 7º e Art. 52 LGPD'
            });
        }

        // Verificar fingerprinting
        const hasFingerprintRisk = detectedTags.some(t =>
            t.dataCollected?.includes('fingerprint') ||
            t.name?.toLowerCase().includes('clarity') ||
            t.name?.toLowerCase().includes('hotjar')
        );

        if (hasFingerprintRisk) {
            issues.push({
                id: 'fingerprint',
                severity: 'high',
                category: 'privacy',
                title: 'Possível Fingerprinting do Navegador',
                description: 'Detectados scripts que podem coletar impressões digitais do navegador.',
                impact: 'Rastreamento persistente que ignora limpeza de cookies do usuário.',
                recommendation: 'Revise a necessidade desses scripts e obtenha consentimento explícito.',
                article: 'Art. 6º LGPD - Finalidade'
            });
        }

        // Verificar GA antes do consentimento
        const gaBeforeConsent = detectedTags.some(t =>
            (t.name?.toLowerCase().includes('ga4') || t.name?.toLowerCase().includes('analytics')) &&
            t.isBeforeConsent
        );

        if (gaBeforeConsent || !hasConsentTool) {
            issues.push({
                id: 'ga-no-consent',
                severity: 'high',
                category: 'tracking',
                title: 'Google Analytics Dispara Antes do Consentimento',
                description: 'O GA4 está coletando dados antes do usuário consentir.',
                impact: 'Coleta ilegal de dados pessoais (IP, comportamento de navegação).',
                recommendation: 'Configure o Consent Mode v2 com estado padrão "denied".',
                article: 'Art. 7º LGPD'
            });
        }

        // Verificar cross-site tracking
        if (thirdPartyTags.length >= 2) {
            issues.push({
                id: 'cross-site',
                severity: 'medium',
                category: 'privacy',
                title: 'Cross-Site Tracking Detectado',
                description: 'Múltiplas redes de publicidade podem correlacionar usuários entre sites.',
                impact: 'Construção de perfil comportamental detalhado sem conhecimento do usuário.',
                recommendation: 'Limite o número de parceiros de marketing e seja transparente na política de privacidade.',
                article: 'Art. 6º LGPD - Transparência'
            });
        }

        // Verificar dados sensíveis
        issues.push({
            id: 'data-exposure',
            severity: 'medium',
            category: 'security',
            title: 'Verificar Exposição de Dados na URL',
            description: 'Parâmetros de URL podem conter dados pessoais sendo enviados para analytics.',
            impact: 'Dados como email, CPF ou nome podem estar sendo logados inadvertidamente.',
            recommendation: 'Configure exclusão de parâmetros PII no GTM e habilite URL passthrough.',
            article: 'Art. 46 LGPD - Medidas de Segurança'
        });

        // Universal Analytics
        const hasUA = detectedTags.some(t =>
            t.name?.toLowerCase().includes('universal') ||
            t.matchedPattern?.includes('analytics.js')
        );

        if (hasUA) {
            issues.push({
                id: 'legacy-ua',
                severity: 'low',
                category: 'tracking',
                title: 'Universal Analytics Descontinuado',
                description: 'O Universal Analytics foi descontinuado em julho de 2023.',
                impact: 'Dados não estão mais sendo processados. Código legado sem função.',
                recommendation: 'Remova o código do UA para melhorar performance e evitar confusão.',
                article: 'N/A'
            });
        }

        return issues;
    };

    const issues = generateSecurityIssues();

    const severityCounts = {
        critical: issues.filter(i => i.severity === 'critical').length,
        high: issues.filter(i => i.severity === 'high').length,
        medium: issues.filter(i => i.severity === 'medium').length,
        low: issues.filter(i => i.severity === 'low').length
    };

    const riskScore = Math.max(0, 100 -
        (severityCounts.critical * 30) -
        (severityCounts.high * 15) -
        (severityCounts.medium * 5) -
        (severityCounts.low * 2)
    );

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800';
            case 'high': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800';
            case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800';
            case 'low': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800';
            default: return '';
        }
    };

    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case 'critical': return <Badge variant="destructive">CRÍTICO</Badge>;
            case 'high': return <Badge className="bg-orange-600">ALTO</Badge>;
            case 'medium': return <Badge className="bg-yellow-600">MÉDIO</Badge>;
            case 'low': return <Badge variant="secondary">BAIXO</Badge>;
            default: return null;
        }
    };

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'privacy': return <Eye className="h-4 w-4" />;
            case 'security': return <Lock className="h-4 w-4" />;
            case 'compliance': return <Shield className="h-4 w-4" />;
            case 'tracking': return <Fingerprint className="h-4 w-4" />;
            default: return <Bug className="h-4 w-4" />;
        }
    };

    return (
        <Card className="border-0 shadow-xl dark:bg-gray-900">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 text-white">
                        <Scan className="h-5 w-5" />
                    </div>
                    Scanner de Segurança & Privacidade
                </CardTitle>
                <CardDescription>
                    Análise profunda de vulnerabilidades LGPD e riscos de privacidade
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Score de risco */}
                <div className={`p-6 rounded-xl text-center ${riskScore >= 80 ? 'bg-green-50 dark:bg-green-950/30' :
                        riskScore >= 50 ? 'bg-yellow-50 dark:bg-yellow-950/30' :
                            'bg-red-50 dark:bg-red-950/30'
                    }`}>
                    <div className={`text-5xl font-bold mb-2 ${riskScore >= 80 ? 'text-green-600' :
                            riskScore >= 50 ? 'text-yellow-600' :
                                'text-red-600'
                        }`}>
                        {riskScore}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        Score de Segurança/Privacidade
                    </div>
                    <Progress value={riskScore} className="h-3 mt-4" />
                </div>

                {/* Contagem por severidade */}
                <div className="grid grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-red-100 dark:bg-red-950/30 text-center">
                        <div className="text-2xl font-bold text-red-600">{severityCounts.critical}</div>
                        <div className="text-xs text-red-700 dark:text-red-300">Críticos</div>
                    </div>
                    <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-950/30 text-center">
                        <div className="text-2xl font-bold text-orange-600">{severityCounts.high}</div>
                        <div className="text-xs text-orange-700 dark:text-orange-300">Altos</div>
                    </div>
                    <div className="p-3 rounded-xl bg-yellow-100 dark:bg-yellow-950/30 text-center">
                        <div className="text-2xl font-bold text-yellow-600">{severityCounts.medium}</div>
                        <div className="text-xs text-yellow-700 dark:text-yellow-300">Médios</div>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-950/30 text-center">
                        <div className="text-2xl font-bold text-blue-600">{severityCounts.low}</div>
                        <div className="text-xs text-blue-700 dark:text-blue-300">Baixos</div>
                    </div>
                </div>

                {/* Alerta crítico */}
                {severityCounts.critical > 0 && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <strong>{severityCounts.critical} vulnerabilidade(s) crítica(s)</strong> encontrada(s)!
                            Ação imediata necessária para evitar multas LGPD de até R$ 50 milhões.
                        </AlertDescription>
                    </Alert>
                )}

                {/* Lista de issues */}
                <Tabs defaultValue="all" className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="all">Todos ({issues.length})</TabsTrigger>
                        <TabsTrigger value="critical">Críticos</TabsTrigger>
                        <TabsTrigger value="privacy">Privacidade</TabsTrigger>
                        <TabsTrigger value="compliance">Compliance</TabsTrigger>
                        <TabsTrigger value="tracking">Tracking</TabsTrigger>
                    </TabsList>

                    {['all', 'critical', 'privacy', 'compliance', 'tracking'].map(tab => (
                        <TabsContent key={tab} value={tab} className="mt-4">
                            <div className="space-y-3">
                                {(tab === 'all' ? issues :
                                    tab === 'critical' ? issues.filter(i => i.severity === 'critical') :
                                        issues.filter(i => i.category === tab)
                                ).map((issue, i) => (
                                    <div
                                        key={i}
                                        className={`p-4 rounded-xl border ${getSeverityColor(issue.severity)}`}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                {getCategoryIcon(issue.category)}
                                                <h5 className="font-semibold">{issue.title}</h5>
                                            </div>
                                            {getSeverityBadge(issue.severity)}
                                        </div>

                                        <p className="text-sm mb-3">{issue.description}</p>

                                        <div className="space-y-2 text-sm">
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                                                <span><strong>Impacto:</strong> {issue.impact}</span>
                                            </div>
                                            <div className="flex items-start gap-2">
                                                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                                <span><strong>Recomendação:</strong> {issue.recommendation}</span>
                                            </div>
                                            {issue.article && (
                                                <div className="flex items-start gap-2">
                                                    <KeyRound className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                                                    <span><strong>Base Legal:</strong> {issue.article}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {(tab === 'all' ? issues :
                                    tab === 'critical' ? issues.filter(i => i.severity === 'critical') :
                                        issues.filter(i => i.category === tab)
                                ).length === 0 && (
                                        <div className="text-center py-8 text-gray-500">
                                            <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                                            <p>Nenhum problema encontrado nesta categoria!</p>
                                        </div>
                                    )}
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>

                {/* Links úteis */}
                <div className="pt-4 border-t dark:border-gray-700">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                        <ExternalLink className="h-4 w-4" />
                        Recursos Úteis
                    </h4>
                    <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" size="sm" asChild>
                            <a href="https://www.gov.br/anpd/pt-br" target="_blank" rel="noopener noreferrer">
                                ANPD Brasil
                            </a>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <a href="https://chromewebstore.google.com/detail/omnibug/bknpehncffejahipecakbfkomebjmokl" target="_blank" rel="noopener noreferrer">
                                Omnibug Extension
                            </a>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <a href="https://support.google.com/tagmanager/answer/14215540" target="_blank" rel="noopener noreferrer">
                                Consent Mode v2 Setup
                            </a>
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default SecurityScanner;
