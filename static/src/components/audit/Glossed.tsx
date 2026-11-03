import { Fragment, ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/context/I18nContext';

const TERMS: [RegExp, string][] = [
  [/Google Tag Manager|\bGTM\b/, 'gtm'], [/Google Analytics 4|\bGA4\b/, 'ga4'], [/dataLayer/, 'datalayer'],
  [/\bCMP\b/, 'cmp'], [/Consent Mode/, 'consentmode'], [/\bgcs\b/, 'gcs'], [/\bPixel\b/, 'pixel'],
  [/\bacionadores?\b|\btriggers?\b/i, 'trigger'], [/\bID de medição\b|\bmeasurement ID\b/i, 'measurementid'],
];
const ALL = new RegExp(TERMS.map(([r]) => `(${r.source})`).join('|'), 'g');

export const Term = ({ k, children }: { k: string; children: ReactNode }) => {
  const { t } = useI18n();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2" aria-describedby={undefined}>{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{t(`glossary.${k}`)}</TooltipContent>
    </Tooltip>
  );
};

/** Wraps known technical terms inside server-rendered plain text with a contextual explanation. */
export const Glossed = ({ text }: { text: string }) => {
  if (!text) return null;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(ALL)) {
    const idx = m.index ?? 0;
    const hit = m[0];
    const key = TERMS.find(([r]) => new RegExp(`^(?:${r.source})$`, r.flags.replace('g', '')).test(hit))?.[1];
    if (!key) continue;
    if (idx > last) out.push(<Fragment key={`t${last}`}>{text.slice(last, idx)}</Fragment>);
    out.push(<Term key={`k${idx}`} k={key}>{hit}</Term>);
    last = idx + hit.length;
  }
  if (last < text.length) out.push(<Fragment key={`t${last}`}>{text.slice(last)}</Fragment>);
  return <>{out}</>;
};
