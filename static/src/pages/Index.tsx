import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import AppHeader from '@/components/AppHeader';
import AuditErrorBoundary from '@/components/AuditErrorBoundary';
import AuditPanel from '@/components/audit/AuditPanel';
import { Eye, FileSearch, ShieldCheck } from 'lucide-react';

const ICONS = [FileSearch, Eye, ShieldCheck];

const Index = () => {
  const { t } = useI18n();
  const [active, setActive] = useState(false);
  const features = [['home.f1t', 'home.f1d'], ['home.f2t', 'home.f2d'], ['home.f3t', 'home.f3d']];
  return (
    <div className="dt-page min-h-screen font-sans">
      <AppHeader />
      {!active && (
        <section className="mx-auto max-w-4xl px-4 pb-6 pt-10 text-center">
          <h1 className="text-4xl font-black leading-tight tracking-tight dt-text-primary md:text-6xl">
            {t('home.title')}<br />
            <span className="bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">{t('home.accent')}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base dt-text-muted md:text-lg">{t('home.sub')}</p>
        </section>
      )}
      <main className="container mx-auto px-4 pb-10">
        <AuditErrorBoundary><AuditPanel onStateChange={setActive} /></AuditErrorBoundary>
      </main>
      {!active && (
        <section className="container mx-auto grid max-w-6xl gap-4 px-4 pb-16 md:grid-cols-3">
          {features.map(([ti, de], i) => { const I = ICONS[i]; return (
            <div key={ti} className="dt-card rounded-2xl border border-white/10 p-5">
              <I className="mb-3 h-6 w-6 text-blue-400" aria-hidden />
              <h2 className="mb-1 font-bold dt-text-primary">{t(ti)}</h2>
              <p className="text-sm dt-text-muted">{t(de)}</p>
            </div>); })}
        </section>
      )}
      <footer className="border-t border-white/5 py-6 text-center text-xs dt-text-muted">
        © {new Date().getFullYear()} DataTrust Audit · {t('home.footer')} · <a className="hover:text-blue-400" href="mailto:datatrustaudit@gmail.com">{t('home.contact')}</a>
      </footer>
    </div>
  );
};

export default Index;
