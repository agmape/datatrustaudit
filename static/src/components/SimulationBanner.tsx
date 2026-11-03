import { useState } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { ApiError } from '@/lib/api';

/** Permanent, unmissable indicator while an administrator is in a SERVER-SIDE plan test context. */
export default function TestModeBanner() {
  const { me, setTestContext } = useAuth();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tc = me?.test_context;
  if (!tc || !me?.user.is_admin) return null;
  const ent = me.entitlements;
  const n = ent.analyses_per_month == null ? '∞' : ent.analyses_per_month;
  const selected = t(`plans.${tc.selected_plan}`);
  const text = tc.fallback_reason
    ? t('banner.testFallback', { plan: selected, reason: t(`banner.reasons.${tc.fallback_reason}`), effective: ent.plan_name, percent: ent.visibility_percent, n })
    : t('banner.test', { plan: ent.plan_name, percent: ent.visibility_percent, n });
  const leave = async () => {
    setBusy(true); setErr(null);
    try { await setTestContext('admin'); }
    catch (e) { setErr(e instanceof ApiError ? e.message : t('errors.UNKNOWN')); }
    finally { setBusy(false); }
  };
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-black">
      <FlaskConical className="h-4 w-4" aria-hidden />
      <span>{text}{tc.quota_state === 'exhausted' ? ` · ${t('banner.exhausted')}` : ''}</span>
      <button onClick={() => void leave()} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-black/80 px-3 py-1 text-xs text-white hover:bg-black disabled:opacity-60">
        {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}{t('banner.backToAdmin')}
      </button>
      {err && <span role="alert" className="text-xs text-red-900">{err}</span>}
    </div>
  );
}
