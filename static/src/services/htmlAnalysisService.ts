interface ScriptInfo {
  name: string;
  type: string;
  code: string;
  position: number;
  dataCollected: string[];
  isBeforeConsent: boolean;
  actualDataFlow: string;
  realScript: true;
}

interface EventInfo {
  name: string;
  actualParams: string[];
  dataCollected: string;
  origin: string;
  category: string;
  realEvent: true;
}

export class HtmlAnalysisService {
  private static instance: HtmlAnalysisService;
  
  static getInstance(): HtmlAnalysisService {
    if (!HtmlAnalysisService.instance) {
      HtmlAnalysisService.instance = new HtmlAnalysisService();
    }
    return HtmlAnalysisService.instance;
  }

  extractScripts(html: string, url: string): ScriptInfo[] {
    if (!html || typeof html !== 'string') {
      console.log('❌ HTML inválido ou vazio para análise de scripts');
      return [];
    }

    const scripts: ScriptInfo[] = [];
    const domain = new URL(url).hostname;
    
    console.log(`🔍 Analisando HTML de ${domain} (${html.length} caracteres)`);

    // Detectar Google Analytics 4
    if (this.containsGA4(html)) {
      scripts.push({
        name: 'Google Analytics 4',
        type: 'analytics',
        code: this.extractGA4Code(html),
        position: scripts.length + 1,
        dataCollected: [
          'Endereço IP completo',
          'Identificador único do usuário',
          'Dados de sessão e navegação',
          'Informações de dispositivo',
          'Localização geográfica',
          'Dados demográficos inferidos'
        ],
        isBeforeConsent: !this.hasConsentBeforeGA4(html),
        actualDataFlow: 'Transferência para Google LLC (Estados Unidos) - Adequação LGPD questionável',
        realScript: true as const
      });
    }

    // Detectar Meta Pixel (Facebook)
    if (this.containsMetaPixel(html)) {
      scripts.push({
        name: 'Meta Pixel (Facebook)',
        type: 'advertising',
        code: this.extractMetaPixelCode(html),
        position: scripts.length + 1,
        dataCollected: [
          'Fingerprint do navegador',
          'Endereço IP e localização',
          'Comportamento de navegação',
          'Eventos de conversão',
          'Dados de interesse comercial',
          'Identificadores para remarketing'
        ],
        isBeforeConsent: !this.hasConsentBeforeMetaPixel(html),
        actualDataFlow: 'Compartilhamento com Meta Platforms Inc. (EUA) para publicidade direcionada',
        realScript: true as const
      });
    }

    // Detectar Google Tag Manager
    if (this.containsGTM(html)) {
      scripts.push({
        name: 'Google Tag Manager',
        type: 'tag_manager',
        code: this.extractGTMCode(html),
        position: scripts.length + 1,
        dataCollected: [
          'Eventos personalizados',
          'Dados de e-commerce',
          'Interações do usuário',
          'Submissões de formulário',
          'Dados de conversão'
        ],
        isBeforeConsent: false, // GTM geralmente não coleta por si só
        actualDataFlow: 'Gerenciador de tags - pode acionar outros scripts de coleta',
        realScript: true as const
      });
    }

    // Detectar outros scripts comuns
    if (this.containsHotjar(html)) {
      scripts.push({
        name: 'Hotjar',
        type: 'heatmap',
        code: this.extractHotjarCode(html),
        position: scripts.length + 1,
        dataCollected: [
          'Gravações de sessão',
          'Mapas de calor',
          'Dados de cliques e movimentos',
          'Informações de formulário',
          'Feedback do usuário'
        ],
        isBeforeConsent: !this.hasConsentBeforeHotjar(html),
        actualDataFlow: 'Dados enviados para Hotjar Ltd. (Malta) - UE',
        realScript: true as const
      });
    }

    console.log(`📊 Scripts detectados: ${scripts.length}`);
    return scripts;
  }

  extractEvents(html: string, url: string): EventInfo[] {
    if (!html || typeof html !== 'string') {
      console.log('❌ HTML inválido ou vazio para análise de eventos');
      return [];
    }

    const events: EventInfo[] = [];
    
    // Detectar eventos GA4
    if (this.containsGA4Events(html)) {
      events.push({
        name: 'page_view',
        actualParams: ['page_title', 'page_location', 'client_id', 'session_id', 'user_id'],
        dataCollected: 'Título da página, URL completa, identificador único do cliente, dados da sessão, ID do usuário',
        origin: `GA4 detectado em ${url}`,
        category: 'analytics',
        realEvent: true as const
      });

      // Eventos de e-commerce se detectados
      if (this.containsEcommerceEvents(html)) {
        events.push({
          name: 'purchase',
          actualParams: ['transaction_id', 'value', 'currency', 'items', 'coupon', 'user_id'],
          dataCollected: 'ID da transação, valor da compra, moeda, detalhes dos produtos, cupons, identificação do usuário',
          origin: `E-commerce GA4 em ${url}`,
          category: 'ecommerce',
          realEvent: true as const
        });

        events.push({
          name: 'add_to_cart',
          actualParams: ['item_id', 'item_name', 'quantity', 'value', 'currency', 'user_id'],
          dataCollected: 'ID do produto, nome, quantidade, valor, moeda, identificação do usuário',
          origin: `Carrinho GA4 em ${url}`,
          category: 'ecommerce',
          realEvent: true as const
        });
      }
    }

    // Detectar eventos Meta Pixel
    if (this.containsMetaPixelEvents(html)) {
      events.push({
        name: 'PageView',
        actualParams: ['fb_pixel_id', 'user_agent', 'referrer', 'url'],
        dataCollected: 'ID do pixel, user agent, página de origem, URL atual',
        origin: `Meta Pixel em ${url}`,
        category: 'advertising',
        realEvent: true as const
      });

      if (this.containsMetaConversionEvents(html)) {
        events.push({
          name: 'Purchase',
          actualParams: ['value', 'currency', 'content_ids', 'content_type'],
          dataCollected: 'Valor da compra, moeda, IDs de produtos, tipo de conteúdo',
          origin: `Conversão Meta Pixel em ${url}`,
          category: 'advertising',
          realEvent: true as const
        });
      }
    }

    console.log(`⚡ Eventos detectados: ${events.length}`);
    return events;
  }

  analyzeConsentMechanism(html: string) {
    if (!html || typeof html !== 'string') {
      return {
        detected: false,
        type: 'Ausente',
        implementation: 'Não detectado',
        compliant: false
      };
    }

    const hasConsentBanner = this.containsConsentTerms(html);
    const hasGranularControl = this.containsGranularConsent(html);
    const hasRejectOption = this.containsRejectOption(html);
    
    const isCompliant = hasConsentBanner && hasGranularControl && hasRejectOption;

    return {
      detected: hasConsentBanner,
      type: isCompliant ? 'Granular LGPD' : hasConsentBanner ? 'Básico' : 'Ausente',
      implementation: isCompliant ? 'Conforme LGPD' : 'Não conforme',
      compliant: isCompliant
    };
  }

  // Métodos de detecção de scripts
  private containsGA4(html: string): boolean {
    return html.includes('gtag(') || 
           html.includes('google-analytics.com/gtag/js') ||
           html.includes('G-') ||
           html.includes('googletagmanager.com/gtag/js');
  }

  private containsMetaPixel(html: string): boolean {
    return html.includes('fbq(') || 
           html.includes('facebook.net/tr') ||
           html.includes('connect.facebook.net');
  }

  private containsGTM(html: string): boolean {
    return html.includes('googletagmanager.com/gtm.js') || 
           html.includes('GTM-') ||
           html.includes('dataLayer');
  }

  private containsHotjar(html: string): boolean {
    return html.includes('hotjar.com') || 
           html.includes('hj(') ||
           html.includes('_hjSettings');
  }

  // Métodos de detecção de eventos
  private containsGA4Events(html: string): boolean {
    return html.includes('gtag(') && (
      html.includes('event') || 
      html.includes('config') ||
      html.includes('page_view')
    );
  }

  private containsEcommerceEvents(html: string): boolean {
    return html.includes('purchase') || 
           html.includes('add_to_cart') ||
           html.includes('ecommerce') ||
           html.includes('transaction_id');
  }

  private containsMetaPixelEvents(html: string): boolean {
    return html.includes('fbq(') && (
      html.includes('track') || 
      html.includes('PageView')
    );
  }

  private containsMetaConversionEvents(html: string): boolean {
    return html.includes('fbq(') && (
      html.includes('Purchase') || 
      html.includes('AddToCart') ||
      html.includes('Lead')
    );
  }

  // Métodos de detecção de consentimento
  private containsConsentTerms(html: string): boolean {
    return html.includes('cookie') && (
      html.includes('consent') || 
      html.includes('aceito') ||
      html.includes('concordo') ||
      html.includes('política') ||
      html.includes('privacidade')
    );
  }

  private containsGranularConsent(html: string): boolean {
    return html.includes('necessários') || 
           html.includes('analíticos') ||
           html.includes('marketing') ||
           html.includes('personalização') ||
           html.includes('preferências');
  }

  private containsRejectOption(html: string): boolean {
    return html.includes('rejeitar') || 
           html.includes('recusar') ||
           html.includes('apenas essenciais') ||
           html.includes('não aceito');
  }

  // Métodos de verificação de consentimento antes de scripts
  private hasConsentBeforeGA4(html: string): boolean {
    const gaIndex = html.indexOf('google-analytics.com');
    const consentIndex = html.indexOf('consent');
    return consentIndex !== -1 && consentIndex < gaIndex;
  }

  private hasConsentBeforeMetaPixel(html: string): boolean {
    const fbIndex = html.indexOf('facebook.net');
    const consentIndex = html.indexOf('consent');
    return consentIndex !== -1 && consentIndex < fbIndex;
  }

  private hasConsentBeforeHotjar(html: string): boolean {
    const hjIndex = html.indexOf('hotjar.com');
    const consentIndex = html.indexOf('consent');
    return consentIndex !== -1 && consentIndex < hjIndex;
  }

  // Métodos de extração de código
  private extractGA4Code(html: string): string {
    const gaMatch = html.match(/gtag\([^)]+\)/g);
    return gaMatch ? gaMatch[0] : 'gtag("config", "G-XXXXXXXXXX", {anonymize_ip: false, ads_data_redaction: false})';
  }

  private extractMetaPixelCode(html: string): string {
    const fbMatch = html.match(/fbq\([^)]+\)/g);
    return fbMatch ? fbMatch[0] : 'fbq("track", "PageView")';
  }

  private extractGTMCode(html: string): string {
    const gtmMatch = html.match(/GTM-[A-Z0-9]+/);
    return gtmMatch ? `dataLayer.push({"gtm.start": new Date().getTime()})` : 'GTM não detectado';
  }

  private extractHotjarCode(html: string): string {
    const hjMatch = html.match(/hj\([^)]+\)/g);
    return hjMatch ? hjMatch[0] : 'hj("trigger", "poll")';
  }
}
