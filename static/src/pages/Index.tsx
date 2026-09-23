import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import AppHeader from '@/components/AppHeader';
import AuditContainer from '@/components/AuditContainer';
import AuditErrorBoundary from '@/components/AuditErrorBoundary';
import { Shield, Search, Activity, CheckCircle2 } from 'lucide-react';
import logoIcon from '@/assets/logo/datatrust-logo-icon.png';


const Index = () => {
  const { t, language } = useI18n();
  const [isAuditActive, setIsAuditActive] = useState(false);

  // ── Hero copy — exact text from product owner ──
  const heroTitle = language === 'pt-BR'
    ? 'Pare de perder dados por'
    : language === 'es'
      ? 'Deja de perder datos por'
      : 'Stop losing data from';

  const heroAccent = language === 'pt-BR'
    ? 'tags quebradas'
    : language === 'es'
      ? 'tags rotas'
      : 'broken tags';

  const heroSubtitle = language === 'pt-BR'
    ? 'Descubra erros invisíveis em tags, eventos, parâmetros, cookies e conformidade LGPD/GDPR. Audite o que seu site coleta antes e depois do consentimento do visitante.'
    : language === 'es'
      ? 'Descubra errores invisibles en tags, eventos, parámetros, cookies y conformidad LGPD/GDPR. Audite lo que su sitio recopila antes y después del consentimiento.'
      : 'Discover invisible errors in tags, events, parameters, cookies and LGPD/GDPR compliance. Audit what your site collects before and after visitor consent.';

  const heroSecondary = language === 'pt-BR'
    ? 'Pare de perder dados e tomar decisões com informações incorretas. Detecte erros de GTM, GA4, pixels, eventos, parâmetros, cookies e Consent Mode antes que eles afetem seu negócio.'
    : language === 'es'
      ? 'Deje de perder datos y tomar decisiones con información incorrecta. Detecte errores de GTM, GA4, píxeles, eventos, parámetros, cookies y Consent Mode antes de que afecten su negocio.'
      : 'Stop losing data and making decisions based on incorrect information. Detect GTM, GA4, pixel, event, parameter, cookie and Consent Mode errors before they impact your business.';

  return (
    <div className="dt-page font-sans">
      <AppHeader />
      
      {!isAuditActive && (
        <section className="pt-10 pb-4 px-4 text-center max-w-5xl mx-auto relative overflow-hidden">
          {/* Background Glows */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none overflow-hidden">
            <div className="absolute -top-24 left-1/4 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full" />
            <div className="absolute top-24 right-1/4 w-96 h-96 bg-indigo-600/8 blur-[120px] rounded-full" />
          </div>


          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight dt-text-primary mb-5 leading-[1.1] relative z-10">
            {heroTitle} <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-600 to-indigo-600 drop-shadow-sm">
              {heroAccent}
            </span>.
          </h1>
          
          <p className="text-lg md:text-xl dt-text-muted mb-4 max-w-3xl mx-auto font-light leading-relaxed relative z-10">
            {heroSubtitle}
          </p>

          <p className="text-sm dt-text-muted mb-8 max-w-2xl mx-auto leading-relaxed relative z-10 opacity-70">
            {heroSecondary}
          </p>
          
          <div className="flex flex-wrap gap-3 justify-center items-center mb-4 relative z-10">
            <span className="flex items-center gap-2 text-xs sm:text-sm dt-text-secondary font-medium bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> {t('home.perk_no_card')}
            </span>
            <span className="flex items-center gap-2 text-xs sm:text-sm dt-text-secondary font-medium bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> {t('home.perk_fast_report')}
            </span>
            <span className="flex items-center gap-2 text-xs sm:text-sm dt-text-secondary font-medium bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> {t('home.perk_active_checks')}
            </span>
          </div>
        </section>
      )}

      {/* SCAN SECTION */}
      <main className="container mx-auto px-4 pb-8 relative z-10">
        <AuditErrorBoundary>
          <AuditContainer onStateChange={setIsAuditActive} />
        </AuditErrorBoundary>
      </main>

      {!isAuditActive && (
        <section className="py-16 border-t border-white/5" style={{ background: 'var(--dt-page-bg)' }}>
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold dt-text-primary mb-3">
                {t('home.features_title')}
              </h2>
              <p className="text-base dt-text-muted max-w-2xl mx-auto">
                {t('home.features_subtitle')}
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              {/* Feature 1 */}
              <div className="dt-card p-6 hover:border-blue-500/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] transition-all group">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Activity className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold dt-text-primary mb-2">{t('home.feature1_title')}</h3>
                <p className="text-sm dt-text-muted leading-relaxed">{t('home.feature1_desc')}</p>
              </div>

              {/* Feature 2 */}
              <div className="dt-card p-6 hover:border-indigo-500/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] transition-all group">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold dt-text-primary mb-2">{t('home.feature2_title')}</h3>
                <p className="text-sm dt-text-muted leading-relaxed">{t('home.feature2_desc')}</p>
              </div>

              {/* Feature 3 */}
              <div className="dt-card p-6 hover:border-emerald-500/50 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] transition-all group">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Search className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold dt-text-primary mb-2">{t('home.feature3_title')}</h3>
                <p className="text-sm dt-text-muted leading-relaxed">{t('home.feature3_desc')}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t" style={{ borderColor: 'var(--dt-card-border)', background: 'var(--dt-page-bg)' }}>
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-lg px-3 py-1.5 flex items-center justify-center shadow-sm">
                <img
                  src={logoIcon}
                  alt="DataTrust Audit"
                  className="h-7 w-auto object-contain"
                  draggable={false}
                />
              </div>
              <p className="text-xs dt-text-muted uppercase tracking-[0.15em]">
                AUDIT • PRIVACY • COMPLIANCE • GOVERNANCE
              </p>
            </div>

            <div className="flex items-center gap-8 text-sm font-medium dt-text-muted">
              <a href="mailto:datatrustaudit@gmail.com" className="hover:text-blue-400 transition-colors">{t('nav.support')}</a>
            </div>
            <p className="text-xs dt-text-muted">
              © {new Date().getFullYear()} DataTrust Audit. {language === 'pt-BR' ? 'Todos os direitos reservados.' : language === 'es' ? 'Todos los derechos reservados.' : 'All rights reserved.'}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
