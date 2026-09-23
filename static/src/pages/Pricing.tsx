import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useLocaleContext } from '@/context/LocaleContext';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { usePlan, PlanType } from '@/context/PlanContext';
import { useSubscription, BillingCycle } from '@/context/SubscriptionContext';
import { PRICING_CONFIG } from '@/config/pricing.config';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import LocaleSelector from '@/components/LocaleSelector';
import {
    Check, X, Tag, Zap, Star, Crown, ArrowRight, Shield,
    HelpCircle, Lock, TrendingUp, Clock, FileText, Calendar, Sparkles
} from 'lucide-react';
import logoIcon from '@/assets/logo/datatrust-logo-icon.png';

const PLAN_ICONS: Record<PlanType, JSX.Element> = {
    free: <Tag className="w-5 h-5" />,
    pro: <Star className="w-5 h-5" />,
    premium: <Crown className="w-5 h-5" />,
};

const PLAN_COLORS: Record<PlanType, string> = {
    free: 'from-slate-500 to-slate-600',
    pro: 'from-blue-500 to-indigo-600',
    premium: 'from-amber-500 to-orange-600',
};

const COMPARE_ROWS = [
    { key: 'audits_per_week', free: '10/sem', pro: '50/sem', full: '200/sem' },
    { key: 'basic_dashboard', free: true, pro: true, full: true },
    { key: 'detailed_dashboard', free: false, pro: true, full: true },
    { key: 'json_export', free: false, pro: true, full: true },
    { key: 'pdf_export', free: false, pro: true, full: true },
    { key: 'excel_export', free: false, pro: false, full: true },
    { key: 'complete_history', free: false, pro: false, full: false },
    { key: 'realtime_monitoring', free: false, pro: false, full: false },
    { key: 'advanced_view_source', free: false, pro: false, full: true },
    { key: 'exact_tag_localization', free: false, pro: false, full: true },
    { key: 'ai_chat', free: 'Limited', pro: 'Expanded', full: 'Unlimited' },
    { key: 'priority_support', free: false, pro: false, full: true }
];

const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, premium: 2 };

const PricingPage = () => {
    const { formatPrice, currency, locale } = useLocaleContext();
    const { language, t } = useI18n();
    const { isAuthenticated } = useAuth();
    const { plan: currentPlan, selectPlan, selectedPlan } = usePlan();
    const { billingCycle, setBillingCycle } = useSubscription();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [showCompare, setShowCompare] = useState(false);
    const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);
    const [clickedPlan, setClickedPlan] = useState<string | null>(null);

    useEffect(() => {
        const planParam = searchParams.get('plan');
        if (planParam && ['free', 'pro', 'premium'].includes(planParam)) {
            setHoveredPlan(planParam);
        }
    }, [searchParams]);

    const handleSelect = (planId: string) => {
        setClickedPlan(planId);
        selectPlan(planId as PlanType);
        localStorage.setItem('gtm-billing-cycle', billingCycle);

        if (planId === 'free') { navigate('/'); return; }

        const dest = `/checkout?plan=${planId}&cycle=${billingCycle}`;

        if (!isAuthenticated) {
            localStorage.setItem('gtm-redirect-after-auth', dest);
            navigate('/auth');
            return;
        }

        navigate(dest);
    };

    return (
        <div className="min-h-screen dt-page">
            {/* Nav */}
            <nav className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2.5 group">
                        <img
                            src={logoIcon}
                            alt="DataTrust Audit"
                            className="w-9 h-9 rounded-lg object-contain shadow-lg group-hover:scale-105 transition-transform"
                        />
                        <span className="font-bold text-white">DataTrust Audit</span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <a href="mailto:suporte@datatrustauditpro.com" className="text-white/40 hover:text-white/70 text-sm transition-colors hidden sm:block">
                            {t('nav.support')}
                        </a>
                        <LocaleSelector compact />
                        <Link to="/" className="text-white/60 hover:text-white text-sm transition-colors">
                            {t('nav.back')}
                        </Link>
                    </div>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-6 py-16">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-6">
                        <Zap className="w-4 h-4" />
                        {t('pricing.simple_pricing')}
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
                        {t('pricing.title')}
                    </h1>
                    <p className="text-white/50 text-lg max-w-xl mx-auto mb-8">
                        {t('pricing.subtitle')}
                    </p>

                    {/* ─── Billing cycle toggle ──────────────────────────────────────────── */}
                    <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-full p-1 gap-1">
                        <button
                            onClick={() => setBillingCycle('monthly')}
                            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                                billingCycle === 'monthly'
                                    ? 'bg-white text-slate-900 shadow-md'
                                    : 'text-white/60 hover:text-white'
                            }`}
                        >
                            {t('pricing.monthly')}
                        </button>
                        <button
                            onClick={() => setBillingCycle('annual')}
                            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
                                billingCycle === 'annual'
                                    ? 'bg-white text-slate-900 shadow-md'
                                    : 'text-white/60 hover:text-white'
                            }`}
                        >
                            {t('pricing.annual')}
                            <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                                {t('pricing.save_20')}
                            </span>
                        </button>
                    </div>
                    {billingCycle === 'annual' && (
                        <p className="text-green-400/80 text-xs mt-3 flex items-center justify-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            {t('pricing.billed_annual_notice')}
                        </p>
                    )}

                    {/* Locale selector — language + currency */}
                    <div className="mt-12 flex flex-col items-center gap-4">
                        <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-8 backdrop-blur-sm shadow-2xl w-full max-w-3xl">
                           <LocaleSelector compact={false} />
                        </div>
                    </div>
                </div>

                {/* Plan cards */}
                <div className="grid md:grid-cols-3 gap-5 mb-12 items-start mt-12">
                    {(['free', 'pro', 'premium'] as PlanType[]).map((planId) => {
                        const config = PRICING_CONFIG[planId];
                        const pricing = config.pricing;
                        const effectiveUsd = billingCycle === 'annual' && planId !== 'free'
                            ? Math.round((pricing.annual / 12) * 100) / 100   // show monthly equivalent
                            : pricing.monthly;
                        
                        const displayPrice = planId === 'free' ? t('pricing.free_label') : formatPrice(effectiveUsd);
                        const isCurrentPlan = currentPlan?.type === planId;
                        const isHovered = hoveredPlan === planId;
                        const isSelected = selectedPlan === planId || clickedPlan === planId;
                        const currentRank = PLAN_RANK[currentPlan?.type ?? 'free'];
                        const planRank = PLAN_RANK[planId];
                        const isUpgrade = planRank > currentRank;
                        const isDowngrade = planRank < currentRank;

                        return (
                            <div
                                key={planId}
                                onMouseEnter={() => setHoveredPlan(planId)}
                                onMouseLeave={() => setHoveredPlan(null)}
                                className={`relative rounded-2xl border overflow-hidden bg-white/5 backdrop-blur-sm transition-all duration-300 ${
                                    planId === 'pro' ? 'border-blue-500/50 scale-[1.02] shadow-2xl shadow-blue-500/10' : 'border-white/10'
                                } ${
                                    isHovered ? 'shadow-xl' : ''
                                } ${
                                    isCurrentPlan ? 'ring-2 ring-white/30' : ''
                                } ${
                                    isSelected && !isCurrentPlan ? 'ring-2 ring-blue-400/60' : ''
                                }`}
                            >
                                {/* Badge / Current plan indicator */}
                                {isCurrentPlan ? (
                                    <div className="bg-white/20 text-white text-xs font-bold text-center py-2 tracking-widest uppercase flex items-center justify-center gap-1.5">
                                        <Check className="w-3 h-3" />
                                        {t('pricing.current_plan')}
                                    </div>
                                ) : (
                                    <div className={`bg-gradient-to-r ${PLAN_COLORS[planId]} text-white text-xs font-bold text-center py-2 tracking-widest uppercase`}>
                                        {t(config.badgeKey)}
                                    </div>
                                )}

                                <div className="p-7">
                                    {/* Icon + label */}
                                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${PLAN_COLORS[planId]} flex items-center justify-center text-white mb-4 shadow-lg`}>
                                        {PLAN_ICONS[planId]}
                                    </div>
                                    <h2 className="text-xl font-bold text-white">{t(config.labelKey)}</h2>

                                    {/* Usage cap */}
                                    <div className="flex items-center gap-1.5 mt-2 mb-4">
                                        <Clock className="w-3.5 h-3.5 text-white/30" />
                                        <span className="text-white/40 text-xs">
                                            {t(`plans.${planId}.usage_cap`)}
                                        </span>
                                    </div>

                                    {/* Price */}
                                    <div className="flex items-baseline gap-1.5 mb-1">
                                        <span className="text-4xl font-extrabold text-white">{displayPrice}</span>
                                        {planId !== 'free' && (
                                            <span className="text-white/40 text-sm">{t('pricing.per_month')}</span>
                                        )}
                                    </div>
                                    
                                    {/* Annual billing total */}
                                    {billingCycle === 'annual' && planId !== 'free' && (
                                        <div className="mb-3">
                                            <span className="text-green-400/80 text-xs flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {t('pricing.billed_annual')} {formatPrice(pricing.annual)}
                                                <Badge className="bg-green-500/20 text-green-400 text-[10px] border-0 h-4 px-1.5 ml-1">-20%</Badge>
                                            </span>
                                        </div>
                                    )}

                                    {/* Data visibility bar */}
                                    <div className="mb-6 mt-4">
                                        <div className="flex justify-between text-xs text-white/40 mb-1.5">
                                            <span>{t('pricing.data_visibility')}</span>
                                            <span className={`font-bold ${config.visibility === 100 ? 'text-green-400' : config.visibility >= 70 ? 'text-blue-400' : 'text-white/50'}`}>
                                                {config.visibility}%
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full bg-gradient-to-r ${PLAN_COLORS[planId]} rounded-full transition-all duration-700`}
                                                style={{ width: `${config.visibility}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* CTA */}
                                    <Button
                                        onClick={() => handleSelect(planId)}
                                        disabled={isCurrentPlan}
                                        className={`w-full py-5 font-semibold transition-all ${isCurrentPlan ? 'opacity-60 cursor-not-allowed' : 
                                            planId === 'free' ? 'bg-white/10 text-white/80 hover:bg-white/20' : 
                                            `bg-gradient-to-r ${PLAN_COLORS[planId]} text-white shadow-lg`}`}
                                    >
                                        {isCurrentPlan ? (
                                            <><Check className="w-4 h-4 mr-2 inline" />{t('pricing.current_plan')}</>
                                        ) : isUpgrade ? (
                                            <>{t('pricing.subscribe')} {t(config.labelKey)}<ArrowRight className="w-4 h-4 ml-2 inline" /></>
                                        ) : isDowngrade ? (
                                            <>{t('pricing.switch')} {t(config.labelKey)}</>
                                        ) : planId === 'free' ? (
                                            t('pricing.start_free')
                                        ) : (
                                            <>{t('pricing.subscribe')} {t(config.labelKey)}<ArrowRight className="w-4 h-4 ml-2 inline" /></>
                                        )}
                                    </Button>

                                    <div className="mt-6 space-y-2.5">
                                        {config.featuresKeys.map((key, i) => (
                                            <div key={`f${i}`} className="flex items-start gap-2.5">
                                                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                                                <span className="text-white/70 text-sm">{t(key)}</span>
                                            </div>
                                        ))}
                                        {config.lockedKeys.map((key, i) => (
                                            <div key={`l${i}`} className="flex items-start gap-2.5">
                                                <Lock className="w-3.5 h-3.5 text-white/15 mt-0.5 flex-shrink-0" />
                                                <span className="text-white/20 text-sm line-through">{t(key)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Feature comparison toggle */}
                <div className="text-center mb-10">
                    <button
                        onClick={() => setShowCompare(!showCompare)}
                        className="text-blue-400 hover:text-blue-300 text-sm font-medium inline-flex items-center gap-2 transition-colors"
                    >
                        <TrendingUp className="w-4 h-4" />
                        {showCompare ? t('pricing.hide_comparison') : t('pricing.view_comparison')}
                    </button>
                </div>

                {showCompare && (
                    <div className="mb-12 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left text-white/50 font-medium py-4 px-6">{t('pricing.feature')}</th>
                                    {(['free', 'pro', 'premium'] as PlanType[]).map(id => (
                                        <th key={id} className="text-center text-white font-semibold py-4 px-4 w-32 uppercase tracking-widest text-[10px]">{t(`plans.${id}.label`)}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {COMPARE_ROWS.map((row, i) => (
                                    <tr key={i} className={`border-b border-white/5 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                                        <td className="py-3.5 px-6 text-white/60">{t(`pricing.compare.${row.key}`)}</td>
                                        {(['free', 'pro', 'premium'] as const).map((col) => {
                                            const val = (row as Record<string, any>)[col === 'premium' ? 'full' : col];
                                            const isLocked = val === false;
                                            const displayValue = val === 'premium_domain_limit'
                                                ? t('plans.premium.features.audits')
                                                : String(val);
                                            return (
                                                <td key={col} className={`py-3.5 px-4 text-center ${isLocked ? 'opacity-30' : ''}`}>
                                                    {val === true ? (
                                                        <Check className="w-4 h-4 text-green-400 mx-auto" />
                                                    ) : isLocked ? (
                                                        <X className="w-4 h-4 text-white/50 mx-auto" />
                                                    ) : (
                                                        <span className="text-white/80 font-medium text-xs">{displayValue}</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Guarantee + trust block */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                    {[
                        { icon: <Shield className="w-6 h-6 text-green-400" />, key: 'guarantee' },
                        { icon: <Lock className="w-6 h-6 text-blue-400" />, key: 'secure_checkout' },
                        { icon: <FileText className="w-6 h-6 text-amber-400" />, key: 'cancel_anytime' },
                        { icon: <Check className="w-6 h-6 text-slate-400" />, key: 'no_card_storage' },
                    ].map((item, i) => (
                        <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col items-center text-center gap-3">
                            <div className="bg-white/5 p-3 rounded-full">{item.icon}</div>
                            <div>
                                <div className="font-semibold text-white text-sm mb-1">{t(`pricing.trust.${item.key}.title`)}</div>
                                <div className="text-white/40 text-xs leading-relaxed">{t(`pricing.trust.${item.key}.desc`)}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="text-center space-y-4">
                    <div className="flex items-center justify-center gap-2 text-white/30 text-xs">
                        <HelpCircle className="w-3.5 h-3.5" />
                        {t('pricing.questions')}
                        <a href="mailto:suporte@datatrustauditpro.com" className="text-blue-400 hover:text-blue-300">
                            suporte@datatrustauditpro.com
                        </a>
                    </div>
                    <p className="text-white/15 text-[10px] max-w-xl mx-auto leading-relaxed">
                        {t('pricing.legal_disclaimer')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PricingPage;
