/**
 * useLocale hook — now backed by LocaleContext for full persistence.
 * This file is kept for backward compatibility of existing imports.
 * New code should use: import { useLocaleContext } from '@/context/LocaleContext'
 */

// Re-export everything from the new unified context
export {
    useLocale,
    useLocaleContext,
    LocaleProvider,
    CONVERSION_RATES,
    CURRENCY_SYMBOL,
    BR_PRICE_OVERRIDES,
    type LocaleInfo,
    type LocaleInfoLegacy,
    type SupportedCurrency,
    type SupportedLanguage,
    type RegionCode,
} from '@/context/LocaleContext';

// Legacy price formatter (kept for Pricing.tsx + Checkout.tsx backward compat)
import { CONVERSION_RATES, BR_PRICE_OVERRIDES, type SupportedCurrency } from '@/context/LocaleContext';

export function localizePrice(usdPrice: number, currencyCode: string, locale: string): string {
    if (usdPrice === 0) return currencyCode === 'BRL' ? 'Grátis' : 'Free';
    const currency = currencyCode as SupportedCurrency;
    // Use market-facing BR overrides for BRL
    if (currency === 'BRL' && BR_PRICE_OVERRIDES[usdPrice]) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency', currency: 'BRL',
            minimumFractionDigits: 0, maximumFractionDigits: 0,
        }).format(BR_PRICE_OVERRIDES[usdPrice]);
    }
    const rate = CONVERSION_RATES[currency] ?? 1;
    const localAmount = Math.round(usdPrice * rate);
    return new Intl.NumberFormat(locale, {
        style: 'currency', currency: currencyCode,
        minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(localAmount);
}

export function buildCheckoutUrl(planId: string): string {
    return `https://link.mercadopago.com.br/DataTrust Auditpro?plan=${planId}`;
}
