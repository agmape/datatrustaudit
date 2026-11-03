import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { ApiError, apiFetch, setAuthFailureHandler } from '@/lib/api';

/** Commercial rules of a plan, as returned by the server (never hardcoded on the client). */
export interface Entitlements {
  plan: string; plan_name: string; price_cents: number | null; currency: string; cycle: string;
  visibility: number; visibility_percent: number; analyses_per_month: number | null; domains_per_period: number | null;
  daily_limit: number | null; seats: number | null; seats_operational: boolean; requires_verified_account: boolean;
  deep_scan: boolean; max_deep_pages: number; history_limit: number | null; audience?: string; config_version?: number;
  gtm_import: boolean; exports_full: boolean; integrations: boolean; comparison: boolean;
}
export type TestPlan = 'admin' | 'free' | 'pro' | 'premium';
export type QuotaState = 'available' | 'exhausted';
export type SubscriptionState = 'active' | 'expired' | 'payment_failed';
/** Administrator's server-side test context (null when acting as the real administrator). */
export interface TestContext {
  selected_plan: string; effective_plan: string; quota_state: QuotaState; subscription_state: SubscriptionState;
  fallback_reason: null | 'expired' | 'payment_failed'; started_at: string;
}
export interface Quota {
  unlimited: boolean; limit: number | null; used: number; remaining: number | null;
  period_start: string; period_end: string; renews_at?: string | null; period_kind?: 'calendar_month' | 'subscription' | string;
  timezone: string; is_test?: boolean; simulated_exhausted?: boolean;
  domains?: { limit: number | null; used: number; list: string[] } | null;
  daily?: { limit: number | null; used: number; renews_at?: string | null } | null;
}
export interface Me {
  user: { id: string; email: string | null; role: string; is_admin: boolean };
  plan: string; entitlements: Entitlements; test_context: TestContext | null; simulated: boolean;
  subscription: string; quota: Quota; billing?: { enabled: boolean };
}

interface AuthCtx {
  configured: boolean;
  loading: boolean;          // session being restored / profile being loaded
  session: Session | null;
  me: Me | null;             // SERVER truth: role, plan, quota. Never derived from the token on the client.
  isAdmin: boolean;
  recovery: boolean;         // arrived through a password-recovery link
  testContext: TestContext | null;   // administrator test context (server-side)
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  /** Administrator only: switch the server-side test context ('admin' leaves it). Throws ApiError on failure. */
  setTestContext: (plan: TestPlan, quotaState?: QuotaState, subscriptionState?: SubscriptionState) => Promise<void>;
  /** Administrator only: delete the test-context usage rows, then reload /api/me. */
  resetTestBalance: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);
const NEXT_KEY = 'dt-next';

export const rememberNext = (path: string) => sessionStorage.setItem(NEXT_KEY, path);
export const takeNext = (): string | null => { const v = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); return v; };

const errKey = (e: any): string => (e?.code || e?.error_code || '').toString() || (e?.status === 429 ? 'over_request_rate_limit' : 'default');

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState<boolean>(supabaseConfigured);
  const [recovery, setRecovery] = useState(false);
  const tokenRef = useRef<string | null>(null);

  const loadMe = useCallback(async () => {
    try { setMe(await apiFetch<Me>('/api/me')); }
    catch (e) {
      // invalid/expired token -> drop the session (never fall back to anonymous or Free silently)
      if (e instanceof ApiError && e.status === 401) { await supabase?.auth.signOut(); setMe(null); }
      else setMe(null);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      tokenRef.current = data.session?.access_token ?? null;
      if (data.session) await loadMe();
      if (alive) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      tokenRef.current = s?.access_token ?? null;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setMe(null);
      // never await Supabase calls inside this callback (deadlock risk); defer
      if (s && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) setTimeout(() => { void loadMe(); }, 0);
    });
    setAuthFailureHandler(() => { void supabase.auth.signOut(); });
    return () => { alive = false; sub.subscription.unsubscribe(); setAuthFailureHandler(null); };
  }, [loadMe]);

  const value = useMemo<AuthCtx>(() => ({
    configured: supabaseConfigured, loading, session, me, isAdmin: !!me?.user.is_admin, recovery, testContext: me?.test_context ?? null,
    signIn: async (email, password) => {
      if (!supabase) return 'not_configured';
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? errKey(error) : null;
    },
    signInWithGoogle: async () => {
      if (!supabase) return 'not_configured';
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } });
      return error ? errKey(error) : null;
    },
    signUp: async (email, password, name) => {
      if (!supabase) return { error: 'not_configured', needsConfirmation: false };
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: name ? { name } : undefined, emailRedirectTo: `${window.location.origin}/auth/callback` } });
      return { error: error ? errKey(error) : null, needsConfirmation: !error && !data.session };
    },
    resetPassword: async (email) => {
      if (!supabase) return 'not_configured';
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?type=recovery` });
      return error ? errKey(error) : null;
    },
    updatePassword: async (password) => {
      if (!supabase) return 'not_configured';
      const { error } = await supabase.auth.updateUser({ password });
      if (!error) setRecovery(false);
      return error ? errKey(error) : null;
    },
    signOut: async () => { await supabase?.auth.signOut(); setMe(null); setSession(null); },
    refreshMe: loadMe,
    setTestContext: async (plan, quotaState = 'available', subscriptionState = 'active') => {
      const r = await apiFetch<Me>('/api/admin/test-context', { json: { plan, quota_state: quotaState, subscription_state: subscriptionState } });
      setMe(r);
    },
    resetTestBalance: async () => {
      await apiFetch('/api/admin/test-context/reset-balance', { method: 'POST' });
      await loadMe();
    },
  }), [loading, session, me, recovery, loadMe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAuth = (): AuthCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
};
