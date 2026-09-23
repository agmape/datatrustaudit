import { createContext, useContext, useState, ReactNode } from 'react';

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
    scansPerWeek: number;
    showScripts: boolean;
    showLineNumbers: boolean;
    showViolationDetails: boolean;
    showHistory: boolean;
    jsonExport: boolean;
    pdfExport: boolean;
    excelExport: boolean;
    deepAnalysis: boolean;
    aiChat: boolean;
    aiChatMessagesPerDay: number;
    realTimeAnalysis: boolean;
    dashboardDetails: 'basic' | 'partial' | 'full';
    visibilityPercentage: number;
}

const FULL_LIMITS: PlanLimits = {
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

// Kept only for backwards-compatible imports in older components.
// Every legacy plan key now resolves to the same unrestricted feature set.
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
    free: { name: 'Full Access', price: 0, priceLabel: 'Liberado', badge: '', color: '', features: [], blockedFeatures: [], limits: FULL_LIMITS },
    pro: { name: 'Full Access', price: 0, priceLabel: 'Liberado', badge: '', color: '', features: [], blockedFeatures: [], limits: FULL_LIMITS },
    premium: { name: 'Full Access', price: 0, priceLabel: 'Liberado', badge: '', color: '', features: [], blockedFeatures: [], limits: FULL_LIMITS },
};

export const UPGRADE_COPY = {
    free: { title: '', subtitle: '', cta: '', urgency: '' },
    pro: { title: '', subtitle: '', cta: '', urgency: '' },
};

export const BLURRED_MESSAGES: Record<string, string> = {};

export function getEffectivePlan(): EffectivePlan {
    return 'premium';
}

interface PlanContextType {
    plan: UserPlan;
    limits: PlanLimits;
    actionLimits: PlanLimits;
    effectivePlan: EffectivePlan;
    adminPreviewPlan: PlanType | null;
    adminIsPreviewingUI: boolean;
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
    if (!context) throw new Error('usePlan must be used within PlanProvider');
    return context;
};

export const PlanProvider = ({ children }: { children: ReactNode }) => {
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [blockedFeature, setBlockedFeature] = useState<string | null>(null);
    const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);
    const [adminPreviewPlan, setAdminPreviewPlan] = useState<PlanType | null>(null);

    const plan: UserPlan = {
        type: 'premium',
        name: 'Full Access',
        scansRemaining: -1,
        scansLimit: -1,
        features: ['all'],
        isAdmin: true,
        subscriptionStatus: 'active',
        effectivePlan: 'premium',
    };

    const isFeatureAvailable = (_feature: keyof PlanLimits) => true;
    const canPerformAudit = () => true;
    const useAudit = () => {};
    const upgradePlan = (_newPlan: PlanType) => {};
    const selectPlan = (newPlan: PlanType) => setSelectedPlan(newPlan);
    const getUsagePercentage = () => 0;
    const getVisibility = () => 100;
    const shouldBlur = (_feature: keyof PlanLimits) => false;

    return (
        <PlanContext.Provider value={{
            plan,
            limits: FULL_LIMITS,
            actionLimits: FULL_LIMITS,
            effectivePlan: 'premium',
            adminPreviewPlan,
            adminIsPreviewingUI: false,
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
            shouldBlur,
        }}>
            {children}
        </PlanContext.Provider>
    );
};

export default PlanProvider;
