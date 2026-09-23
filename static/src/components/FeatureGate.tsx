import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Crown, Sparkles, Zap } from 'lucide-react';
import { usePlan, PlanLimits } from '@/context/PlanContext';
import { useNavigate } from 'react-router-dom';

interface FeatureGateProps {
    feature: keyof PlanLimits;
    featureName: string;
    children: ReactNode;
    fallback?: ReactNode;
    /** Which plan unlocks this: 'pro' | 'premium' (default: 'premium') */
    requiredPlan?: 'pro' | 'premium';
}

/** Maps a PlanLimits key to the plan that first unlocks it */
const FEATURE_UNLOCK_PLAN: Partial<Record<keyof PlanLimits, 'pro' | 'premium'>> = {
    showViolationDetails: 'pro',
    jsonExport: 'pro',
    pdfExport: 'pro',
    showScripts: 'premium',
    showLineNumbers: 'premium',
    showHistory: 'premium',
    excelExport: 'premium',
    deepAnalysis: 'premium',
    realTimeAnalysis: 'premium',
};

const FeatureGate = ({
    feature,
    featureName,
    children,
    fallback,
    requiredPlan,
}: FeatureGateProps) => {
    const { isFeatureAvailable, setShowUpgradeModal, setBlockedFeature, plan } = usePlan();
    const navigate = useNavigate();

    const isAvailable = isFeatureAvailable(feature);

    const handleUpgradeClick = () => {
        setBlockedFeature(feature as string);
        setShowUpgradeModal(true);
    };

    if (isAvailable) return <>{children}</>;
    if (fallback) return <>{fallback}</>;

    const unlockPlan = requiredPlan ?? FEATURE_UNLOCK_PLAN[feature] ?? 'premium';
    const isPro = unlockPlan === 'pro';

    const planLabels = {
        pro: { name: 'Pro', price: 'R$ 49,90/mês', color: 'from-blue-500 to-indigo-600', icon: <Zap className="h-4 w-4" /> },
        full: { name: 'Premium', price: 'R$ 149,90/mês', color: 'from-amber-500 to-orange-600', icon: <Crown className="h-4 w-4" /> },
    };
    const target = planLabels[unlockPlan];

    const featureCopies: Partial<Record<keyof PlanLimits, { title: string; desc: string }>> = {
        showScripts: {
            title: '📍 Análise view-source avançada',
            desc: 'Localiza posição exata das tags no HTML para debugging preciso — exclusivo do Premium',
        },
        showLineNumbers: {
            title: '🔢 Debugging de Alta Precisão',
            desc: 'Veja exatamente em qual linha o script foi carregado — exclusivo do Premium',
        },
        showViolationDetails: {
            title: '⚠️ Detalhes de violações LGPD',
            desc: 'Entenda cada violação com contexto completo — disponível no Pro',
        },
        pdfExport: {
            title: '📄 Exportação PDF profissional',
            desc: 'Relatórios prontos para enviar ao cliente — disponível no Pro',
        },
        jsonExport: {
            title: '📦 Exportação JSON',
            desc: 'Dados completos para integrar com seus sistemas — disponível no Pro',
        },
        excelExport: {
            title: '📊 Exportação Excel',
            desc: 'Planilha detalhada para análise customizada — exclusivo do Premium',
        },
        deepAnalysis: {
            title: '🔬 Deep Scan multi-página',
            desc: 'Auditoria completa em todo o site — exclusivo do Premium',
        },
        realTimeAnalysis: {
            title: '⚡ Real-time mode',
            desc: 'Capture eventos ao vivo estilo Omnibug — exclusivo do Premium',
        },
        showHistory: {
            title: '📚 Histórico completo',
            desc: 'Compare auditorias ao longo do tempo — exclusivo do Premium',
        },
    };

    const copy = featureCopies[feature] ?? {
        title: `🔒 ${featureName}`,
        desc: `Esta funcionalidade está disponível no plano ${target.name}`,
    };

    return (
        <Card className="border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-4">
                {/* Lock icon */}
                <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${target.color} flex items-center justify-center shadow-lg`}>
                    <Lock className="h-7 w-7 text-white" />
                </div>

                {/* Badge */}
                <Badge className={`bg-gradient-to-r ${target.color} text-white gap-1`}>
                    {target.icon}
                    Exclusivo do {target.name}
                </Badge>

                {/* Copy */}
                <div>
                    <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">
                        {copy.title}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                        {copy.desc}
                    </p>
                </div>

                {/* Price hint */}
                <p className="text-xs text-gray-400">
                    Plano {target.name} a partir de <strong>{target.price}</strong>
                </p>

                {/* CTA */}
                <div className="flex gap-2">
                    <Button
                        onClick={handleUpgradeClick}
                        size="sm"
                        className={`bg-gradient-to-r ${target.color} text-white hover:opacity-90`}
                    >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Ver planos
                    </Button>
                    <Button
                        onClick={() => navigate('/pricing')}
                        size="sm"
                        variant="outline"
                    >
                        Comparar planos
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default FeatureGate;
