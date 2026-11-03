import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { takeNext, useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

/** Return point of e-mail confirmation and password-recovery links (Supabase PKCE exchange happens in the SDK). */
export default function AuthCallback() {
  const { t } = useI18n();
  const { session, loading, recovery, updatePassword } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isRecovery = recovery || params.get('type') === 'recovery';
  const [timedOut, setTimedOut] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const id = window.setTimeout(() => setTimedOut(true), 8000); return () => window.clearTimeout(id); }, []);
  useEffect(() => { if (!loading && session && !isRecovery) navigate(takeNext() || '/app', { replace: true }); }, [loading, session, isRecovery, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) return setErr(t('auth.validation.password'));
    if (pw !== pw2) return setErr(t('auth.validation.match'));
    setBusy(true);
    const code = await updatePassword(pw);
    setBusy(false);
    if (code) { const k = `auth.supabase.${code}`; const v = t(k); setErr(v === code || v.startsWith('{') ? t('auth.supabase.default') : v); }
    else { setDone(true); window.setTimeout(() => navigate('/app', { replace: true }), 1200); }
  };

  return (
    <div className="dt-page min-h-screen"><AppHeader />
      <main className="mx-auto max-w-md px-4 py-12">
        {isRecovery && session ? (
          <form onSubmit={submit} className="dt-card space-y-4 rounded-2xl border border-white/10 p-6" noValidate>
            <h1 className="text-2xl font-bold dt-text-primary">{t('auth.newPasswordTitle')}</h1>
            <label className="block text-sm"><span className="mb-1 block dt-text-muted">{t('auth.newPassword')}</span>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" className="bg-white/5" /></label>
            <label className="block text-sm"><span className="mb-1 block dt-text-muted">{t('auth.confirmPassword')}</span>
              <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" className="bg-white/5" /></label>
            {err && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-100">{err}</p>}
            {done && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-emerald-100">{t('auth.passwordUpdated')}</p>}
            <Button type="submit" disabled={busy || done} className="w-full bg-blue-600 hover:bg-blue-500">{busy ? t('auth.working') : t('auth.submitNewPassword')}</Button>
          </form>
        ) : timedOut && !session ? (
          <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-950/30 p-6 text-red-100">{t('auth.callbackError')}</p>
        ) : (
          <p className="flex items-center justify-center gap-2 dt-text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" />{t('auth.callbackWorking')}</p>
        )}
      </main>
    </div>
  );
}
