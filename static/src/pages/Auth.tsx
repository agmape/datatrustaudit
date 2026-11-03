import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { takeNext, useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

type Mode = 'signin' | 'signup' | 'recover';

export default function AuthPage() {
  const { t } = useI18n();
  const { session, loading, configured, signIn, signInWithGoogle, signUp, resetPassword } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = (['signin', 'signup', 'recover'].includes(params.get('mode') || '') ? params.get('mode') : 'signin') as Mode;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => { setError(null); setInfo(null); }, [mode]);
  if (!loading && session) return <Navigate to={takeNext() || '/app'} replace />;

  const msg = (code: string) => t(`auth.supabase.${code}`) !== code && !t(`auth.supabase.${code}`).startsWith('{') ? t(`auth.supabase.${code}`) : t('auth.supabase.default');
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null);
    if (!validEmail) return setError(t('auth.validation.email'));
    if (mode !== 'recover' && password.length < 8) return setError(t('auth.validation.password'));
    if (mode === 'signup' && password !== confirm) return setError(t('auth.validation.match'));
    setBusy(true);
    try {
      if (mode === 'signin') {
        const err = await signIn(email.trim(), password);
        if (err) setError(err === 'not_configured' ? t('auth.notConfigured') : msg(err)); else navigate(takeNext() || '/app', { replace: true });
      } else if (mode === 'signup') {
        const r = await signUp(email.trim(), password, name.trim() || undefined);
        if (r.error) setError(r.error === 'not_configured' ? t('auth.notConfigured') : msg(r.error));
        else if (r.needsConfirmation) setInfo(t('auth.confirmEmail')); else navigate(takeNext() || '/app', { replace: true });
      } else {
        const err = await resetPassword(email.trim());
        if (err && err !== 'over_request_rate_limit' && err !== 'over_email_send_rate_limit') setError(err === 'not_configured' ? t('auth.notConfigured') : msg(err));
        else if (err) setError(msg(err)); else setInfo(t('auth.recoverSent'));   // same message whether or not the e-mail exists
      }
    } finally { setBusy(false); }
  };

  const title = mode === 'signin' ? t('auth.signInTitle') : mode === 'signup' ? t('auth.signUpTitle') : t('auth.recoverTitle');
  const go = (m: Mode) => setParams({ mode: m });
  return (
    <div className="dt-page min-h-screen font-sans">
      <AppHeader />
      <main className="mx-auto max-w-md px-4 py-12">
        <form onSubmit={submit} className="dt-card space-y-4 rounded-2xl border border-white/10 p-6" noValidate>
          <h1 className="text-2xl font-bold dt-text-primary">{title}</h1>
          {!configured && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{t('auth.notConfigured')}</p>}
          {mode !== 'recover' && (<>
            <Button type="button" variant="outline" disabled={busy || !configured} className="w-full gap-2 bg-white text-slate-900 hover:bg-slate-100"
              onClick={async () => { setError(null); setBusy(true); const err = await signInWithGoogle(); if (err) { setBusy(false); setError(err === 'not_configured' ? t('auth.notConfigured') : msg(err)); } }}>
              <svg aria-hidden="true" viewBox="0 0 48 48" className="h-4 w-4"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              {t('auth.google')}
            </Button>
            <p className="text-center text-xs dt-text-muted">{t('auth.orEmail')}</p>
          </>)}
          {mode === 'signup' && (
            <label className="block text-sm"><span className="mb-1 block dt-text-muted">{t('auth.name')}</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="bg-white/5" /></label>
          )}
          <label className="block text-sm"><span className="mb-1 block dt-text-muted">{t('auth.email')}</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className="bg-white/5" aria-invalid={!!error && !validEmail} /></label>
          {mode !== 'recover' && (
            <label className="block text-sm"><span className="mb-1 block dt-text-muted">{t('auth.password')}</span>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required className="bg-white/5" /></label>
          )}
          {mode === 'signup' && (
            <label className="block text-sm"><span className="mb-1 block dt-text-muted">{t('auth.confirmPassword')}</span>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required className="bg-white/5" /></label>
          )}
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}
          {info && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-emerald-100">{info}</p>}
          <Button type="submit" disabled={busy || !configured} className="w-full bg-blue-600 hover:bg-blue-500">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('auth.working')}</> : mode === 'signin' ? t('auth.submitSignIn') : mode === 'signup' ? t('auth.submitSignUp') : t('auth.submitRecover')}
          </Button>
          <div className="space-y-1 text-center text-sm dt-text-muted">
            {mode === 'signin' && <><button type="button" className="underline" onClick={() => go('recover')}>{t('auth.forgot')}</button>
              <p>{t('auth.noAccount')} <button type="button" className="font-semibold text-blue-400 underline" onClick={() => go('signup')}>{t('auth.signUpTitle')}</button></p></>}
            {mode === 'signup' && <p>{t('auth.haveAccount')} <button type="button" className="font-semibold text-blue-400 underline" onClick={() => go('signin')}>{t('auth.signInTitle')}</button></p>}
            {mode === 'recover' && <button type="button" className="underline" onClick={() => go('signin')}>{t('auth.backToSignIn')}</button>}
            <p><Link to="/" className="underline">{t('nav.scan')}</Link></p>
          </div>
        </form>
      </main>
    </div>
  );
}
