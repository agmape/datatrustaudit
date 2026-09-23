import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSubscription } from '@/context/SubscriptionContext';
import { useI18n } from '@/context/I18nContext';
import { Button } from '@/components/ui/button';
import { XCircle, ArrowLeft, RefreshCw, Tag } from 'lucide-react';
import MinimalTopMenu from '@/components/MinimalTopMenu';

const PaymentFailed = () => {
    const { markFailed } = useSubscription();
    const { t } = useI18n();
    const navigate = useNavigate();

    useEffect(() => {
        markFailed();
    }, []);

    const reasons = [
        t('payment.reason_balance'),
        t('payment.reason_card'),
        t('payment.reason_limit'),
        t('payment.reason_bank'),
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 pt-20">
            <MinimalTopMenu />
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-red-500/8 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md text-center">
                {/* Error icon */}
                <div className="mx-auto w-20 h-20 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-6 shadow-lg shadow-red-500/20">
                    <XCircle className="w-10 h-10 text-red-400" />
                </div>

                <h1 className="text-3xl font-bold text-white mb-2">
                    {t('payment.failed_title')}
                </h1>
                <p className="text-white/50 mb-8">
                    {t('payment.failed_desc')}
                </p>

                {/* Common reasons */}
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 mb-6 text-left">
                    <div className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-3">
                        {t('payment.possible_reasons')}
                    </div>
                    <ul className="space-y-2">
                        {reasons.map((r, i) => (
                            <li key={i} className="text-white/40 text-sm flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-red-400/60 rounded-full flex-shrink-0" />
                                {r}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="space-y-3">
                    <Button
                        onClick={() => navigate('/pricing')}
                        className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white py-5 font-semibold shadow-lg"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {t('payment.try_again')}
                    </Button>
                    <Button
                        onClick={() => navigate('/')}
                        variant="outline"
                        className="w-full border-white/20 text-white hover:bg-white/5 py-4"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {t('payment.back_home')}
                    </Button>
                    <p className="text-white/20 text-xs pt-1">
                        {t('payment.issue_persisting')}{' '}
                        <a href="mailto:suporte@datatrustauditpro.com" className="text-blue-400 hover:text-blue-300">
                            suporte@datatrustauditpro.com
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PaymentFailed;

