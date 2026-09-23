import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Zap,
    Crown,
    ChevronDown,
    Sparkles,
    BarChart3,
    History,
    Star
} from 'lucide-react';
import { usePlan, PlanType } from '@/context/PlanContext';
import { useI18n } from '@/context/I18nContext';
import { Link } from 'react-router-dom';

const PlanBadge = () => {
    const { plan, limits, getUsagePercentage, effectivePlan } = usePlan();
    const { t } = useI18n();

    const getPlanIcon = (planType: PlanType) => {
        switch (planType) {
            case 'free': return <Zap className="h-3 w-3" />;
            case 'pro': return <Star className="h-3 w-3 text-blue-400" />;
            case 'premium': return <Crown className="h-3 w-3 text-amber-500" />;
            default: return <Zap className="h-3 w-3" />;
        }
    };

    const getPlanColor = (planType: PlanType) => {
        if (effectivePlan === 'admin') return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25';
        switch (planType) {
            case 'free': return 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10';
            case 'pro': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20';
            case 'premium': return 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0 shadow-lg shadow-amber-500/20 hover:from-amber-600 hover:to-orange-700';
            default: return 'bg-white/5 text-white/60';
        }
    };

    const usagePercentage = getUsagePercentage();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={`gap-2 h-9 rounded-xl px-4 ${getPlanColor(plan.type)} shadow-sm transition-all duration-300 group`}
                >
                    {effectivePlan === 'admin' ? <Crown className="h-3 w-3 text-emerald-400" /> : getPlanIcon(plan.type)}
                    <span className="font-bold tracking-tight">{effectivePlan === 'admin' ? 'Admin' : t(`plans.${plan.type}.label`)}</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-all" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 bg-slate-900/95 border-white/10 backdrop-blur-2xl text-white shadow-2xl p-2">
                <DropdownMenuLabel className="flex items-center gap-2 px-3 py-2">
                    <div className={`p-1.5 rounded-lg ${getPlanColor(plan.type)}`}>
                        {getPlanIcon(plan.type)}
                    </div>
                    <div>
                        <p className="text-xs font-bold text-white/30 uppercase tracking-widest">{t('pricing.current_plan')}</p>
                        <p className="text-sm font-bold text-white">{t(`plans.${plan.type}.label`)}</p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/5" />

                {/* Usage */}
                <div className="px-3 py-4">
                    <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold text-white/40 mb-2">
                        <span>{t('pricing.compare.audits_per_month')}</span>
                        <span>
                            {limits.scansPerWeek === -1 || limits.scansPerWeek > 100 ? (
                                <span className="text-blue-400 font-bold">{t('common.unlimited')}</span>
                            ) : (
                                `${plan.scansLimit - plan.scansRemaining} / ${plan.scansLimit}`
                            )}
                        </span>
                    </div>
                    {(limits.scansPerWeek !== -1 && limits.scansPerWeek <= 200) && (
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div 
                                className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-1000" 
                                style={{ width: `${usagePercentage}%` }} 
                            />
                        </div>
                    )}
                </div>

                <DropdownMenuSeparator className="bg-white/5" />

                {/* Features summarizadas */}
                <div className="px-2 py-2 space-y-1">
                    <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                        <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center">
                            <BarChart3 className="h-3.5 w-3.5 text-white/40" />
                        </div>
                        <span className="text-xs text-white/60">
                            <strong className="text-white">{limits.visibilityPercentage}%</strong> {t('pricing.data_visibility')}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                        <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center">
                            <Sparkles className="h-3.5 w-3.5 text-white/40" />
                        </div>
                        <span className="text-xs text-white/60">
                            {limits.deepAnalysis ? (
                                <span className="text-blue-400 font-medium">{t('home.tab_deep')} {t('common.active')}</span>
                            ) : (
                                <span className="text-white/30">{t('home.tab_deep')} {t('common.locked')}</span>
                            )}
                        </span>
                    </div>
                </div>

                {plan.type !== 'premium' && effectivePlan !== 'admin' && (
                    <>
                        <DropdownMenuSeparator className="bg-white/5" />
                        <DropdownMenuItem asChild className="focus:bg-white/5 cursor-pointer p-0">
                            <Link to="/pricing" className="flex items-center w-full px-3 py-3 text-blue-400 hover:text-blue-300">
                                <Crown className="h-4 w-4 mr-2" />
                                <span className="font-bold text-sm tracking-tight">{t('nav.upgrade')}</span>
                            </Link>
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default PlanBadge;
