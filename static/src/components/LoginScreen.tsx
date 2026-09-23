import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
    Shield,
    Mail,
    Lock,
    Eye,
    EyeOff,
    ArrowRight,
    Check,
    Zap
} from 'lucide-react';

// SVG icons para os providers OAuth
const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
);

const AppleIcon = () => (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
);

const MicrosoftIcon = () => (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path fill="#F25022" d="M1 1h10v10H1z" />
        <path fill="#00A4EF" d="M1 13h10v10H1z" />
        <path fill="#7FBA00" d="M13 1h10v10H13z" />
        <path fill="#FFB900" d="M13 13h10v10H13z" />
    </svg>
);

interface LoginScreenProps {
    onLogin?: (provider: string, email?: string) => void;
    onClose?: () => void;
}

const LoginScreen = ({ onLogin, onClose }: LoginScreenProps) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [mode, setMode] = useState<'login' | 'register'>('login');

    const handleOAuthLogin = async (provider: string) => {
        setIsLoading(true);
        // Simular OAuth - em produção conectar com backend
        setTimeout(() => {
            setIsLoading(false);
            onLogin?.(provider);
        }, 1500);
    };

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setTimeout(() => {
            setIsLoading(false);
            onLogin?.('email', email);
        }, 1500);
    };

    const features = [
        'Análise LGPD completa',
        'Detecção de 30+ tags',
        'Relatórios profissionais',
        'IA assistente incluída'
    ];

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-4">
            {/* Background pattern */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" viewBox=\"0 0 60 60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"none\" fill-rule=\"evenodd\"%3E%3Cg fill=\"%239C92AC\" fill-opacity=\"0.05\"%3E%3Cpath d=\"M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-30" />

            <div className="relative z-10 w-full max-w-md">
                {/* Logo e Branding */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-2xl shadow-blue-500/30 mb-4">
                        <Shield className="h-10 w-10 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">
                        Tracknology
                    </h1>
                    <p className="text-blue-200/70">
                        Compliance LGPD para seu site
                    </p>
                </div>

                {/* Card de Login */}
                <Card className="border-0 shadow-2xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl">
                    <CardHeader className="text-center pb-4">
                        <CardTitle className="text-xl">
                            {mode === 'login' ? 'Bem-vindo de volta!' : 'Crie sua conta'}
                        </CardTitle>
                        <CardDescription>
                            {mode === 'login'
                                ? 'Entre para continuar sua análise'
                                : 'Comece grátis, upgrade quando quiser'}
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        {/* Botões OAuth */}
                        <div className="grid grid-cols-1 gap-3">
                            <Button
                                variant="outline"
                                className="h-12 relative hover:bg-gray-50 dark:hover:bg-gray-800"
                                onClick={() => handleOAuthLogin('google')}
                                disabled={isLoading}
                            >
                                <GoogleIcon />
                                <span className="ml-3">Continuar com Google</span>
                            </Button>

                            <Button
                                variant="outline"
                                className="h-12 relative bg-black text-white hover:bg-gray-900 border-black"
                                onClick={() => handleOAuthLogin('apple')}
                                disabled={isLoading}
                            >
                                <AppleIcon />
                                <span className="ml-3">Continuar com Apple</span>
                            </Button>

                            <Button
                                variant="outline"
                                className="h-12 relative hover:bg-gray-50 dark:hover:bg-gray-800"
                                onClick={() => handleOAuthLogin('microsoft')}
                                disabled={isLoading}
                            >
                                <MicrosoftIcon />
                                <span className="ml-3">Continuar com Microsoft</span>
                            </Button>
                        </div>

                        {/* Divider */}
                        <div className="relative">
                            <Separator />
                            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 px-3 text-sm text-gray-500">
                                ou
                            </span>
                        </div>

                        {/* Form Email/Senha */}
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="seu@email.com"
                                        className="pl-10 h-12"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Senha</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        className="pl-10 pr-10 h-12"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            {mode === 'login' && (
                                <div className="text-right">
                                    <button type="button" className="text-sm text-blue-600 hover:underline">
                                        Esqueceu a senha?
                                    </button>
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        {mode === 'login' ? 'Entrar' : 'Criar Conta'}
                                        <ArrowRight className="h-4 w-4 ml-2" />
                                    </>
                                )}
                            </Button>
                        </form>

                        {/* Toggle Login/Register */}
                        <div className="text-center text-sm text-gray-600">
                            {mode === 'login' ? (
                                <>
                                    Não tem conta?{' '}
                                    <button
                                        onClick={() => setMode('register')}
                                        className="text-blue-600 font-medium hover:underline"
                                    >
                                        Criar agora
                                    </button>
                                </>
                            ) : (
                                <>
                                    Já tem conta?{' '}
                                    <button
                                        onClick={() => setMode('login')}
                                        className="text-blue-600 font-medium hover:underline"
                                    >
                                        Entrar
                                    </button>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Features Free */}
                <div className="mt-6 p-4 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
                    <div className="flex items-center gap-2 mb-3">
                        <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                            <Zap className="h-3 w-3 mr-1" />
                            FREE
                        </Badge>
                        <span className="text-white/80 text-sm">O que você ganha grátis:</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {features.map((feature, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm text-blue-200/70">
                                <Check className="h-3 w-3 text-green-400" />
                                {feature}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-blue-200/50 mt-6">
                    Ao continuar, você concorda com os{' '}
                    <a href="#" className="underline hover:text-blue-200">Termos de Uso</a>
                    {' '}e{' '}
                    <a href="#" className="underline hover:text-blue-200">Política de Privacidade</a>
                </p>
            </div>
        </div>
    );
};

export default LoginScreen;
