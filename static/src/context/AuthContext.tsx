import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase, supabaseConfigValid } from '@/lib/supabase';
import type { Session, User as SupabaseUser, AuthError } from '@supabase/supabase-js';

// ── Public User interface ──────────────────────────────────────────────────
export interface User {
    id: string | number;
    email: string;
    name: string;
    plan: 'free' | 'pro' | 'premium' | string;
    is_admin: boolean;
    subscription_status: string;
    effective_plan: string;
    scans_limit: number;
    scans_used: number;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string, name: string) => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    logout: () => void;
    refreshProfile: () => Promise<void>;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ── Error class ────────────────────────────────────────────────────────────
type AuthErrorCode =
    | 'LOGIN_FAILED'
    | 'SIGNUP_FAILED'
    | 'EMAIL_ALREADY_REGISTERED'
    | 'NAME_REQUIRED'
    | 'PASSWORD_TOO_SHORT'
    | 'VALIDATION_FAILED'
    | 'CONFIG_ERROR'
    | 'NETWORK_ERROR'
    | 'PROFILE_ERROR'
    | 'NON_JSON_RESPONSE';

export class AuthRequestError extends Error {
    code: AuthErrorCode;
    status: number;
    constructor(message: string, code: AuthErrorCode, status: number) {
        super(message);
        this.name = 'AuthRequestError';
        this.code = code;
        this.status = status;
    }
}

// ── Dev Admin Mode — ONLY in development, never in production ──────────────
const _IS_DEV = import.meta.env.DEV && !import.meta.env.PROD;
const _DEV_ADMIN_MODE = _IS_DEV && import.meta.env.VITE_DEV_ADMIN_MODE === 'true';
const _DEV_ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || 'datatrustaudit@gmail.com').toLowerCase();
const _DEV_ADMIN_PASS = import.meta.env.VITE_DEV_ADMIN_PASSWORD || '';

// Static admin passwords to try (from env or well-known dev values)
const _DEV_ADMIN_PASSWORDS = [
    _DEV_ADMIN_PASS,
    import.meta.env.VITE_DEV_PASSWORD || '',
].filter(Boolean);

if (_DEV_ADMIN_MODE && _IS_DEV) {
    console.info(
        '[DEV] DEV_ADMIN_MODE active.',
        'Admin email:', _DEV_ADMIN_EMAIL,
        '| This bypass is IMPOSSIBLE in production (import.meta.env.PROD === true).'
    );
}

// ── Synthetic dev admin user object (never sent to Supabase or DB) ─────────
function buildDevAdminUser(): User {
    return {
        id: 'dev-admin-0',
        email: _DEV_ADMIN_EMAIL,
        name: 'Dev Admin',
        plan: 'premium',
        is_admin: true,
        subscription_status: 'active',
        effective_plan: 'admin',
        scans_limit: -1,
        scans_used: 0,
    };
}

const DEV_ADMIN_TOKEN_KEY = '__dev_admin_token__';

function setDevAdminSession() {
    // Store a flag so the session survives page refresh
    sessionStorage.setItem(DEV_ADMIN_TOKEN_KEY, '1');
}

function clearDevAdminSession() {
    sessionStorage.removeItem(DEV_ADMIN_TOKEN_KEY);
}

function hasDevAdminSession(): boolean {
    return _DEV_ADMIN_MODE && sessionStorage.getItem(DEV_ADMIN_TOKEN_KEY) === '1';
}

// ── Admin email from env ───────────────────────────────────────────────────
const ADMIN_EMAIL = _DEV_ADMIN_EMAIL;

// ── Profile helpers ────────────────────────────────────────────────────────
interface Profile {
    id: string;
    email: string;
    full_name: string | null;
    plan: string;
    subscription_status: string;
    is_admin: boolean;
}

async function loadProfile(userId: string): Promise<Profile | null> {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, email, full_name, plan, subscription_status, is_admin')
            .eq('id', userId)
            .single();

        if (error) {
            if (import.meta.env.DEV) {
                console.warn('[Auth] PROFILE_ERROR — profile fetch failed:', error.code, error.message);
            }
            return null;
        }
        return data as Profile;
    } catch (err) {
        if (import.meta.env.DEV) console.warn('[Auth] PROFILE_ERROR — exception:', err);
        return null;
    }
}

async function ensureProfile(sbUser: SupabaseUser, fullName?: string): Promise<void> {
    try {
        const email = sbUser.email ?? '';
        const name = fullName
            || sbUser.user_metadata?.full_name
            || sbUser.user_metadata?.name
            || email.split('@')[0];

        // Client-side code must never grant plan/admin entitlements. Those fields
        // are controlled by trusted backend/database processes only.
        const { error } = await supabase.from('profiles').upsert(
            {
                id: sbUser.id,
                email,
                full_name: name,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
        );

        if (error && import.meta.env.DEV) {
            console.warn('[Auth] PROFILE_ERROR — upsert failed:', error.code, error.message);
        }
    } catch (err) {
        if (import.meta.env.DEV) console.warn('[Auth] PROFILE_ERROR — ensureProfile exception:', err);
    }
}

function buildUser(sbUser: SupabaseUser, profile: Profile | null): User {
    const email = sbUser.email ?? '';
    // Never infer privileges from an email address in the browser.
    const isAdmin = profile?.is_admin === true;
    const plan = profile?.plan || 'free';

    return {
        id: sbUser.id,
        email,
        name: profile?.full_name || sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || '',
        plan,
        is_admin: isAdmin,
        subscription_status: profile?.subscription_status || 'inactive',
        effective_plan: isAdmin ? 'admin' : plan,
        scans_limit: isAdmin ? -1 : ({ free: 10, pro: 50, premium: 200 }[plan] ?? 10),
        scans_used: 0,
    };
}

async function syncWithBackend(accessToken: string): Promise<Partial<User> | null> {
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('application/json')) {
                return await res.json();
            }
        }
    } catch (err) {
        if (import.meta.env.DEV) console.warn('[Auth] API_ERROR — backend sync failed:', err);
    }
    return null;
}

// ── Dev admin backend login (POST /api/auth/token with form-data) ──────────
async function devAdminBackendLogin(email: string, password: string): Promise<string | null> {
    try {
        const body = new URLSearchParams({ username: email, password });
        const res = await fetch('/api/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
            const data = await res.json();
            return data.access_token || null;
        }
    } catch {
        // Backend may not be running
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // ── Load user from Supabase session ───────────────────────────────────
    const handleSession = useCallback(async (session: Session | null) => {
        if (!session?.user) {
            // Check if dev admin session is still alive
            if (hasDevAdminSession()) {
                setUser(buildDevAdminUser());
                setToken('dev-admin-token');
                setIsLoading(false);
                return;
            }
            setUser(null);
            setToken(null);
            setIsLoading(false);
            return;
        }

        const sbUser = session.user;
        const accessToken = session.access_token;
        setToken(accessToken);

        let profile = await loadProfile(sbUser.id);
        if (!profile) {
            await ensureProfile(sbUser);
            profile = await loadProfile(sbUser.id);
        }

        let appUser = buildUser(sbUser, profile);

        const backendData = await syncWithBackend(accessToken);
        if (backendData) {
            appUser = {
                ...appUser,
                scans_used: backendData.scans_used ?? appUser.scans_used,
                scans_limit: backendData.scans_limit ?? appUser.scans_limit,
                is_admin: backendData.is_admin ?? appUser.is_admin,
                plan: backendData.plan ?? appUser.plan,
                effective_plan: backendData.effective_plan ?? appUser.effective_plan,
                subscription_status: backendData.subscription_status ?? appUser.subscription_status,
            };
        }

        setUser(appUser);
        setIsLoading(false);
    }, []);

    // ── Initialize ─────────────────────────────────────────────────────────
    useEffect(() => {
        // Restore dev admin session if it existed before page refresh
        if (hasDevAdminSession()) {
            setUser(buildDevAdminUser());
            setToken('dev-admin-token');
            setIsLoading(false);
            return;
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
            handleSession(session);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => { handleSession(session); }
        );

        return () => subscription.unsubscribe();
    }, [handleSession]);

    // ── Login with email/password ──────────────────────────────────────────
    const login = async (email: string, password: string) => {
        setIsLoading(true);

        // ── DEV_ADMIN_MODE path (development only, impossible in production) ──
        if (_DEV_ADMIN_MODE && email.toLowerCase() === _DEV_ADMIN_EMAIL) {
            // Try to authenticate against the backend first
            const backendToken = await devAdminBackendLogin(email, password);
            if (backendToken) {
                setDevAdminSession();
                const adminUser = buildDevAdminUser();
                // Try to get real backend profile
                const backendData = await syncWithBackend(backendToken);
                const finalUser: User = backendData ? {
                    ...adminUser,
                    ...backendData,
                    is_admin: true,
                    effective_plan: 'admin',
                } : adminUser;
                setUser(finalUser);
                setToken(backendToken);
                setIsLoading(false);
                return;
            }
            // If backend auth also fails (backend not running), still grant dev access
            if (import.meta.env.DEV) {
                console.warn(
                    '[DEV] DEV_ADMIN_MODE: backend token failed, granting dev admin access anyway.',
                    'Start the backend for full functionality.'
                );
            }
            setDevAdminSession();
            setUser(buildDevAdminUser());
            setToken('dev-admin-token');
            setIsLoading(false);
            return;
        }

        // ── Normal Supabase path ──────────────────────────────────────────
        if (!supabaseConfigValid) {
            setIsLoading(false);
            throw new AuthRequestError(
                'Não foi possível conectar ao serviço de autenticação. Verifique as configurações do Supabase.',
                'CONFIG_ERROR',
                503
            );
        }

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                if (import.meta.env.DEV) {
                    console.error('[Auth] LOGIN_FAILED:', {
                        name: error.name,
                        message: error.message,
                        status: error.status,
                        code: (error as any).code,
                    });
                }
                setIsLoading(false);
                throw mapSupabaseError(error, 'LOGIN_FAILED');
            }
        } catch (err) {
            setIsLoading(false);
            if (err instanceof AuthRequestError) throw err;
            const isNetwork = err instanceof TypeError && String(err.message).includes('fetch');
            throw new AuthRequestError(
                isNetwork
                    ? 'Não foi possível conectar ao serviço de autenticação. Verifique sua conexão.'
                    : 'Erro ao tentar entrar. Tente novamente.',
                isNetwork ? 'NETWORK_ERROR' : 'LOGIN_FAILED',
                503
            );
        }
    };

    // ── Signup ─────────────────────────────────────────────────────────────
    const signup = async (email: string, password: string, name: string) => {
        if (!supabaseConfigValid) {
            throw new AuthRequestError(
                'Não foi possível conectar ao serviço de autenticação. Verifique as configurações do Supabase.',
                'CONFIG_ERROR',
                503
            );
        }
        setIsLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { full_name: name } },
            });
            if (error) {
                if (import.meta.env.DEV) {
                    console.error('[Auth] SIGNUP_FAILED:', {
                        name: error.name,
                        message: error.message,
                        status: error.status,
                        code: (error as any).code,
                    });
                }
                setIsLoading(false);
                throw mapSupabaseError(error, 'SIGNUP_FAILED');
            }
            if (data.user) {
                await ensureProfile(data.user, name);
            }
        } catch (err) {
            setIsLoading(false);
            if (err instanceof AuthRequestError) throw err;
            throw new AuthRequestError('Não foi possível criar sua conta. Tente novamente.', 'SIGNUP_FAILED', 500);
        }
    };

    // ── Google OAuth ───────────────────────────────────────────────────────
    const loginWithGoogle = async () => {
        if (!supabaseConfigValid) {
            throw new AuthRequestError(
                'O login com Google não está disponível. Verifique as configurações do Supabase.',
                'CONFIG_ERROR',
                503
            );
        }
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) {
            if (import.meta.env.DEV) {
                console.error('[Auth] GOOGLE_OAUTH_FAILED:', {
                    name: error.name,
                    message: error.message,
                    status: error.status,
                });
            }
            throw mapSupabaseError(error, 'LOGIN_FAILED');
        }
    };

    // ── Logout ─────────────────────────────────────────────────────────────
    const logout = async () => {
        clearDevAdminSession();
        await supabase.auth.signOut();
        setUser(null);
        setToken(null);
        localStorage.removeItem('gtm-audit-token');
        localStorage.removeItem('gtm-audit-plan');
    };

    // ── Refresh profile ────────────────────────────────────────────────────
    const refreshProfile = async () => {
        if (hasDevAdminSession()) {
            setUser(buildDevAdminUser());
            return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (session) await handleSession(session);
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            isLoading,
            login,
            signup,
            loginWithGoogle,
            logout,
            refreshProfile,
            isAuthenticated: !!user,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

// ── Hook ───────────────────────────────────────────────────────────────────
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};

// ── Map Supabase errors → AuthRequestError ─────────────────────────────────
function mapSupabaseError(error: AuthError, fallbackCode: AuthErrorCode): AuthRequestError {
    const msg = error.message || '';
    const lower = msg.toLowerCase();
    const code = (error as any).code || '';

    // Email already registered
    if (lower.includes('already registered') || lower.includes('already been registered') || code === 'user_already_exists') {
        return new AuthRequestError(msg, 'EMAIL_ALREADY_REGISTERED', 409);
    }
    // Wrong credentials
    if (lower.includes('invalid login') || lower.includes('invalid email or password') || code === 'invalid_credentials') {
        return new AuthRequestError('Email ou senha inválidos.', 'LOGIN_FAILED', 401);
    }
    // Email not confirmed
    if (lower.includes('email not confirmed') || code === 'email_not_confirmed') {
        return new AuthRequestError('Confirme seu email antes de entrar. Verifique sua caixa de entrada.', 'LOGIN_FAILED', 403);
    }
    // Password too short
    if (lower.includes('password') && lower.includes('short')) {
        return new AuthRequestError(msg, 'PASSWORD_TOO_SHORT', 422);
    }
    // Network / fetch errors
    if (lower.includes('fetch') || lower.includes('network') || lower.includes('connect')) {
        return new AuthRequestError('Não foi possível conectar ao serviço de autenticação.', 'NETWORK_ERROR', 503);
    }

    return new AuthRequestError(msg || 'Erro de autenticação. Tente novamente.', fallbackCode, error.status || 400);
}

export default AuthProvider;
