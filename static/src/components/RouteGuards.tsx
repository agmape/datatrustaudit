import { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { rememberNext, useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import AppHeader from '@/components/AppHeader';

const Spinner = () => {
  const { t } = useI18n();
  return <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm dt-text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading')}</div>;
};

/** Requires a verified session. A direct URL (or a page refresh) waits for the session to restore, then either renders
 *  or redirects to /auth remembering where the user wanted to go. */
export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { loading, session, configured } = useAuth();
  const loc = useLocation();
  useEffect(() => { if (!loading && !session) rememberNext(loc.pathname + loc.search); }, [loading, session, loc]);
  if (loading) return <Spinner />;
  if (!session) return <Navigate to={configured ? '/auth' : '/auth?mode=signin'} replace />;
  return <>{children}</>;
};

/** Administrator-only. The check is only for UX: every /api/admin/* route enforces the role on the server. */
export const AdminRoute = ({ children }: { children: ReactNode }) => {
  const { loading, session, me } = useAuth();
  const { t } = useI18n();
  const loc = useLocation();
  useEffect(() => { if (!loading && !session) rememberNext(loc.pathname + loc.search); }, [loading, session, loc]);
  if (loading || (session && !me)) return <Spinner />;
  if (!session) return <Navigate to="/auth" replace />;
  if (!me?.user.is_admin) {
    return (
      <div className="dt-page min-h-screen"><AppHeader />
        <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-red-500/30 bg-red-950/20 p-8 text-center text-red-100" role="alert">
          <ShieldAlert className="h-8 w-8" /><h1 className="text-xl font-bold">403</h1><p>{t('admin.forbidden')}</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};
