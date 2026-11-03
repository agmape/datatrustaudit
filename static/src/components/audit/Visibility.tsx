import { Link } from 'react-router-dom';
import { EyeOff, Layers } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import type { Visibility, VisibilityListKey } from './types';

/** "Plan visibility" — how much of the DETAIL the plan releases. Deliberately separate from evidence coverage
 *  ("What was examined"): it never changes what the scan observed, only how many records are shown. */
export function VisibilityCard({ v }: { v?: Visibility | null }) {
  const { t } = useI18n();
  if (!v) return null;
  return (
    <section className="dt-card rounded-2xl border border-indigo-500/30 p-4" aria-labelledby="vis-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="vis-title" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-indigo-200">
            <Layers className="h-4 w-4" aria-hidden />{v.label || t('visibility.title')}
          </h3>
          <p className="mt-1 text-2xl font-black text-white">{v.percent}% <span className="text-base font-semibold text-white/60">· {v.plan_name}</span></p>
          <p className="text-sm text-white/80">{t('visibility.details', { released: v.released_details, total: v.total_details })}</p>
        </div>
        {!v.full && <Link to="/configuracoes#planos" className="rounded-lg border border-indigo-400/40 px-3 py-1.5 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/20">{t('visibility.comparePlans')}</Link>}
      </div>
      {v.rule && <p className="mt-2 text-xs text-white/60"><b>{t('visibility.ruleLabel')}:</b> {v.rule}</p>}
      {v.scope_note && <p className="mt-1 text-xs italic text-white/50">{v.scope_note}</p>}
    </section>
  );
}

/** "3 de 10 detalhes disponíveis no Free" next to a protected list. Renders nothing when nothing is hidden. */
export function HiddenNote({ v, list, className = '' }: { v?: Visibility | null; list: VisibilityListKey; className?: string }) {
  const { t } = useI18n();
  const l = v?.lists?.[list];
  if (!v || !l || l.hidden <= 0) return null;
  return (
    <p className={`flex flex-wrap items-center gap-1.5 text-[11px] text-indigo-200 ${className}`}>
      <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{t('visibility.listNote', { released: l.released, total: l.total, plan: v.plan_name })}</span>
      <Link to="/configuracoes#planos" className="underline">{t('visibility.comparePlans')}</Link>
    </p>
  );
}

/** Count label for a tab: "(3)" or "(3/10)" when the plan hides part of the list. */
export const countLabel = (v: Visibility | null | undefined, list: VisibilityListKey, shown: number) => {
  const l = v?.lists?.[list];
  return l && l.hidden > 0 ? `(${shown}/${l.total})` : `(${shown})`;
};
