import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { AuthRequestError, useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, Shield, Zap, AlertCircle } from 'lucide-react';
import MinimalTopMenu from '@/components/MinimalTopMenu';
import logoIcon from '@/assets/logo/datatrust-logo-icon.png';

type AuthMode = 'login' | 'signup' | 'forgot';

const AuthPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { login, signup, loginWithGoogle } = useAuth();
    const { t } = useI18n();
    const [mode, setMode] = useState<AuthMode>(() => searchParams.get('mode') === 'signup' ? 'signup' : 'login');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [form, setForm] = useState({ name: '', email: '', password: '' });

    const tx = (key: string, vars: Record<string, string> = {}) =>
        Object.entries(vars).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));

    const getAuthErrorMessage = (err: unknown) => {
        if (err instanceof AuthRequestError) {
            // Log full details in development for debugging
            if (import.meta.env.DEV) {
                console.error('[Auth] Error:', { code: err.code, message: err.message, status: err.status });
            }
            switch (err.code) {
                case 'EMAIL_ALREADY_REGISTERED':
                    return t('auth.email_may_exist');
                case 'NAME_REQUIRED':
                    return 'Nome é obrigatório para criar uma conta.';
                case 'PASSWORD_TOO_SHORT':
                    return 'A senha deve ter pelo menos 6 caracteres.';
                case 'VALIDATION_FAILED':
                    return t('auth.check_information');
                case 'CONFIG_ERROR':
                    return 'Não foi possível conectar ao serviço de autenticação. Verifique as configurações.';
                case 'NETWORK_ERROR':
                    return 'Não foi possível conectar ao serviço de autenticação. Verifique sua conexão.';
                case 'PROFILE_ERROR':
                    return 'Login realizado, mas houve um problema ao carregar seu perfil. Tente novamente.';
                case 'LOGIN_FAILED':
                    // Pass through specific messages (e.g. 'Email ou senha inválidos.', 'Confirme seu email...')
                    if (err.message && !err.message.toLowerCase().includes('autentica') && err.message.length > 5)
                        return err.message;
                    return mode === 'signup' ? t('auth.signup_failed') : 'Email ou senha inválidos.';
                default:
                    return mode === 'signup' ? t('auth.signup_failed') : t('auth.authentication_error');
            }
        }
        if (import.meta.env.DEV) console.error('[Auth] Unknown error type:', err);
        return mode === 'signup' ? t('auth.signup_failed') : t('auth.authentication_error');
    };

    const getRedirectTarget = () => {
        const saved = localStorage.getItem('gtm-redirect-after-auth');
        if (saved) {
            localStorage.removeItem('gtm-redirect-after-auth');
            return saved;
        }
        return null;
    };

    const handleGoogleLogin = async () => {
        setError('');
        try {
            await loginWithGoogle();
        } catch (err: unknown) {
            setError(getAuthErrorMessage(err));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (mode === 'login') {
                await login(form.email, form.password);
                navigate(getRedirectTarget() ?? '/');
            } else if (mode === 'signup') {
                if (!form.name.trim()) {
                    setError(t('auth.name_required'));
                    setIsLoading(false);
                    return;
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
                    setError(t('auth.check_information'));
                    setIsLoading(false);
                    return;
                }
                if (form.password.length < 6) {
                    setError(t('auth.check_information'));
                    setIsLoading(false);
                    return;
                }
                await signup(form.email, form.password, form.name);
                navigate(getRedirectTarget() ?? '/pricing');
            } else {
                await new Promise(r => setTimeout(r, 800));
                setSuccess(t('auth.reset_sent'));
            }
        } catch (err: unknown) {
            setError(getAuthErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    };

    const titles: Record<AuthMode, { heading: string; sub: string; cta: string }> = {
        login: {
            heading: t('auth.login_heading'),
            sub: t('auth.login_sub'),
            cta: t('auth.login_cta'),
        },
        signup: {
            heading: t('auth.signup_heading'),
            sub: t('auth.signup_sub'),
            cta: t('auth.signup_cta'),
        },
        forgot: {
            heading: t('auth.forgot_heading'),
            sub: t('auth.forgot_sub'),
            cta: t('auth.forgot_cta'),
        },
    };

    const { heading, sub, cta } = titles[mode];

    return (
        <div className="min-h-screen dt-page flex items-center justify-center px-4 pt-20">
            <MinimalTopMenu />
            {/* Background glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-600/20 blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Logo */}
                <Link to="/" className="flex items-center gap-3 justify-center mb-8 group">
                    <img
                        src={logoIcon}
                        alt="DataTrust Audit"
                        className="h-12 w-12 rounded-xl object-contain shadow-lg group-hover:scale-110 transition-transform"
                    />
                    <div className="text-left">
                        <span className="text-xl font-bold dt-text-primary tracking-tight block">Data<span className="text-blue-500">Trust</span> Audit</span>
                        <span className="text-[9px] dt-text-muted uppercase tracking-[0.2em]">AUDIT • PRIVACY • COMPLIANCE</span>
                    </div>
                </Link>

                {/* Trust chips */}
                <div className="flex items-center justify-center gap-3 mb-6">
                    {[
                        { icon: <Shield className="w-3.5 h-3.5" />, label: t('auth.secure') },
                        { icon: <Zap className="w-3.5 h-3.5" />, label: t('auth.instant_access') },
                    ].map((chip, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs font-medium border border-white/10">
                            {chip.icon} {chip.label}
                        </div>
                    ))}
                </div>

                <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-2xl">
                    <CardHeader className="pb-0 pt-8 px-8">
                        <h1 className="text-2xl font-bold text-white">{heading}</h1>
                        <p className="text-white/50 text-sm mt-1">{sub}</p>
                    </CardHeader>
                    <CardContent className="p-8 pt-6">
                        {error && (
                            <Alert className="mb-5 border-red-500/30 bg-red-500/10">
                                <AlertCircle className="h-4 w-4 text-red-400" />
                                <AlertDescription className="text-red-300 text-sm">{error}</AlertDescription>
                            </Alert>
                        )}
                        {success && (
                            <Alert className="mb-5 border-green-500/30 bg-green-500/10">
                                <AlertDescription className="text-green-300 text-sm">{success}</AlertDescription>
                            </Alert>
                        )}

                        {mode !== 'forgot' && (
                            <>
                                <div className="mb-6">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleGoogleLogin}
                                        className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10 h-12 rounded-xl transition-all flex items-center justify-center gap-3 px-4 shadow-sm active:scale-95"
                                    >
                                        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.28 1.07-3.71 1.07-2.85 0-5.27-1.92-6.13-4.51H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="currentColor" d="M5.87 14.13c-.22-.67-.35-1.39-.35-2.13s.13-1.46.35-2.13V7.03H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.97l3.69-2.84z" />
                                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.03l3.69 2.84c.86-2.59 3.28-4.51 6.13-4.51z" />
                                        </svg>
                                        <span className="text-sm font-medium">Entrar com Google</span>
                                    </Button>
                                </div>

                                <div className="relative mb-6">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t border-white/10"></span>
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-slate-950 px-2 text-slate-500">{t('auth.or_continue_email')}</span>
                                    </div>
                                </div>
                            </>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {mode === 'signup' && (
                                <div className="space-y-1.5">
                                    <Label className="text-white/70 text-sm">{t('auth.full_name')}</Label>
                                    <Input
                                        type="text"
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        placeholder={t('auth.your_name')}
                                        required
                                        className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400"
                                    />
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label className="text-white/70 text-sm">Email</Label>
                                <Input
                                    type="email"
                                    value={form.email}
                                    onChange={e => setForm({ ...form, email: e.target.value })}
                                    placeholder="you@company.com"
                                    required
                                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400"
                                />
                            </div>

                            {mode !== 'forgot' && (
                                <div className="space-y-1.5">
                                    <Label className="text-white/70 text-sm">{t('auth.password')}</Label>
                                    <div className="relative">
                                        <Input
                                            type={showPassword ? 'text' : 'password'}
                                            value={form.password}
                                            onChange={e => setForm({ ...form, password: e.target.value })}
                                            placeholder="••••••••"
                                            required
                                            minLength={6}
                                            className="bg-white/10 border-white/20 text-white placeholder:text-white/30 pr-10 focus:border-blue-400"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {mode === 'login' && (
                                <div className="flex justify-end">
                                    <button type="button" onClick={() => setMode('forgot')} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                                        {t('auth.forgot_password')}
                                    </button>
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-5 shadow-lg shadow-blue-500/25 transition-all"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : cta}
                            </Button>
                        </form>

                        <div className="mt-6 text-center text-sm">
                            {mode === 'login' ? (
                                <span className="text-white/40">
                                    {t('auth.no_account')}{' '}
                                    <button onClick={() => setMode('signup')} className="text-blue-400 hover:text-blue-300 font-medium">
                                        {t('auth.sign_up')}
                                    </button>
                                </span>
                            ) : (
                                <span className="text-white/40">
                                    {t('auth.have_account')}{' '}
                                    <button onClick={() => setMode('login')} className="text-blue-400 hover:text-blue-300 font-medium">
                                        {t('auth.sign_in')}
                                    </button>
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <p className="text-center text-white/30 text-xs mt-6">
                    {t('auth.terms_notice')}
                </p>
            </div>
        </div>
    );
};

export default AuthPage;
