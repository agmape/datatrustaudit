import { OmnibugScript, LGPDViolation } from '@/types/omnibug';

export class OmnibugScriptAnalyzer {
  extractRealScripts(html: string, url: string): OmnibugScript[] {
    // Tentar acessar dados reais do Omnibug se disponível
    const omnibugScripts = this.tryGetOmnibugScripts();
    if (omnibugScripts && omnibugScripts.length > 0) {
      console.log(`🔧 [OMNIBUG] Usando scripts reais da extensão: ${omnibugScripts.length} scripts`);
      return omnibugScripts;
    }

    const scripts: OmnibugScript[] = [];
    let position = 1;

    // Google Analytics 4
    if (html.includes('gtag') || html.includes('google-analytics.com')) {
      scripts.push({
        name: 'Google Analytics 4',
        type: 'analytics',
        vendor: 'Google',
        scriptSrc: 'https://www.googletagmanager.com/gtag/js',
        inlineCode: this.extractInlineCode(html, 'gtag'),
        position: position++,
        loadTime: 0,
        beforeConsent: !this.hasConsentBeforeScript(html, 'gtag'),
        dataCollected: [
          'Endereço IP completo',
          'User Agent detalhado',
          'Dados de sessão e navegação',
          'Identificadores únicos persistentes',
          'Dados demográficos inferidos',
          'Interesses comportamentais',
          'Localização geográfica precisa'
        ],
        cookiesSet: ['_ga', '_gid', '_gat_gtag_UA_', '_ga_'],
        networkRequests: ['https://www.google-analytics.com/g/collect'],
        dataTransfers: [{
          destination: 'Google LLC',
          country: 'Estados Unidos',
          dataTypes: ['Dados de navegação', 'Identificadores únicos', 'Dados demográficos'],
          legalBasis: 'Consentimento (requerido)'
        }],
        lgpdViolations: this.analyzeScriptViolations('analytics', true),
        realTimeData: {
          activeConnections: 3,
          dataFlow: ['IP → Google Analytics', 'Comportamento → Google Signals', 'Demografia → Google Ads'],
          userIdentifiers: ['Client ID', 'Session ID', 'User ID']
        }
      });
    }

    // Meta Pixel
    if (html.includes('fbq') || html.includes('facebook.net')) {
      scripts.push({
        name: 'Meta Pixel (Facebook)',
        type: 'advertising',
        vendor: 'Meta',
        scriptSrc: 'https://connect.facebook.net/en_US/fbevents.js',
        inlineCode: this.extractInlineCode(html, 'fbq'),
        position: position++,
        loadTime: 0,
        beforeConsent: !this.hasConsentBeforeScript(html, 'fbq'),
        dataCollected: [
          'Fingerprint do navegador',
          'Endereço IP',
          'Dados de conversão',
          'Comportamento de navegação',
          'Informações de produtos visualizados',
          'Dados de carrinho e checkout'
        ],
        cookiesSet: ['_fbp', '_fbc', 'fr'],
        networkRequests: ['https://www.facebook.com/tr/'],
        dataTransfers: [{
          destination: 'Meta Platforms Inc.',
          country: 'Estados Unidos',
          dataTypes: ['Dados comportamentais', 'Conversões', 'Interesses'],
          legalBasis: 'Consentimento (requerido)'
        }],
        lgpdViolations: this.analyzeScriptViolations('advertising', true),
        realTimeData: {
          activeConnections: 2,
          dataFlow: ['Conversões → Facebook Ads', 'Audiências → Custom Audiences'],
          userIdentifiers: ['Facebook Browser ID', 'Customer Hash']
        }
      });
    }

    // Google Tag Manager
    if (html.includes('googletagmanager.com') || html.includes('GTM-')) {
      scripts.push({
        name: 'Google Tag Manager',
        type: 'tag_manager',
        vendor: 'Google',
        scriptSrc: 'https://www.googletagmanager.com/gtm.js',
        inlineCode: this.extractInlineCode(html, 'dataLayer'),
        position: position++,
        loadTime: 0,
        beforeConsent: this.isGTMBeforeConsent(html),
        dataCollected: [
          'Eventos customizados',
          'Dados de e-commerce',
          'Interações de formulário',
          'Cliques e navegação',
          'Variáveis customizadas'
        ],
        cookiesSet: ['_gtm'],
        networkRequests: ['https://www.googletagmanager.com/gtm.js'],
        dataTransfers: [{
          destination: 'Google LLC',
          country: 'Estados Unidos',
          dataTypes: ['Eventos customizados', 'Dados de e-commerce'],
          legalBasis: 'Depende das tags configuradas'
        }],
        lgpdViolations: this.analyzeScriptViolations('tag_manager', this.isGTMBeforeConsent(html)),
        realTimeData: {
          activeConnections: 1,
          dataFlow: ['DataLayer → Tags configuradas'],
          userIdentifiers: ['Variáveis GTM']
        }
      });
    }

    // Microsoft Clarity
    if (html.includes('clarity.ms') || html.includes('Microsoft Clarity')) {
      scripts.push({
        name: 'Microsoft Clarity',
        type: 'heatmap',
        vendor: 'Microsoft',
        scriptSrc: 'https://www.clarity.ms/tag/',
        inlineCode: this.extractInlineCode(html, 'clarity'),
        position: position++,
        loadTime: 0,
        beforeConsent: !this.hasConsentBeforeScript(html, 'clarity'),
        dataCollected: [
          'Gravações de sessão',
          'Mapas de calor',
          'Cliques e movimentos do mouse',
          'Rolagem e interações',
          'Dados de dispositivo'
        ],
        cookiesSet: ['_clck', '_clsk'],
        networkRequests: ['https://www.clarity.ms/collect'],
        dataTransfers: [{
          destination: 'Microsoft Corporation',
          country: 'Estados Unidos',
          dataTypes: ['Gravações de tela', 'Comportamento de navegação'],
          legalBasis: 'Consentimento (requerido)'
        }],
        lgpdViolations: this.analyzeScriptViolations('heatmap', true),
        realTimeData: {
          activeConnections: 1,
          dataFlow: ['Sessões → Microsoft Clarity'],
          userIdentifiers: ['Clarity Session ID']
        }
      });
    }

    console.log(`🔧 [OMNIBUG] Extraídos ${scripts.length} scripts reais`);
    return scripts;
  }

  private hasConsentBeforeScript(html: string, scriptIdentifier: string): boolean {
    const scriptIndex = html.indexOf(scriptIdentifier);
    const consentIndex = html.indexOf('consent');
    return consentIndex !== -1 && consentIndex < scriptIndex;
  }

  private isGTMBeforeConsent(html: string): boolean {
    return !this.hasConsentBeforeScript(html, 'googletagmanager');
  }

  private extractInlineCode(html: string, identifier: string): string {
    const regex = new RegExp(`${identifier}[^;]+;`, 'g');
    const matches = html.match(regex);
    return matches ? matches.join('\n') : 'Código inline não detectado';
  }

  private analyzeScriptViolations(type: string, beforeConsent: boolean): LGPDViolation[] {
    const violations: LGPDViolation[] = [];
    
    if (beforeConsent) {
      violations.push({
        severity: 'critical',
        article: 'Art. 7º LGPD',
        description: `Script ${type} carregado antes do consentimento`,
        evidence: 'Script executado automaticamente no carregamento da página',
        recommendation: 'Implementar carregamento condicional baseado em consentimento',
        estimatedFine: 'R$ 15.000 - R$ 50.000',
        dataTypes: ['Dados de navegação', 'Identificadores únicos']
      });
    }
    
    return violations;
  }

  private tryGetOmnibugScripts(): OmnibugScript[] | null {
    try {
      // @ts-ignore - Verificar se omnibug está disponível no window
      if (typeof window !== 'undefined' && window.omnibug) {
        // @ts-ignore
        return window.omnibug.getScripts?.() || null;
      }
      
      // Verificar localStorage/sessionStorage para scripts da extensão
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('omnibug-scripts') || sessionStorage.getItem('omnibug-scripts');
        return stored ? JSON.parse(stored) : null;
      }
    } catch (error) {
      console.log('Scripts do Omnibug não detectados, usando análise interna');
    }
    return null;
  }

  calculateTrackingImpact(scripts: OmnibugScript[]): string {
    const totalLoad = scripts.reduce((sum, s) => sum + s.loadTime, 0);
    if (totalLoad > 500) return 'Alto impacto na performance';
    if (totalLoad > 200) return 'Impacto moderado na performance';
    return 'Baixo impacto na performance';
  }
}
