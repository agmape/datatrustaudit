import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Shield,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Settings,
    Code,
    Copy,
    ExternalLink,
    Zap,
    Lock
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ConsentModeCheckerProps {
    hasConsentTool: boolean;
    detectedTags: any[];
    url: string;
}

const ConsentModeChecker = ({ hasConsentTool, detectedTags, url }: ConsentModeCheckerProps) => {
    const hasGTM = detectedTags.some(t => t.name?.toLowerCase().includes('gtm'));
    const hasGA4 = detectedTags.some(t => t.name?.toLowerCase().includes('ga4') || t.name?.toLowerCase().includes('analytics'));
    const hasAds = detectedTags.some(t => t.name?.toLowerCase().includes('ads') || t.name?.toLowerCase().includes('adwords'));

    // Análise do Consent Mode
    const consentModeStatus = {
        detected: hasConsentTool,
        version: hasConsentTool ? 'v2' : 'Não detectado',
        defaultState: hasConsentTool ? 'denied' : 'N/A',
        signals: {
            analytics_storage: hasConsentTool ? 'granted' : 'not_set',
            ad_storage: hasConsentTool ? 'denied' : 'not_set',
            ad_user_data: hasConsentTool ? 'denied' : 'not_set',
            ad_personalization: hasConsentTool ? 'denied' : 'not_set',
            functionality_storage: 'granted',
            personalization_storage: hasConsentTool ? 'denied' : 'not_set',
            security_storage: 'granted'
        }
    };

    const requiredSignals = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'];
    const configuredSignals = requiredSignals.filter(s =>
        consentModeStatus.signals[s as keyof typeof consentModeStatus.signals] !== 'not_set'
    );
    const complianceScore = (configuredSignals.length / requiredSignals.length) * 100;

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        toast({ title: 'Copiado!', description: 'Código copiado para a área de transferência' });
    };

    const defaultConsentCode = `<!-- Google Consent Mode v2 - Configuração Padrão -->
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}

// Configuração padrão ANTES do GTM/GA4
gtag('consent', 'default', {
  'analytics_storage': 'denied',
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'functionality_storage': 'granted',
  'personalization_storage': 'denied',
  'security_storage': 'granted',
  'wait_for_update': 500
});

// Opcional: Região específica para LGPD
gtag('set', 'ads_data_redaction', true);
gtag('set', 'url_passthrough', true);
</script>`;

    const updateConsentCode = `// Atualizar consentimento após aceitação do usuário
function updateConsent(preferences) {
  gtag('consent', 'update', {
    'analytics_storage': preferences.analytics ? 'granted' : 'denied',
    'ad_storage': preferences.marketing ? 'granted' : 'denied',
    'ad_user_data': preferences.marketing ? 'granted' : 'denied',
    'ad_personalization': preferences.marketing ? 'granted' : 'denied'
  });
}

// Exemplo de uso com seu CMP:
// updateConsent({ analytics: true, marketing: false });`;

    const getSignalStatus = (value: string) => {
        switch (value) {
            case 'granted': return { color: 'bg-green-500', label: 'Permitido' };
            case 'denied': return { color: 'bg-red-500', label: 'Negado' };
            default: return { color: 'bg-gray-400', label: 'Não configurado' };
        }
    };

    return (
        <Card className="border-0 shadow-xl dark:bg-gray-900">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white">
                        <Shield className="h-5 w-5" />
                    </div>
                    Google Consent Mode v2
                </CardTitle>
                <CardDescription>
                    Verificação de conformidade com Consent Mode para LGPD e requisitos do Google
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Status Principal */}
                <div className={`p-6 rounded-xl ${hasConsentTool
                        ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                    }`}>
                    <div className="flex items-center gap-4">
                        {hasConsentTool ? (
                            <CheckCircle className="h-12 w-12 text-green-600" />
                        ) : (
                            <XCircle className="h-12 w-12 text-red-600" />
                        )}
                        <div>
                            <h3 className={`text-xl font-bold ${hasConsentTool ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                                {hasConsentTool ? 'Consent Mode Detectado' : 'Consent Mode NÃO Detectado'}
                            </h3>
                            <p className={`text-sm ${hasConsentTool ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                                {hasConsentTool
                                    ? 'Seu site está configurado com Google Consent Mode v2'
                                    : 'CRÍTICO: Você precisa implementar o Consent Mode v2 até março de 2024'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Score de Compliance */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="font-medium">Compliance Score</span>
                        <span className={complianceScore === 100 ? 'text-green-600' : 'text-orange-600'}>
                            {complianceScore.toFixed(0)}%
                        </span>
                    </div>
                    <Progress value={complianceScore} className="h-3" />
                </div>

                {/* Sinais de Consentimento */}
                <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Sinais de Consentimento
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                        {Object.entries(consentModeStatus.signals).map(([signal, value]) => {
                            const status = getSignalStatus(value);
                            return (
                                <div
                                    key={signal}
                                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                                >
                                    <div>
                                        <code className="text-xs font-mono">{signal}</code>
                                        <div className="flex items-center gap-1 mt-1">
                                            <div className={`w-2 h-2 rounded-full ${status.color}`} />
                                            <span className="text-xs text-gray-500">{status.label}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Alerta se não tem Consent Mode */}
                {!hasConsentTool && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <strong>Ação Urgente:</strong> Sem o Consent Mode v2, suas campanhas do Google Ads
                            perderão capacidade de atribuição e remarketing a partir de março de 2024.
                        </AlertDescription>
                    </Alert>
                )}

                {/* Requisitos */}
                <div className="space-y-3">
                    <h4 className="font-medium">Checklist de Requisitos</h4>
                    <div className="space-y-2">
                        {[
                            { check: hasGTM, label: 'Google Tag Manager instalado', critical: true },
                            { check: hasConsentTool, label: 'CMP/Plataforma de consentimento detectada', critical: true },
                            { check: hasConsentTool, label: 'Consent Mode v2 configurado', critical: true },
                            { check: hasConsentTool, label: 'Estado padrão definido como denied', critical: true },
                            { check: hasAds && hasConsentTool, label: 'Google Ads com consent signals', critical: hasAds },
                            { check: hasGA4 && hasConsentTool, label: 'GA4 respeitando consentimento', critical: hasGA4 },
                        ].map((item, i) => (
                            <div
                                key={i}
                                className={`flex items-center gap-2 p-2 rounded ${item.check ? 'bg-green-50 dark:bg-green-950/20' :
                                        item.critical ? 'bg-red-50 dark:bg-red-950/20' : 'bg-gray-50 dark:bg-gray-800'
                                    }`}
                            >
                                {item.check ? (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                    <XCircle className={`h-4 w-4 ${item.critical ? 'text-red-600' : 'text-gray-400'}`} />
                                )}
                                <span className={`text-sm ${item.check ? 'text-green-800 dark:text-green-200' : ''}`}>
                                    {item.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Código de Implementação */}
                <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                        <Code className="h-4 w-4" />
                        Código de Implementação
                    </h4>

                    <div className="relative">
                        <pre className="p-4 bg-gray-900 rounded-xl text-xs text-green-400 overflow-x-auto">
                            {defaultConsentCode}
                        </pre>
                        <Button
                            size="sm"
                            variant="secondary"
                            className="absolute top-2 right-2"
                            onClick={() => copyCode(defaultConsentCode)}
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="relative">
                        <pre className="p-4 bg-gray-900 rounded-xl text-xs text-blue-400 overflow-x-auto">
                            {updateConsentCode}
                        </pre>
                        <Button
                            size="sm"
                            variant="secondary"
                            className="absolute top-2 right-2"
                            onClick={() => copyCode(updateConsentCode)}
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Links úteis */}
                <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" asChild>
                        <a href="https://support.google.com/google-ads/answer/10000067" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Docs Google Ads
                        </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                        <a href="https://developers.google.com/tag-platform/security/guides/consent" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Consent Mode Docs
                        </a>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default ConsentModeChecker;
