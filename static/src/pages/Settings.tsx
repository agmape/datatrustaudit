import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSubscription, SubscriptionPlan, BillingCycle } from '@/context/SubscriptionContext';
import { useI18n } from '@/context/I18nContext';
import { useLocale, localizePrice } from '@/hooks/useLocale';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import AppHeader from '@/components/AppHeader';
import { CreditCard, Calendar, Activity, AlertCircle, ArrowUpCircle, XCircle, Tag, Crown, Star } from 'lucide-react';
import { PLAN_PRICING } from '@/context/SubscriptionContext';

const SettingsPage = () => {
    const { user, isAuthenticated } = useAuth();
    const { subscription, cancelSubscription } = useSubscription();
    const { language, t } = useI18n();
    const locale = useLocale();
    const navigate = useNavigate();

    if (!isAuthenticated) {
        navigate('/auth');
        return null;
    }

    const isEn = language !== 'pt-BR';
    const localeKey: 'en' | 'pt' = isEn ? 'en' : 'pt';
    const L = (obj: { en: string; pt: string }) => obj[localeKey] ?? obj.en;

    const planData = {
        free: { icon: <Tag className="w-5 h-5 text-slate-400" />, label: { en: 'Free', pt: 'Grátis' }, gradient: 'from-slate-500 to-slate-600' },
        pro: { icon: <Star className="w-5 h-5 text-blue-400" />, label: { en: 'Pro', pt: 'Pro' }, gradient: 'from-blue-500 to-indigo-600' },
        full: { icon: <Crown className="w-5 h-5 text-amber-400" />, label: { en: 'Premium', pt: 'Premium' }, gradient: 'from-amber-500 to-orange-600' }
    };

    const currentPlanId = subscription.plan;
    const currentMeta = planData[currentPlanId];
    
    // Status visual mapping
    const statusMap = {
        active: { color: 'bg-green-500/10 text-green-400 border-green-500/20', pt: 'Ativa', en: 'Active' },
        pending: { color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', pt: 'Pendente', en: 'Pending' },
        past_due: { color: 'bg-red-500/10 text-red-400 border-red-500/20', pt: 'Atrasada', en: 'Past Due' },
        canceled: { color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', pt: 'Cancelada', en: 'Canceled' }
    };
    
    const subStatus = statusMap[subscription.status] ?? statusMap.active;

    // For display limits if needed
    const limits = {
        free: { pt: '1 / mês', en: '1 / month' },
        pro: { pt: '2 / mês', en: '2 / month' },
        full: { pt: '3 / mês', en: '3 / month' }
    };

    const handleCancel = () => {
        if(confirm(isEn ? 'Are you sure you want to cancel your subscription?' : 'Tem certeza que deseja cancelar sua assinatura?')) {
            cancelSubscription();
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <AppHeader />
            <main className="container mx-auto px-4 py-8 max-w-4xl">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                        {isEn ? 'Account Settings' : 'Configurações da Conta'}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">
                        {isEn ? 'Manage your profile and billing details.' : 'Gerencie seu perfil e detalhes de faturamento.'}
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {/* Left Sidebar Nav */}
                    <div className="space-y-2">
                        <Button variant="secondary" className="w-full justify-start font-medium">
                            <CreditCard className="w-4 h-4 mr-2" />
                            {isEn ? 'Billing & Plan' : 'Faturamento e Plano'}
                        </Button>
                        <Button variant="ghost" className="w-full justify-start text-slate-500">
                            <Activity className="w-4 h-4 mr-2" />
                            {isEn ? 'Usage' : 'Uso'}
                        </Button>
                    </div>

                    {/* Main Content Area */}
                    <div className="md:col-span-2 space-y-6">
                        
                        {/* Current Plan Card */}
                        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-indigo-600/10 blur-3xl -z-10" />
                            <CardHeader className="pb-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            {L(currentMeta.label)} Plan
                                            {subscription.plan !== 'free' && (
                                                <Badge variant="outline" className={`ml-2 font-normal text-xs ${subStatus.color}`}>
                                                    {isEn ? subStatus.en : subStatus.pt}
                                                </Badge>
                                            )}
                                        </CardTitle>
                                        <CardDescription>
                                            {subscription.plan === 'free' 
                                                ? (isEn ? 'You are currently on the Free plan.' : 'Você está atualmente no plano Grátis.')
                                                : (isEn ? `Billed ${subscription.billingCycle}` : `Faturado ${subscription.billingCycle === 'monthly' ? 'mensalmente' : 'anualmente'}`)
                                            }
                                        </CardDescription>
                                    </div>
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${currentMeta.gradient} shadow-lg text-white`}>
                                        {currentMeta.icon}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Plan Stats */}
                                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 pt-6">
                                    <div>
                                        <div className="text-sm text-slate-500 mb-1 flex items-center gap-1.5">
                                            <Activity className="w-4 h-4" />
                                            {isEn ? 'Audits Limit' : 'Limite de Auditorias'}
                                        </div>
                                        <div className="font-semibold text-slate-900 dark:text-white">
                                            {limits[currentPlanId]?.[localeKey]}
                                        </div>
                                    </div>
                                    {subscription.plan !== 'free' && (
                                        <div>
                                            <div className="text-sm text-slate-500 mb-1 flex items-center gap-1.5">
                                                <Calendar className="w-4 h-4" />
                                                {isEn ? 'Next billing date' : 'Próxima cobrança'}
                                            </div>
                                            <div className="font-semibold text-slate-900 dark:text-white">
                                                {subscription.nextRenewalAt ? new Date(subscription.nextRenewalAt).toLocaleDateString(isEn ? 'en-US' : 'pt-BR', { month: 'long', day: 'numeric', year: 'numeric'}) : '-'}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Pending Alert */}
                                {subscription.status === 'pending' && (
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex gap-3 text-amber-600 dark:text-amber-400">
                                        <AlertCircle className="w-5 h-5 shrink-0" />
                                        <div className="text-sm">
                                            <h4 className="font-semibold mb-1">{isEn ? 'Payment Pending' : 'Pagamento Pendente'}</h4>
                                            <p>{isEn ? 'We are waiting for the payment provider to confirm your transaction.' : 'Estamos aguardando o provedor confirmar sua transação.'}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                                    {subscription.plan !== 'premium' && (
                                        <Button asChild className="bg-gradient-to-r flex-1 from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg">
                                            <Link to="/pricing">
                                                <ArrowUpCircle className="w-4 h-4 mr-2" />
                                                {isEn ? 'Upgrade Plan' : 'Fazer Upgrade'}
                                            </Link>
                                        </Button>
                                    )}
                                    {subscription.plan !== 'free' && subscription.status !== 'cancelled' && (
                                        <Button variant="outline" onClick={handleCancel} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900/30">
                                            <XCircle className="w-4 h-4 mr-2" />
                                            {isEn ? 'Cancel Subscription' : 'Cancelar Assinatura'}
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default SettingsPage;
