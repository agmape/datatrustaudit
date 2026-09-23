import { PlanType } from '../context/PlanContext';

export interface PlanPricing {
    monthly: number;
    annual: number;
    savingsPct: number;
}

export interface PlanConfig {
    id: PlanType;
    labelKey: string;
    badgeKey: string;
    visibility: number;
    scansPerWeek: number;
    featuresKeys: string[];
    lockedKeys: string[];
    pricing: PlanPricing;
    checkoutUrl?: string;
}

// Kiwify checkout URLs
const KIWIFY_PRO_MONTHLY = import.meta.env.VITE_KIWIFY_PRO_MONTHLY_URL || 'https://pay.kiwify.com.br/d1eUlrr';
const KIWIFY_PREMIUM_MONTHLY = import.meta.env.VITE_KIWIFY_PREMIUM_MONTHLY_URL || 'https://pay.kiwify.com.br/DfeG9rm';
const KIWIFY_PRO_YEARLY = import.meta.env.VITE_KIWIFY_PRO_YEARLY_URL || 'https://pay.kiwify.com.br/fJMsLEv';
const KIWIFY_PREMIUM_YEARLY = import.meta.env.VITE_KIWIFY_PREMIUM_YEARLY_URL || 'https://pay.kiwify.com.br/HfxKSXY';

/**
 * Returns the Kiwify checkout URL for a given plan.
 * Appends user email if available.
 */
export function getCheckoutUrl(plan: PlanType, billing: 'monthly' | 'annual' = 'monthly', email?: string): string {
    let url = '';
    if (plan === 'pro') {
        url = billing === 'annual' && KIWIFY_PRO_YEARLY ? KIWIFY_PRO_YEARLY : KIWIFY_PRO_MONTHLY;
    } else if (plan === 'premium') {
        url = billing === 'annual' && KIWIFY_PREMIUM_YEARLY ? KIWIFY_PREMIUM_YEARLY : KIWIFY_PREMIUM_MONTHLY;
    }
    // Append email to Kiwify URL if available
    if (url && email) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}email=${encodeURIComponent(email)}`;
    }
    return url;
}

export const PRICING_CONFIG: Record<PlanType, PlanConfig> = {
    free: {
        id: 'free',
        labelKey: 'plans.free.label',
        badgeKey: 'plans.free.badge',
        visibility: 30,
        scansPerWeek: 10,
        featuresKeys: [
            'plans.free.features.audits',
            'plans.free.features.dashboard',
            'plans.free.features.visibility',
            'plans.free.features.tag_count',
            'plans.free.features.summary_score',
            'plans.free.features.ai_chat',
        ],
        lockedKeys: [
            'plans.free.locked.exports',
            'plans.free.locked.lgpd_details',
            'plans.free.locked.history',
            'plans.free.locked.view_source',
            'plans.free.locked.html_location',
        ],
        pricing: {
            monthly: 0,
            annual: 0,
            savingsPct: 0,
        }
    },
    pro: {
        id: 'pro',
        labelKey: 'plans.pro.label',
        badgeKey: 'plans.pro.badge',
        visibility: 70,
        scansPerWeek: 50,
        checkoutUrl: KIWIFY_PRO_MONTHLY,
        featuresKeys: [
            'plans.pro.features.audits',
            'plans.pro.features.dashboard',
            'plans.pro.features.visibility',
            'plans.pro.features.violation_details',
            'plans.pro.features.exports',
            'plans.pro.features.ai_chat',
            'plans.pro.features.recommendations',
            'plans.pro.features.analysis',
        ],
        lockedKeys: [
            'plans.pro.locked.view_source_html',
            'plans.pro.locked.line_numbers',
            'plans.pro.locked.realtime',
            'plans.pro.locked.deep_scan',
            'plans.pro.locked.excel_export',
            'plans.pro.locked.support_priority',
        ],
        pricing: {
            monthly: 49.90,
            annual: 479.04,
            savingsPct: 20,
        }
    },
    premium: {
        id: 'premium',
        labelKey: 'plans.premium.label',
        badgeKey: 'plans.premium.badge',
        visibility: 100,
        scansPerWeek: 200,
        checkoutUrl: KIWIFY_PREMIUM_MONTHLY,
        featuresKeys: [
            'plans.premium.features.audits',
            'plans.premium.features.visibility',
            'plans.premium.features.all_pro',
            'plans.premium.features.view_source_html',
            'plans.premium.features.line_numbers',
            'plans.premium.features.realtime',
            'plans.premium.features.deep_scan',
            'plans.premium.features.history',
            'plans.premium.features.exports',
            'plans.premium.features.support_priority',
            'plans.premium.features.advanced_recommendations',
            'plans.premium.features.lgpd_analysis',
        ],
        lockedKeys: [],
        pricing: {
            monthly: 149.90,
            annual: 1439.04,
            savingsPct: 20,
        }
    }
};
