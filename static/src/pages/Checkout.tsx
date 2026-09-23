import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale, localizePrice } from '@/hooks/useLocale';
import { useI18n } from '@/context/I18nContext';
import { useSubscription, PLAN_PRICING, BillingCycle, SubscriptionPlan } from '@/context/SubscriptionContext';
import { getCheckoutUrl } from '@/config/pricing.config';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import LocaleSelector from '@/components/LocaleSelector';
import {
    Tag, Shield, CreditCard, Smartphone, ArrowRight,
    Check, Lock, AlertCircle, ExternalLink, Calendar,
    RefreshCw, Star, Crown, Sparkles
} from 'lucide-react';

// ─── Plan display metadata ─────────────────────────────────────────────────────
const PLAN_META: Record<SubscriptionPlan, {
    label: { en: string; pt: string };
    gradient: string;
    shadowColor: string;
    icon: React.ReactNode;
    audits: { en: string; pt: string };
    highlights: { en: string[]; pt: string[] };
}> = {
    free: {
        label: { en: 'Free', pt: 'Grátis' },
        gradient: 'from-slate-500 to-slate-600',
        shadowColor: 'shadow-slate-500/20',
        icon: <Tag className="w-5 h-5" />,
        audits: { en: '10 scans per week', pt: '10 escaneamentos por semana' },
        highlights: {
            en: ['Basic dashboard', 'Risk summary', 'AI chat (5 msg/day)'],
            pt: ['Dashboard básico', 'Resumo de riscos', 'Chat IA (5 msg/dia)'],
        },
    },
    pro: {
        label: { en: 'Pro', pt: 'Pro' },
        gradient: 'from-blue-500 to-indigo-600',
        shadowColor: 'shadow-blue-500/25',
        icon: <Star className="w-5 h-5" />,
        audits: { en: '50 scans per week', pt: '50 escaneamentos por semana' },
        highlights: {
            en: ['Technical audit (GA4, GTM, pixels)', 'Pre-consent technical indicators', 'PDF report', 'Risk details with 70% tag visibility'],
            pt: ['Auditoria técnica (GA4, GTM e pixels)', 'Indicadores técnicos antes do consentimento', 'Relatório em PDF', 'Detalhes de risco com 70% das tags visíveis'],
        },
    },
    premium: {
        label: { en: 'Premium', pt: 'Premium' },
        gradient: 'from-amber-500 to-orange-600',
        shadowColor: 'shadow-amber-500/25',
        icon: <Crown className="w-5 h-5" />,
        audits: { en: '200 scans per week', pt: '200 escaneamentos por semana' },
        highlights: {
            en: ['Everything in Pro', '100% tag visibility', 'Exact source evidence when observable', 'Excel export', 'Technical regulatory context', 'Priority support'],
            pt: ['Tudo do Pro', '100% de visibilidade das tags', 'Evidência de código quando observável', 'Exportação Excel', 'Contexto regulatório técnico', 'Suporte prioritário'],
        },
    },
};

const CheckoutPage = () => {
    const { toast } = useToast();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { isAuthenticated, user, token } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const locale = useLocale();
    const { language } = useI18n();
    const { markPending } = useSubscription();

    const planId = (params.get('plan') ?? localStorage.getItem('gtm-selected-plan') ?? 'pro') as SubscriptionPlan;
    const cycleParam = (params.get('cycle') ?? localStorage.getItem('gtm-billing-cycle') ?? 'monthly') as BillingCycle;
    const isAnnual = cycleParam === 'annual';
    const plan = PLAN_META[planId] ?? PLAN_META.pro;
    const pricing = PLAN_PRICING[planId]?.[cycleParam] ?? PLAN_PRICING.pro.monthly;
    const isEn = language !== 'pt-BR';
    const localeKey: 'en' | 'pt' = isEn ? 'en' : 'pt';
    const L = (obj: { en: string; pt: string }) => obj[localeKey] ?? obj.en;

    // Monthly equivalent for display
    const monthlyEquivUsd = isAnnual ? Math.round((pricing.usd / 12) * 100) / 100 : pricing.usd;
    const monthlyEquivPrice = localizePrice(monthlyEquivUsd, locale.currencyCode, locale.locale);
    const totalDuePrice = localizePrice(pricing.usd, locale.currencyCode, locale.locale);

    // Next renewal date
    const renewalDate = new Date();
    renewalDate.setMonth(renewalDate.getMonth() + (isAnnual ? 12 : 1));
    const renewalDateStr = renewalDate.toLocaleDateString(locale.locale, { day: 'numeric', month: 'long', year: 'numeric' });

    const planLabel = L(plan.label);
    const highlights = plan.highlights[localeKey] ?? plan.highlights.en;
    const audits = L(plan.audits);

    useEffect(() => {
        if (!isAuthenticated) {
            const dest = `/checkout?plan=${planId}&cycle=${cycleParam}`;
            localStorage.setItem('gtm-redirect-after-auth', dest);
            navigate('/auth');
            return;
        }
        if (!PLAN_META[planId] || planId === 'free') {
            navigate('/pricing');
        }
    }, [isAuthenticated, planId]);

    if (!isAuthenticated || !PLAN_META[planId] || planId === 'free') return null;

    const handlePay = async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            // Store checkout state for tracking
            const checkoutState = {
                planId,
                billingCycle: cycleParam,
                userId: user?.email,
                currency: locale.currencyCode,
                usdPrice: pricing.usd,
                monthlyEquivUsd,
                localPrice: totalDuePrice,
                initiatedAt: new Date().toISOString(),
                status: 'pending',
            };
            localStorage.setItem('gtm-checkout-state', JSON.stringify(checkoutState));
            localStorage.setItem('gtm-selected-plan', planId);
            localStorage.setItem('gtm-billing-cycle', cycleParam);
            
            // Get Kiwify checkout URL
            const billing = isAnnual ? 'annual' : 'monthly';
            const checkoutUrl = getCheckoutUrl(planId as any, billing, user?.email);
            
            if (!checkoutUrl) {
                throw new Error(isEn 
                    ? 'Checkout URL not configured. Please contact support.'
                    : 'URL de checkout não configurada. Entre em contato com o suporte.');
            }

            markPending(planId, cycleParam);
            
            // Redirect to Kiwify secure checkout
            window.location.href = checkoutUrl;
        } catch (err: any) {
            console.error('Checkout error:', err);
            setError(err.message || 'Erro ao processar checkout');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#070b16] flex flex-col">
            {/* Secure nav */}
            <nav className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
                <div className="max-w-xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                            <Tag className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="font-bold text-white text-sm">DataTrust Audit</span>
                    </Link>
                    <div className="flex items-center gap-3">
                        <LocaleSelector compact />
                        <button
                            onClick={() => navigate(`/pricing`)}
                            className="text-white/40 hover:text-white/70 text-xs transition-colors"
                        >
                            {isEn ? '← Change plan' : '← Mudar plano'}
                        </button>
                        <div className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
                            <Lock className="w-3.5 h-3.5" />
                            {isEn ? 'Secure checkout' : 'Checkout seguro'}
                        </div>
                    </div>
                </div>
            </nav>

            <div className="flex-1 flex items-center justify-center px-4 py-12">
                <div className="w-full max-w-md space-y-4">

                    {/* Plan + cycle badge */}
                    <div className="text-center mb-2">
                        <div className="flex items-center justify-center gap-2 mb-3">
                            <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r ${plan.gradient} text-white text-sm font-bold shadow-lg`}>
                                {plan.icon}
                                {isEn ? `${planLabel} Plan` : `Plano ${planLabel}`}
                            </div>
                            <Badge className={`${isAnnual ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-white/10 border-white/20 text-white/60'} text-xs px-3 py-1`}>
                                {isAnnual ? (isEn ? 'Annual -20%' : 'Anual -20%') : (isEn ? 'Monthly' : 'Mensal')}
                            </Badge>
                        </div>
                        <h1 className="text-2xl font-bold text-white mt-2">
                            {isEn ? 'Complete your subscription' : 'Finalizar assinatura'}
                        </h1>
                        <p className="text-white/40 text-sm mt-1">{audits}</p>
                    </div>

                    {/* Order summary */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
                        <div className="text-white/40 text-xs uppercase tracking-widest font-medium mb-4">
                            {isEn ? 'Order Summary' : 'Resumo do pedido'}
                        </div>

                        {/* Main price row */}
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <div className="font-bold text-white">{`DataTrust Audit — ${planLabel}`}</div>
                                <div className="text-white/40 text-sm mt-0.5">
                                    {isAnnual
                                        ? (isEn ? 'Annual subscription' : 'Assinatura anual')
                                        : (isEn ? 'Monthly subscription' : 'Assinatura mensal')}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-extrabold text-white">{monthlyEquivPrice}</div>
                                <div className="text-white/30 text-xs">{isEn ? '/month' : '/mês'}</div>
                            </div>
                        </div>

                        {/* Annual breakdown */}
                        {isAnnual && (
                            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 mb-4">
                                <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2 text-green-300">
                                        <Sparkles className="w-4 h-4" />
                                        {isEn ? '20% annual discount applied' : 'Desconto anual de 20% aplicado'}
                                    </div>
                                    <div className="text-green-400 font-bold">{isEn ? 'SAVE 20%' : 'POUPE 20%'}</div>
                                </div>
                            </div>
                        )}

                        {/* Included features */}
                        <div className="border-t border-white/10 pt-4 space-y-2 mb-4">
                            {highlights.map((h, i) => (
                                <div key={i} className="flex items-start gap-2.5">
                                    <Check className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                                    <span className="text-white/55 text-sm">{h}</span>
                                </div>
                            ))}
                        </div>

                        {/* Billing details */}
                        <div className="border-t border-white/10 pt-4 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-white/50 flex items-center gap-1.5">
                                    <CreditCard className="w-3.5 h-3.5" />
                                    {isEn ? 'Total due today' : 'Total a pagar hoje'}
                                </span>
                                <span className="text-white font-bold text-base">{totalDuePrice}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-white/50 flex items-center gap-1.5">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    {isEn ? 'Renews on' : 'Renova em'}
                                </span>
                                <span className="text-white/70">{renewalDateStr}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-white/50 flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {isEn ? 'Billing frequency' : 'Frequência de cobrança'}
                                </span>
                                <span className="text-white/70">
                                    {isAnnual
                                        ? (isEn ? 'Every 12 months' : 'A cada 12 meses')
                                        : (isEn ? 'Every month' : 'Mensal')}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Account */}
                    {user && (
                        <div className="bg-white/5 border border-white/10 rounded-xl px-5 py-3.5 flex items-center justify-between">
                            <span className="text-white/40 text-xs">{isEn ? 'Account' : 'Conta'}</span>
                            <span className="text-white text-sm font-medium">{user.email}</span>
                        </div>
                    )}

                    {/* Kiwify payment info */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
                        <div className="text-white/40 text-xs uppercase tracking-widest font-medium mb-4">
                            {isEn ? 'Payment' : 'Pagamento'}
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/5 border border-white/10">
                                <Shield className="w-5 h-5 text-blue-400 flex-shrink-0" />
                                <div>
                                    <div className="text-white text-xs font-semibold">{isEn ? 'Cards' : 'Cartões'}</div>
                                    <div className="text-white/30 text-xs">{isEn ? 'Credit & Debit' : 'Crédito e Débito'}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/5 border border-white/10">
                                <Smartphone className="w-5 h-5 text-green-400 flex-shrink-0" />
                                <div>
                                    <div className="text-white text-xs font-semibold">PIX</div>
                                    <div className="text-white/30 text-xs">{isEn ? 'Instant' : 'Imediato'}</div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3.5 flex gap-2.5">
                            <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                            <p className="text-blue-300/80 text-xs">
                                {isEn
                                    ? 'You will be redirected to the secure Kiwify checkout. Access will be activated after payment confirmation or manual activation by admin.'
                                    : 'Você será redirecionado ao checkout seguro da Kiwify. O acesso será liberado após confirmação do pagamento ou ativação manual pelo admin.'}
                            </p>
                        </div>
                    </div>
                    
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm text-center">
                            {error}
                        </div>
                    )}

                    {/* CTA */}
                    <Button
                        onClick={handlePay}
                        disabled={isLoading}
                        size="lg"
                        className={`w-full py-7 text-base font-bold bg-gradient-to-r ${plan.gradient} hover:opacity-90 text-white shadow-2xl ${plan.shadowColor} transition-all hover:scale-[1.01] active:scale-[0.99]`}
                    >
                        {isLoading ? (
                            <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                        ) : (
                            <Lock className="w-4 h-4 mr-2" />
                        )}
                        {isLoading ? (isEn ? 'Redirecting...' : 'Redirecionando...') : (isEn
                            ? `Subscribe — ${totalDuePrice}`
                            : `Assinar — ${totalDuePrice}`)}
                        {!isLoading && <ArrowRight className="w-4 h-4 ml-2" />}
                    </Button>

                    {/* Trust signals */}
                    <div className="mt-4 flex items-center justify-center gap-4 text-white/25 text-xs pt-1">
                        <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> SSL</span>
                        <span>•</span>
                        <span>{isEn ? '30-day guarantee' : 'Garantia 30 dias'}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Kiwify</span>
                    </div>

                    <p className="text-center text-white/15 text-xs mt-4">
                        {isEn
                            ? `By clicking subscribe, you agree to a ${isAnnual ? 'yearly' : 'monthly'} recurring subscription. Cancel anytime from your account.`
                            : `Ao clicar em assinar, você concorda com uma assinatura recorrente ${isAnnual ? 'anual' : 'mensal'}. Cancele quando quiser na sua conta.`}
                    </p>
                    <div className="border-t border-white/5 pt-4 text-center text-white/20 text-xs space-y-1">
                        <p>
                            {isEn ? 'By proceeding, you agree to our ' : 'Ao prosseguir, você concorda com nossos '}
                            <Link to="/terms" className="underline hover:text-white/40">{isEn ? 'Terms' : 'Termos'}</Link>
                            {' & '}
                            <Link to="/privacy" className="underline hover:text-white/40">{isEn ? 'Privacy Policy' : 'Privacidade'}</Link>.
                        </p>
                        <p>
                            {isEn
                                ? 'Indicative technical assessment. Does not replace legal advice.'
                                : 'Avaliação técnica indicativa. Não substitui assessoria jurídica.'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckoutPage;
