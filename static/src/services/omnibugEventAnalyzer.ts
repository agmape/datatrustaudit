import { OmnibugEvent, LGPDViolation } from '@/types/omnibug';

export class OmnibugEventAnalyzer {
  extractRealEvents(html: string, url: string): OmnibugEvent[] {
    // Tentar acessar dados reais do Omnibug se disponível
    const omnibugData = this.tryGetOmnibugData();
    if (omnibugData && omnibugData.length > 0) {
      console.log(`📊 [OMNIBUG] Usando dados reais da extensão: ${omnibugData.length} eventos`);
      return omnibugData;
    }

    const events: OmnibugEvent[] = [];
    
    // Análise real do HTML - sem dados falsos
    const gtagMatches = html.match(/gtag\s*\(\s*['"]event['"],\s*['"]([^'"]+)['"],\s*({[^}]+})/g) || [];
    
    gtagMatches.forEach((match, index) => {
      const eventMatch = match.match(/gtag\s*\(\s*['"]event['"],\s*['"]([^'"]+)['"],\s*({[^}]+})/);
      if (eventMatch) {
        const eventName = eventMatch[1];
        let parameters = {};
        
        try {
          parameters = JSON.parse(eventMatch[2].replace(/'/g, '"'));
        } catch {
          parameters = this.parseParameters(eventMatch[2]);
        }

        const requiredParams = this.getRequiredParams(eventName);
        const missingParams = requiredParams.filter(param => !(param in parameters));
        const malformedParams = this.detectMalformedParams(parameters);

        events.push({
          name: eventName,
          eventType: this.categorizeEventType(eventName),
          timestamp: new Date().toISOString(),
          parameters,
          requiredParams,
          missingParams,
          malformedParams,
          beforeConsent: !this.hasConsentBeforeEvent(html, match),
          ga4PropertyId: this.extractGA4PropertyId(html),
          category: this.categorizeEvent(eventName),
          pixelType: 'GA4',
          networkRequest: {
            url: 'https://www.google-analytics.com/g/collect',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            payload: parameters
          },
          dataLayerState: this.getDataLayerAtEvent(html, index),
          violations: this.analyzeEventViolations(eventName, parameters, true)
        });
      }
    });

    // Detectar eventos Meta Pixel
    const fbqMatches = html.match(/fbq\s*\(\s*['"]track['"],\s*['"]([^'"]+)['"](?:,\s*({[^}]+}))?\)/g) || [];
    
    fbqMatches.forEach((match) => {
      const fbMatch = match.match(/fbq\s*\(\s*['"]track['"],\s*['"]([^'"]+)['"](?:,\s*({[^}]+}))?/);
      if (fbMatch) {
        const eventName = fbMatch[1];
        let parameters = {};
        
        if (fbMatch[2]) {
          try {
            parameters = JSON.parse(fbMatch[2].replace(/'/g, '"'));
          } catch {
            parameters = this.parseParameters(fbMatch[2]);
          }
        }

        events.push({
          name: eventName,
          eventType: 'custom',
          timestamp: new Date().toISOString(),
          parameters,
          requiredParams: [],
          missingParams: [],
          malformedParams: [],
          beforeConsent: !this.hasConsentBeforeEvent(html, match),
          ga4PropertyId: '',
          category: 'advertising',
          pixelType: 'Meta',
          networkRequest: {
            url: 'https://www.facebook.com/tr',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            payload: parameters
          },
          dataLayerState: [],
          violations: this.analyzeEventViolations(eventName, parameters, true)
        });
      }
    });

    // Adicionar page_view automático se GA4 detectado
    if (html.includes('gtag') && html.includes('config')) {
      events.unshift({
        name: 'page_view',
        eventType: 'pageview',
        timestamp: new Date().toISOString(),
        parameters: {
          page_title: this.extractPageTitle(html),
          page_location: url,
          page_referrer: (typeof document !== 'undefined' && document.referrer) || '(direct)'
        },
        requiredParams: ['page_title', 'page_location'],
        missingParams: [],
        malformedParams: [],
        beforeConsent: true,
        ga4PropertyId: this.extractGA4PropertyId(html),
        category: 'analytics',
        pixelType: 'GA4',
        networkRequest: {
          url: 'https://www.google-analytics.com/g/collect',
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          payload: { event: 'page_view' }
        },
        dataLayerState: this.extractDataLayer(html),
        violations: this.analyzeEventViolations('page_view', {}, true)
      });
    }

    console.log(`📊 [OMNIBUG] Extraídos ${events.length} eventos reais`);
    return events;
  }

  private tryGetOmnibugData(): OmnibugEvent[] | null {
    // Tentar acessar dados da extensão Omnibug se disponível
    try {
      // @ts-ignore - Verificar se omnibug está disponível no window
      if (typeof window !== 'undefined' && window.omnibug) {
        // @ts-ignore
        return window.omnibug.getEvents?.() || null;
      }
      
      // Verificar localStorage/sessionStorage para dados da extensão
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('omnibug-events') || sessionStorage.getItem('omnibug-events');
        return stored ? JSON.parse(stored) : null;
      }
    } catch (error) {
      console.log('Omnibug não detectado, usando análise interna');
    }
    return null;
  }

  private extractGA4PropertyId(html: string): string {
    const gaMatch = html.match(/G-[A-Z0-9]{10}/);
    return gaMatch ? gaMatch[0] : '';
  }

  private getRequiredParams(eventName: string): string[] {
    const paramMap: Record<string, string[]> = {
      'purchase': ['transaction_id', 'value', 'currency'],
      'add_to_cart': ['currency', 'value'],
      'view_item': ['currency', 'value'],
      'begin_checkout': ['currency', 'value'],
      'add_payment_info': ['currency', 'value'],
      'add_shipping_info': ['currency', 'value'],
      'view_item_list': ['item_list_id', 'item_list_name']
    };
    return paramMap[eventName] || [];
  }

  private detectMalformedParams(params: Record<string, any>): string[] {
    const malformed: string[] = [];
    
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        malformed.push(`${key}: undefined/null`);
      }
      if (key === 'value' && (isNaN(Number(value)) || Number(value) < 0)) {
        malformed.push(`${key}: valor inválido`);
      }
      if (key === 'currency' && typeof value === 'string' && value.length !== 3) {
        malformed.push(`${key}: código de moeda inválido`);
      }
    });
    
    return malformed;
  }

  private analyzeEventViolations(eventName: string, params: Record<string, any>, beforeConsent: boolean): LGPDViolation[] {
    const violations: LGPDViolation[] = [];
    
    if (beforeConsent) {
      violations.push({
        severity: 'critical',
        article: 'Art. 7º LGPD',
        description: `Evento '${eventName}' disparado antes do consentimento`,
        evidence: `Evento capturado sem base legal adequada`,
        recommendation: 'Implementar consentimento granular antes do disparo',
        estimatedFine: 'R$ 10.000 - R$ 50.000',
        dataTypes: ['Dados comportamentais', 'Identificadores únicos']
      });
    }
    
    if (params.user_id || params.client_id) {
      violations.push({
        severity: 'high',
        article: 'Art. 5º, I LGPD',
        description: 'Identificadores pessoais persistentes detectados',
        evidence: `Parâmetros: ${Object.keys(params).filter(k => k.includes('id')).join(', ')}`,
        recommendation: 'Implementar anonimização de identificadores',
        estimatedFine: 'R$ 5.000 - R$ 25.000',
        dataTypes: ['Identificadores únicos']
      });
    }
    
    return violations;
  }

  private categorizeEventType(eventName: string): 'pageview' | 'event' | 'ecommerce' | 'custom' {
    if (eventName === 'page_view') return 'pageview';
    if (['purchase', 'add_to_cart', 'view_item', 'begin_checkout'].includes(eventName)) return 'ecommerce';
    return 'event';
  }

  private categorizeEvent(eventName: string): 'analytics' | 'ecommerce' | 'advertising' | 'custom' {
    if (['purchase', 'add_to_cart', 'view_item'].includes(eventName)) return 'ecommerce';
    if (['page_view', 'scroll', 'click'].includes(eventName)) return 'analytics';
    return 'custom';
  }

  private parseParameters(paramStr: string): Record<string, any> {
    try {
      return JSON.parse(paramStr.replace(/'/g, '"'));
    } catch {
      return {};
    }
  }

  private hasConsentBeforeEvent(html: string, eventCode: string): boolean {
    const eventIndex = html.indexOf(eventCode);
    const consentIndex = html.indexOf('consent');
    return consentIndex !== -1 && consentIndex < eventIndex;
  }

  private extractPageTitle(html: string): string {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1] : 'Título não detectado';
  }

  private getDataLayerAtEvent(html: string, eventIndex: number): any[] {
    return this.extractDataLayer(html);
  }

  private extractDataLayer(html: string): any[] {
    const dataLayerMatches = html.match(/dataLayer\s*=\s*(\[[^\]]*\])/);
    if (dataLayerMatches) {
      try {
        return JSON.parse(dataLayerMatches[1]);
      } catch {
        return [{ error: 'DataLayer malformado' }];
      }
    }
    return [];
  }
}
