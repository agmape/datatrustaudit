import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import {
    Check,
    X,
    Zap,
    Crown,
    Sparkles,
    Shield,
    BarChart3,
    FileText,
    MessageSquare,
    Clock,
    Eye,
    Lock,
    ArrowRight,
    Star,
    Flame
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePlan, PlanType, PLAN_CONFIGS } from '@/context/PlanContext';
import { useAuth } from '@/context/AuthContext';

const UpgradeModal = () => {
    const { showUpgradeModal, setShowUpgradeModal, blockedFeature, plan, selectPlan } = usePlan();
    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();

    const handlePlanSelect = (planType: PlanType) => {
        setShowUpgradeModal(false);

        if (planType === 'free') return; // no action for downgrade from modal

        const dest = `/checkout?plan=${planType}`;
        selectPlan(planType);

        if (!isAuthenticated) {
            localStorage.setItem('gtm-redirect-after-auth', dest);
            navigate('/auth');
            return;
        }

        navigate(dest);
    };

    const getPlanIcon = (planType: PlanType) => {
        switch (planType) {
            case 'free': return <Zap className="h-6 w-6" />;
            case 'pro': return <Crown className="h-6 w-6" />;
            case 'premium': return <Flame className="h-6 w-6" />;
        }
    };

    /** Maps a PlanLimits key to the plan that first unlocks it */
    const FEATURE_UNLOCK_PLAN: Record<string, 'pro' | 'premium'> = {
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

    // Copy persuasiva baseada no recurso bloqueado
    const getBlockedFeatureCopy = () => {
        if (!blockedFeature) return null;

        const copies: Record<string, { title: string; desc: string; value: string }> = {
            showScripts: {
                title: '📍 Localize Exatamente o Problema',
                desc: 'Veja em qual linha de código está cada tag e corrija rapidamente',
                value: 'Economize 3h+ de debugging'
            },
            showHistory: {
                title: '📊 Histórico Completo de Auditorias',
                desc: 'Compare evolução do compliance ao longo do tempo',
                value: 'Prove melhorias para seu cliente'
            },
            pdfExport: {
                title: '📄 Relatórios Profissionais',
                desc: 'Exporte PDFs prontos para apresentar ao cliente',
                value: 'Aumente seu ticket médio'
            },
            excelExport: {
                title: '📊 Dados Detalhados em Excel',
                desc: 'Análise completa em planilha para relatórios customizados',
                value: 'Dados completos para análise'
            },
            realTimeAnalysis: {
                title: '⚡ Análise em Tempo Real',
                desc: 'Capture eventos reais do site como a extensão Omnibug',
                value: 'Dados 100% precisos'
            }
        };

        return copies[blockedFeature] || {
            title: '🔓 Desbloqueie Este Recurso',
            desc: 'Acesse funcionalidades avançadas de análise LGPD',
            value: 'Mais poder para você'
        };
    };

    const blockCopy = getBlockedFeatureCopy();

    return (
        <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
                {/* Header com gradiente */}
                <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white p-6 text-center">
                    <DialogHeader>
                        <div className="flex justify-center mb-3">
                            <div className="p-3 bg-white/20 rounded-full backdrop-blur-sm">
                                <Lock className="h-8 w-8" />
                            </div>
                        </div>
                        <DialogTitle className="text-2xl font-bold text-white">
                            {blockCopy?.title || '🚀 Desbloqueie o Poder Total'}
                        </DialogTitle>
                        {blockCopy && (
                            <p className="text-blue-100 mt-2">{blockCopy.desc}</p>
                        )}
                    </DialogHeader>

                    {/* FOMO Banner */}
                    <div className="mt-4 bg-amber-400/20 border border-amber-400/30 rounded-lg p-3 backdrop-blur-sm">
                        <p className="text-sm font-medium flex items-center justify-center gap-2">
                            <Flame className="h-4 w-4 text-amber-300" />
                            <span className="text-amber-100">
                                🔥 50% OFF apenas hoje! Use código: <strong>LGPD50</strong>
                            </span>
                        </p>
                    </div>
                </div>

                {/* Cards dos planos */}
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(['free', 'pro', 'premium'] as PlanType[]).map((planType) => {
                            const config = PLAN_CONFIGS[planType];
                            const isCurrentPlan = plan.type === planType;
                            
                            // Determine which plan to focus on based on the blocked feature
                            const requiredPlan = blockedFeature ? FEATURE_UNLOCK_PLAN[blockedFeature] || 'premium' : 'pro';
                            const isFocusedPlan = planType === requiredPlan;
                            const isRecommended = isFocusedPlan;
                            const isBest = planType === 'premium' && !isFocusedPlan;

                            return (
                                <Card
                                    key={planType}
                                    className={`relative overflow-hidden transition-all ${isRecommended ? 'ring-2 ring-blue-500 scale-105 z-10 shadow-xl' : ''
                                        } ${isBest ? 'ring-2 ring-amber-500' : ''}
                                    ${isCurrentPlan ? 'opacity-60' : 'hover:shadow-lg'}`}
                                >
                                    {/* Badge de recomendação */}
                                    {isRecommended && (
                                        <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                                            <Badge className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg">
                                                <Star className="h-3 w-3 mr-1" />
                                                MAIS POPULAR
                                            </Badge>
                                        </div>
                                    )}
                                    {isBest && (
                                        <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                                            <Badge className="bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg">
                                                <Crown className="h-3 w-3 mr-1" />
                                                MELHOR VALOR
                                            </Badge>
                                        </div>
                                    )}

                                    <CardHeader className={`text-center pt-8 bg-gradient-to-br ${config.color} text-white`}>
                                        <div className="flex justify-center mb-2">
                                            {getPlanIcon(planType)}
                                        </div>
                                        <h3 className="text-xl font-bold">{config.name}</h3>
                                        <div className="mt-2">
                                            <span className="text-3xl font-bold">{config.priceLabel}</span>
                                        </div>
                                        <div className="text-white/80 text-sm mt-1">
                                            {planType === 'free' && '1 escaneamento por mês'}
                                            {planType === 'pro' && '5 escaneamentos por mês'}
                                            {planType === 'premium' && 'Escaneamentos ilimitados para 1 domínio'}
                                        </div>
                                    </CardHeader>

                                    <CardContent className="pt-4">
                                        <ul className="space-y-2">
                                            {config.features.map((feature, i) => (
                                                <li key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                            {config.blockedFeatures.slice(0, 2).map((feature, i) => (
                                                <li key={i} className="flex items-center gap-2 text-sm text-gray-400">
                                                    <X className="h-4 w-4 text-gray-300 shrink-0" />
                                                    <span className="line-through">{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>

                                    <CardFooter>
                                        <Button
                                            className={`w-full ${isRecommended
                                                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                                                    : isBest
                                                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700'
                                                        : ''
                                                }`}
                                            variant={isCurrentPlan ? 'outline' : isRecommended || isBest ? 'default' : 'secondary'}
                                            disabled={isCurrentPlan}
                                            onClick={() => handlePlanSelect(planType)}
                                        >
                                            {isCurrentPlan ? (
                                                'Plano Atual'
                                            ) : (
                                                <>
                                                    {planType === 'free' ? 'Manter Free' : 'Começar Agora'}
                                                    {planType !== 'free' && <ArrowRight className="h-4 w-4 ml-2" />}
                                                </>
                                            )}
                                        </Button>
                                    </CardFooter>
                                </Card>
                            );
                        })}
                    </div>

                    {/* Visibilidade por plano */}
                    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <h4 className="font-semibold mb-3 text-center flex items-center justify-center gap-2">
                            <Eye className="h-5 w-5" />
                            O que você vê em cada plano
                        </h4>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-3xl font-bold text-gray-400">30%</div>
                                <div className="text-sm text-gray-500">Free</div>
                                <div className="h-2 bg-gray-200 rounded mt-2">
                                    <div className="h-full w-[30%] bg-gray-400 rounded" />
                                </div>
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-blue-600">70%</div>
                                <div className="text-sm text-blue-600">Pro</div>
                                <div className="h-2 bg-blue-100 rounded mt-2">
                                    <div className="h-full w-[70%] bg-blue-500 rounded" />
                                </div>
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-amber-600">100%</div>
                                <div className="text-sm text-amber-600">Premium</div>
                                <div className="h-2 bg-amber-100 rounded mt-2">
                                    <div className="h-full w-full bg-amber-500 rounded" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Garantia */}
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-950/30 rounded-xl text-center border border-green-200 dark:border-green-800">
                        <Shield className="h-8 w-8 mx-auto text-green-600 mb-2" />
                        <p className="text-sm text-green-800 dark:text-green-200">
                            <strong>✅ Garantia de 7 dias</strong> - Não curtiu? Devolvemos 100% sem perguntas.
                        </p>
                    </div>

                    {/* Social proof */}
                    <div className="mt-4 text-center">
                        <p className="text-xs text-gray-500">
                            ⭐⭐⭐⭐⭐ <strong>4.9/5</strong> de satisfação • <strong>+2.500</strong> escaneamentos realizados
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default UpgradeModal;
