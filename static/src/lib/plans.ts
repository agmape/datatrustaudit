/** Plan display helpers. Values always come from the API (/api/plans, /api/me); nothing commercial is hardcoded here. */
import type { Entitlements } from '@/context/AuthContext';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formats an integer amount of cents (BRL) as "R$ 97,00". */
export const formatBRL = (cents: number | null | undefined): string => (cents == null ? '—' : BRL.format(cents / 100));

/** Parses "97", "97,00", "97.00" or "1.234,56" into cents; null when invalid. */
export const parseBRLToCents = (v: string): number | null => {
  const s = v.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!s) return null;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
};

export const centsToInput = (cents: number | null | undefined): string =>
  cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');

export type PlanRow = Entitlements;

export interface PlansMatrix {
  config_version: number;
  currency: string;
  billing: { enabled: boolean; cycles_available?: string[]; note?: string };
  plans: PlanRow[];
  features: { id: string; implemented: boolean }[];
  analysis_definition?: string;
  visibility_rule?: string;
  note?: string;
}

export const PLAN_IDS = ['free', 'pro', 'premium'] as const;
export type PlanId = (typeof PLAN_IDS)[number];
