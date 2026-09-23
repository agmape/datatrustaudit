import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

/**
 * /auth/callback — handles OAuth redirect from Supabase.
 * Waits for the session to be established, then redirects to /.
 * Shows a loading spinner; never shows a blank screen.
 */
const AuthCallback = () => {
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const processCallback = async () => {
            try {
                // Supabase client automatically picks up the tokens from the URL hash
                const { data, error: sessionError } = await supabase.auth.getSession();

                if (sessionError) {
                    console.error('[AuthCallback] Session error:', sessionError.message);
                    setError(sessionError.message);
                    setTimeout(() => navigate('/auth?error=oauth_failed'), 2000);
                    return;
                }

                if (data.session) {
                    // Success — redirect to saved target or home
                    const saved = localStorage.getItem('gtm-redirect-after-auth');
                    if (saved) {
                        localStorage.removeItem('gtm-redirect-after-auth');
                        navigate(saved);
                    } else {
                        navigate('/');
                    }
                } else {
                    // No session yet — wait for onAuthStateChange to fire
                    const { data: { subscription } } = supabase.auth.onAuthStateChange(
                        (event, session) => {
                            if (session) {
                                subscription.unsubscribe();
                                navigate('/');
                            }
                        }
                    );

                    // Timeout fallback — redirect to login after 10 seconds
                    setTimeout(() => {
                        subscription.unsubscribe();
                        setError('Tempo limite atingido. Tente fazer login novamente.');
                        setTimeout(() => navigate('/auth'), 2000);
                    }, 10_000);
                }
            } catch (err) {
                console.error('[AuthCallback] Unexpected error:', err);
                setError('Erro ao processar login. Tente novamente.');
                setTimeout(() => navigate('/auth'), 2000);
            }
        };

        processCallback();
    }, [navigate]);

    return (
        <div className="min-h-screen bg-[#070b16] flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            {error ? (
                <p className="text-red-400 text-sm text-center max-w-md px-4">{error}</p>
            ) : (
                <p className="text-white/60 text-sm">Processando login...</p>
            )}
        </div>
    );
};

export default AuthCallback;
