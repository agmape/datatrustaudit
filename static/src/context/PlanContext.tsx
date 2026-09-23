import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { useAuth } from './AuthContext';

export type PlanType = 'free' | 'pro' | 'premium';
export type EffectivePlan = PlanType | 'admin';

export interface UserPlan {
    type: PlanType;
    name: string;
    scansRemaining: number;
    scansLimit: number;
    expiresAt?: string;
    features: string[];
    isAdmin?: boolean;
    subscriptionStatus?: string;
    effectivePlan?: EffectivePlan;
    weeklyResetAt?: string;
}

export interface PlanLimits {
    scansPerWeek: number;          // -1 = unlimited
    showScripts: boolean;          // view-source with exact HTML position — Premium only
    showLineNumbers: boolean;      // line number column in tag table — Premium only
    showViolationDetails: boolean; // LGPD violation details — Pro+
    showHistory: boolean;          // audit history — Premium only
    jsonExport: boolean;           // JSON export — Pro+
    pdfExport: boolean;            // PDF export — Pro+
    excelExport: boolean;          // Excel export — Premium only
    deepAnalysis: boolean;         // AI deep analysis tab — Premium only
    aiChat: boolean;               // AI chat widget
    aiChatMessagesPerDay: number;  // -1 = unlimited
    realTimeAnalysis: boolean;     // real-time mode tab — Premium only
    dashboardDetails: 'basic' | 'partial' | 'full';
    visibilityPercentage: number;  // 30 / 70 / 100
}

export const PLAN_CONFIGS: Record<PlanType, {
    name: string;
    price: number;
    priceLabel: string;
    limits: PlanLimits;
    badge: string;
    color: string;
    features: string[];
    blockedFeatures: string[];
}> = {
    free: {
        name: 'Free',
        price: 0,
        priceLabel: 'Grátis',
        badge: '🆓',
        color: 'from-gray-400 to-gray-500',
        features: [
            '3 escaneamentos por mês',
            'Dashboard básico',
            '30% de visibilidade dos dados',
            'Contagem de tags detectadas',
            'Score geral resumido',
            'Chat IA limitado (5 msg/dia)'
        ],
        blockedFeatures: [
            'Exportação PDF / JSON / Excel',
            'Detalhes de violações LGPD/GDPR',
            'Histórico completo de escaneamentos',
            'View-source avançado',
            'Localização exata no HTML'
        ],
        limits: {
            scansPerWeek: 3,
            showScripts: false,
            showLineNumbers: false,
            showViolationDetails: false,
            showHistory: false,
            jsonExport: false,
            pdfExport: false,
            excelExport: false,
            deepAnalysis: false,
            aiChat: true,
            aiChatMessagesPerDay: 5,
            realTimeAnalysis: false,
            dashboardDetails: 'basic',
            visibilityPercentage: 30
        }
    },
    pro: {
        name: 'Pro',
        price: 497,
        priceLabel: 'R$ 497,00/mês',
        badge: '⭐',
        color: 'from-blue-500 to-indigo-600',
        features: [
            '50 escaneamentos por mês',
            'Dashboard detalhado — 100% de visibilidade',
            'Relatórios PDF profissionais',
            'Detalhes completos de violações LGPD',
            'Exportação PDF e JSON',
            'Chat IA ilimitado',
            'Recomendações de correção',
            'Análise de tags, eventos e privacidade'
        ],
        blockedFeatures: [
            'View-source avançado (posição exata no HTML)',
            'Números de linha / debugging de código',
            'Monitoramento contínuo',
            'Deep Scan multi-página',
            'Exportação Excel',
            'API e Alertas automáticos'
        ],
        limits: {
            scansPerWeek: 50,
            showScripts: false,
            showLineNumbers: false,
            showViolationDetails: true,
            showHistory: false,
            jsonExport: true,
            pdfExport: true,
            excelExport: false,
            deepAnalysis: false,
            aiChat: true,
            aiChatMessagesPerDay: -1,
            realTimeAnalysis: false,
            dashboardDetails: 'partial',
            visibilityPercentage: 100
        }
    },
    premium: {
        name: 'Premium',
        price: 2497,
        priceLabel: 'R$ 2.497,00/mês',
        badge: '👑',
        color: 'from-amber-500 to-orange-600',
        features: [
            'Escaneamentos Ilimitados',
            'Monitoramento Contínuo — alertas automáticos',
            '100% de visibilidade dos dados',
            'Tudo do plano Pro',
            'View-source avançado — posição exata no HTML',
            'Números de linha e debugging de código',
            'API de integração + Webhooks',
            'Deep Scan multi-página',
            'Histórico completo de escaneamentos',
            'Exportação PDF / JSON / Excel',
            'Suporte prioritário dedicado',
            'Análise completa de LGPD/GDPR'
        ],
        blockedFeatures: [],
        limits: {
            scansPerWeek: -1,
            showScripts: true,
            showLineNumbers: true,
            showViolationDetails: true,
            showHistory: true,
            jsonExport: true,
            pdfExport: true,
            excelExport: true,
            deepAnalysis: true,
            aiChat: true,
            aiChatMessagesPerDay: -1,
            realTimeAnalysis: true,
            dashboardDetails: 'full',
            visibilityPercentage: 100
        }
    }
};

// Admin limits — unlocks everything
const ADMIN_LIMITS: PlanLimits = {
    scansPerWeek: -1,
    showScripts: true,
    showLineNumbers: true,
    showViolationDetails: true,
    showHistory: true,
    jsonExport: true,
    pdfExport: true,
    excelExport: true,
    deepAnalysis: true,
    aiChat: true,
    aiChatMessagesPerDay: -1,
    realTimeAnalysis: true,
    dashboardDetails: 'full',
    visibilityPercentage: 100,
};

// Upgrade copy persuasiva por plano — modelo B2B
export const UPGRADE_COPY = {
    free: {
        title: '🔒 Você está vendo apenas 30%',
        subtitle: 'Desbloqueie violações, PDF e 100% dos dados com o Pro',
        cta: 'Assinar Pro — R$ 497,00/mês',
        urgency: '⚡ Análise completa, 50 escaneamentos/mês'
    },
    pro: {
        title: '⭐ Falta pouco para o máximo',
        subtitle: 'Acesse monitoramento contínuo, API, alertas e Excel com o Premium',
        cta: 'Upgrade para Premium — R$ 2.497,00/mês',
        urgency: '🔥 Ilimitado + API + Monitoramento Contínuo'
    }
};

export const BLURRED_MESSAGES = {
    scripts: 'View-source avançado com posição exata no HTML é exclusivo do Premium',
    showLineNumbers: 'Números de linha disponíveis apenas no Premium',
    history: 'Histórico de escaneamentos disponível apenas no Premium',
    details: 'Detalhes de violações disponíveis no plano Pro ou superior',
    realtime: 'Análise em tempo real é exclusiva do Premium',
    jsonExport: 'Exportação JSON disponível a partir do plano Pro',
    pdfExport: 'Exportação PDF disponível a partir do plano Pro',
    excelExport: 'Exportação Excel é exclusiva do Premium',
    deepAnalysis: 'Deep Scan avançado disponível apenas no Premium'
};

/**
 * Compute the effective plan for feature gating.
 * Admin preview mode can simulate any plan for testing.
 */
export function getEffectivePlan(
    user: { is_admin?: boolean; plan?: string } | null,
    adminPreviewPlan: PlanType | null
): EffectivePlan {
    if (user?.is_admin && adminPreviewPlan) return adminPreviewPlan;
    if (user?.is_admin) return 'admin';
    return (user?.plan as PlanType) || 'free';
}

interface PlanContextType {
    plan: UserPlan;
    limits: PlanLimits;       // UI limits — may be mocked for admin preview
    actionLimits: PlanLimits; // Action limits — always ADMIN_LIMITS for admin (never mocked)
    effectivePlan: EffectivePlan;
    adminPreviewPlan: PlanType | null;
    adminIsPreviewingUI: boolean; // true when admin has selected a preview plan
    setAdminPreviewPlan: (plan: PlanType | null) => void;
    isFeatureAvailable: (feature: keyof PlanLimits) => boolean;
    canPerformAudit: () => boolean;
    useAudit: () => void;
    upgradePlan: (newPlan: PlanType) => void;
    selectPlan: (newPlan: PlanType) => void;
    selectedPlan: PlanType | null;
    getUsagePercentage: () => number;
    showUpgradeModal: boolean;
    setShowUpgradeModal: (show: boolean) => void;
    blockedFeature: string | null;
    setBlockedFeature: (feature: string | null) => void;
    getVisibility: () => number;
    shouldBlur: (feature: keyof PlanLimits) => boolean;
}

const PlanContext = createContext<PlanContextType | null>(null);

export const usePlan = () => {
    const context = useContext(PlanContext);
    if (!context) {
        throw new Error('usePlan must be used within PlanProvider');
    }
    return context;
};

interface PlanProviderProps {
    children: ReactNode;
}

export const PlanProvider = ({ children }: PlanProviderProps) => {
    const { user } = useAuth();
    const [adminPreviewPlan, setAdminPreviewPlan] = useState<PlanType | null>(null);

    const [plan, setPlan] = useState<UserPlan>(() => {
        const saved = localStorage.getItem('gtm-audit-plan');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object' && parsed.type && PLAN_CONFIGS[parsed.type as PlanType]) {
                    return parsed;
                }
                if (parsed && typeof parsed === 'string' && PLAN_CONFIGS[parsed as PlanType]) {
                    const type = parsed as PlanType;
                    return {
                        type,
                        name: PLAN_CONFIGS[type].name,
                        scansRemaining: PLAN_CONFIGS[type].limits.scansPerWeek,
                        scansLimit: PLAN_CONFIGS[type].limits.scansPerWeek,
                        features: PLAN_CONFIGS[type].features || []
                    };
                }
            } catch {
                return getDefaultPlan();
            }
        }
        return getDefaultPlan();
    });

    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [blockedFeature, setBlockedFeature] = useState<string | null>(null);

    function getDefaultPlan(): UserPlan {
        return {
            type: 'free',
            name: 'Free',
            scansRemaining: PLAN_CONFIGS.free.limits.scansPerWeek,
            scansLimit: PLAN_CONFIGS.free.limits.scansPerWeek,
            features: ['basic_audit', 'ai_chat_limited']
        };
    }

    const [selectedPlan, setSelectedPlanState] = useState<PlanType | null>(() => {
        const saved = localStorage.getItem('gtm-audit-selected-plan');
        return (saved as PlanType) || null;
    });

    const selectPlan = (newPlan: PlanType) => {
        setSelectedPlanState(newPlan);
        localStorage.setItem('gtm-audit-selected-plan', newPlan);
    };

    // Sync plan from authenticated user data
    useEffect(() => {
        if (user) {
            const userPlanType = (user.plan as PlanType) || 'free';
            const isAdmin = Boolean(user.is_admin);
            const scansLimit = user.scans_limit ?? PLAN_CONFIGS[userPlanType]?.limits.scansPerWeek ?? 10;
            const scansUsed = user.scans_used ?? 0;

            setPlan({
                type: userPlanType,
                name: isAdmin ? 'Admin' : (PLAN_CONFIGS[userPlanType]?.name || 'Free'),
                scansRemaining: scansLimit === -1 ? -1 : Math.max(0, scansLimit - scansUsed),
                scansLimit: scansLimit,
                isAdmin: isAdmin,
                subscriptionStatus: user.subscription_status,
                effectivePlan: user.effective_plan as EffectivePlan,
                features: PLAN_CONFIGS[userPlanType]?.features || [],
            });
        }
    }, [user]);


    useEffect(() => {
        localStorage.setItem('gtm-audit-plan', JSON.stringify(plan));
    }, [plan]);

    // Reset scans weekly (for non-authenticated fallback)
    useEffect(() => {
        if (user) return; // Skip reset if user is loaded from backend
        const lastReset = localStorage.getItem('gtm-audit-last-reset');
        const now = new Date();
        const currentWeek = `${now.getFullYear()}-W${Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7)}-${now.getMonth()}`;

        if (lastReset !== currentWeek) {
            setPlan(prev => ({
                ...prev,
                scansRemaining: PLAN_CONFIGS[prev.type].limits.scansPerWeek
            }));
            localStorage.setItem('gtm-audit-last-reset', currentWeek);
        }
    }, [user]);

    // ── Derived values (memoized) ────────────────────────────────────────
    const isAdminUser = useMemo(() => Boolean(user?.is_admin) || Boolean(plan.isAdmin), [user, plan.isAdmin]);
    const adminIsPreviewingUI = isAdminUser && adminPreviewPlan !== null;

    /** effectivePlan — governs UI rendering and blur effects. Mocked for admin preview. */
    const effectivePlan = useMemo(() => getEffectivePlan(
        user ? { is_admin: user.is_admin, plan: user.plan } : (plan.isAdmin ? { is_admin: true, plan: plan.type } : null),
        adminPreviewPlan
    ), [user, plan.isAdmin, plan.type, adminPreviewPlan]);

    /** limits — UI/visual limits. Mocked in preview so blurs render correctly. */
    const limits: PlanLimits = useMemo(() => {
        if (effectivePlan === 'admin') return ADMIN_LIMITS;
        return PLAN_CONFIGS[effectivePlan as PlanType]?.limits || PLAN_CONFIGS.free.limits;
    }, [effectivePlan]);

    /** actionLimits — ALWAYS ADMIN_LIMITS for admin — never mocked by preview. */
    const actionLimits: PlanLimits = useMemo(() => {
        if (isAdminUser) return ADMIN_LIMITS;
        return limits;
    }, [isAdminUser, limits]);

    const isFeatureAvailable = (feature: keyof PlanLimits): boolean => {
        // Visual gating uses uiLimits — shows blurs/banners in preview mode.
        // But for admin, we check their ACTUAL ability, not the mock.
        // isFeatureAvailable drives both UI gating (blur) AND button disabling.
        // We deliberately use `limits` (UI limits) so the admin can SEE the mocked
        // state, but actions (canPerformAudit, useAudit) use actionLimits.
        if (effectivePlan === 'admin') return true;
        const value = limits[feature];
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        return true;
    };

    const shouldBlur = (feature: keyof PlanLimits): boolean => {
        return !isFeatureAvailable(feature);
    };

    /**
     * canPerformAudit — always uses actionLimits.
     * Admin in preview mode can ALWAYS run audits (scans: Unlimited).
     */
    const canPerformAudit = (): boolean => {
        if (isAdminUser) return true; // Admin bypass — never blocked by preview
        return actionLimits.scansPerWeek === -1 || plan.scansRemaining > 0;
    };

    /**
     * useAudit — only deducts credits for non-admin users.
     * Admin in preview mode never consumes scan credits.
     */
    const useAudit = () => {
        if (isAdminUser) return; // Admin bypass
        setPlan(prev => ({
            ...prev,
            scansRemaining: prev.scansLimit === -1 ? -1 : Math.max(0, prev.scansRemaining - 1)
        }));
    };

    const upgradePlan = (newPlan: PlanType) => {
        const config = PLAN_CONFIGS[newPlan];
        setPlan(prev => ({
            ...prev,
            type: newPlan,
            name: config.name,
            scansRemaining: config.limits.scansPerWeek,
            scansLimit: config.limits.scansPerWeek,
            features: Object.entries(config.limits)
                .filter(([_, v]) => v === true || (typeof v === 'number' && v > 0))
                .map(([k]) => k)
        }));
        setShowUpgradeModal(false);
    };

    const getUsagePercentage = (): number => {
        if (plan.scansLimit === -1) return 0;
        return ((plan.scansLimit - plan.scansRemaining) / plan.scansLimit) * 100;
    };


    const getVisibility = (): number => {
        return limits.visibilityPercentage;
    };

    return (
        <PlanContext.Provider value={{
            plan,
            limits,
            actionLimits,
            effectivePlan,
            adminPreviewPlan,
            adminIsPreviewingUI,
            setAdminPreviewPlan,
            isFeatureAvailable,
            canPerformAudit,
            useAudit,
            upgradePlan,
            selectPlan,
            selectedPlan,
            getUsagePercentage,
            showUpgradeModal,
            setShowUpgradeModal,
            blockedFeature,
            setBlockedFeature,
            getVisibility,
            shouldBlur
        }}>
            {children}
        </PlanContext.Provider>
    );
};

export default PlanProvider;
