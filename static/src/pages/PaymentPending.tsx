import { useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useSubscription, SubscriptionPlan } from '@/context/SubscriptionContext';
import { useI18n } from '@/context/I18nContext';
import { Button } from '@/components/ui/button';
import { Clock, RefreshCw, Tag, Mail } from 'lucide-react';
import MinimalTopMenu from '@/components/MinimalTopMenu';

const PaymentPending = () => {
    const [params] = useSearchParams();
    const { markPending } = useSubscription();
    const { t } = useI18n();
    const navigate = useNavigate();

    const planId = (params.get('plan') ?? localStorage.getItem('gtm-selected-plan') ?? 'pro') as SubscriptionPlan;
    const planName = planId === 'premium' ? 'Premium' : planId === 'pro' ? 'Pro' : 'Free';
    const tx = (key: string, vars: Record<string, string> = {}) =>
        Object.entries(vars).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));

    useEffect(() => {
        markPending(planId);
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 pt-20">
            <MinimalTopMenu />
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-amber-500/8 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md text-center">
                {/* Animated pending icon */}
                <div className="mx-auto w-20 h-20 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/20">
                    <Clock className="w-10 h-10 text-amber-400 animate-pulse" />
                </div>

                <h1 className="text-3xl font-bold text-white mb-2">
                    {t('payment.pending_title')}
                </h1>
                <p className="text-white/50 mb-2">
                    {tx('payment.pending_message', { plan: planName })}
                </p>
                <p className="text-white/30 text-sm mb-8">
                    {t('payment.pending_note')}
                </p>

                {/* Status card */}
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 mb-6 text-left space-y-3">
                    <div className="flex items-center gap-2.5">
                        <Tag className="w-4 h-4 text-amber-400" />
                        <span className="text-white font-semibold">DataTrust Audit — {planName}</span>
                        <span className="ml-auto bg-amber-500/20 text-amber-300 text-xs font-bold px-2 py-0.5 rounded-full">
                            {t('payment.pending')}
                        </span>
                    </div>
                    <div className="text-white/40 text-xs flex items-start gap-2">
                        <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        {t('payment.pending_email')}
                    </div>
                </div>

                <div className="space-y-3">
                    <Button
                        onClick={() => navigate('/')}
                        variant="outline"
                        className="w-full border-white/20 text-white hover:bg-white/5 py-5 font-medium"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {t('payment.check_status')}
                    </Button>
                    <p className="text-white/20 text-xs">
                        {t('payment.questions')}{' '}
                        <a href="mailto:suporte@datatrustauditpro.com" className="text-blue-400 hover:text-blue-300">
                            suporte@datatrustauditpro.com
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PaymentPending;

