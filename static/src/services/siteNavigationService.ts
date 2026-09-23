export interface NavigationPage {
  url: string;
  name: string;
  type: 'home' | 'category' | 'product' | 'cart' | 'checkout' | 'institutional';
  visited: boolean;
  events: CapturedEvent[];
  scripts: CapturedScript[];
}

export interface CapturedEvent {
  name: string;
  params: Record<string, any>;
  timestamp: string;
  beforeConsent: boolean;
  ga4PropertyId?: string;
  category: 'analytics' | 'ecommerce' | 'custom';
}

export interface CapturedScript {
  name: string;
  type: string;
  code: string;
  beforeConsent: boolean;
  timestamp: string;
  dataCollected: string[];
}

export class SiteNavigationService {
  private static instance: SiteNavigationService;
  private baseUrl: string = '';
  private pages: NavigationPage[] = [];
  private currentPage: number = 0;
  private ga4PropertyId: string = '';

  static getInstance(): SiteNavigationService {
    if (!SiteNavigationService.instance) {
      SiteNavigationService.instance = new SiteNavigationService();
    }
    return SiteNavigationService.instance;
  }

  /**
   * Normaliza a URL garantindo que tenha protocolo https://
   */
  private normalizeUrl(url: string): string {
    if (!url) return '';

    let normalizedUrl = url.trim();

    // Remove espaços e barras finais
    normalizedUrl = normalizedUrl.replace(/\/+$/, '');

    // Adiciona protocolo se não tiver
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    return normalizedUrl;
  }

  async startFullNavigation(url: string): Promise<{
    pages: NavigationPage[];
    ga4PropertyId: string;
    totalEvents: number;
    violationsFound: number;
    summary: NavigationSummary;
  }> {
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl) {
      throw new Error('URL inválida');
    }

    this.baseUrl = normalizedUrl;
    console.log(`🚀 Iniciando navegação completa REAL (Backend-driven) de: ${normalizedUrl}`);

    try {
      // Chama o novo endpoint do backend para auditoria real multi-página
      const response = await fetch("/deep-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });
      
      const data = await response.json();
      
      if (data.status !== "ok" || !data.result) {
        throw new Error(data.msg || "Erro na análise profunda do backend");
      }

      const result = data.result;
      
      // Mapear resultados do backend para o formato esperado pelo frontend
      this.pages = result.pageReports.map((report: any) => ({
        url: report.url,
        name: report.url === normalizedUrl ? 'Página Inicial' : `Página: ${new URL(report.url).pathname}`,
        type: 'home', // Simplificado
        visited: true,
        events: report.tags.map((t: any) => ({
          name: t.name,
          params: { type: t.type, risk: t.lgpdRisk },
          timestamp: report.timestamp,
          beforeConsent: t.isBeforeConsent,
          category: 'analytics'
        })),
        scripts: report.tags.map((t: any) => ({
          name: t.name,
          type: t.type,
          code: '', // Código não retornado no simples
          beforeConsent: t.isBeforeConsent,
          timestamp: report.timestamp,
          dataCollected: t.dataCollected || []
        }))
      }));

      this.ga4PropertyId = result.consolidatedTags.find((t: any) => t.name === 'Google Analytics 4')?.tagId || 'G-XXXXXXXX';

      return {
        pages: this.pages,
        ga4PropertyId: this.ga4PropertyId,
        totalEvents: result.consolidatedTags.length,
        violationsFound: result.totalViolations,
        summary: {
          totalPages: result.pagesAudited,
          totalEvents: result.consolidatedTags.length,
          totalScripts: result.uniqueTagsFound,
          violationsFound: result.totalViolations,
          pageTypes: ['home'],
          eventsBeforeConsent: result.totalViolations,
          scriptsBeforeConsent: result.totalViolations,
          ga4PropertyId: this.ga4PropertyId,
          complianceScore: result.averageScore
        }
      };
    } catch (error) {
      console.error('❌ Falha no Deep Scan real, tentando fallback simulador:', error);
      // Fallback para simulação se o backend falhar (opcional, mas bom para UX)
      throw error;
    }
  }

  private async discoverSitePages(baseUrl: string): Promise<NavigationPage[]> {
    let domain = '';
    try {
      domain = new URL(baseUrl).hostname;
    } catch (error) {
      console.error('URL inválida:', baseUrl);
      // Tenta extrair o domínio manualmente
      domain = baseUrl.replace(/^https?:\/\//, '').split('/')[0];
    }
    const isEcommerce = domain.includes('loja') || domain.includes('shop') || domain.includes('store');

    const commonPages: NavigationPage[] = [
      {
        url: baseUrl,
        name: 'Página Inicial',
        type: 'home',
        visited: false,
        events: [],
        scripts: []
      }
    ];

    if (isEcommerce) {
      commonPages.push(
        {
          url: `${baseUrl}/produtos`,
          name: 'Catálogo de Produtos',
          type: 'category',
          visited: false,
          events: [],
          scripts: []
        },
        {
          url: `${baseUrl}/produto/exemplo`,
          name: 'Página de Produto',
          type: 'product',
          visited: false,
          events: [],
          scripts: []
        },
        {
          url: `${baseUrl}/carrinho`,
          name: 'Carrinho de Compras',
          type: 'cart',
          visited: false,
          events: [],
          scripts: []
        },
        {
          url: `${baseUrl}/checkout`,
          name: 'Finalizar Compra',
          type: 'checkout',
          visited: false,
          events: [],
          scripts: []
        }
      );
    }

    commonPages.push(
      {
        url: `${baseUrl}/sobre`,
        name: 'Sobre Nós',
        type: 'institutional',
        visited: false,
        events: [],
        scripts: []
      },
      {
        url: `${baseUrl}/contato`,
        name: 'Contato',
        type: 'institutional',
        visited: false,
        events: [],
        scripts: []
      }
    );

    return commonPages;
  }

  private async navigateToPage(page: NavigationPage): Promise<void> {
    console.log(`🔍 Analisando ${page.name}...`);

    // Simular navegação e captura de dados reais
    const pageData = await this.simulatePageAnalysis(page);

    page.visited = true;
    page.events = pageData.events;
    page.scripts = pageData.scripts;

    // Detectar GA4 Property ID na primeira página
    if (!this.ga4PropertyId && pageData.ga4PropertyId) {
      this.ga4PropertyId = pageData.ga4PropertyId;
      console.log(`🎯 GA4 Property ID detectado: ${this.ga4PropertyId}`);
    }
  }

  private async simulatePageAnalysis(page: NavigationPage): Promise<{
    events: CapturedEvent[];
    scripts: CapturedScript[];
    ga4PropertyId?: string;
  }> {
    const events: CapturedEvent[] = [];
    const scripts: CapturedScript[] = [];
    let ga4PropertyId = `G-${Math.random().toString(36).substr(2, 10).toUpperCase()}`;

    // Scripts sempre executados (antes do consentimento)
    scripts.push({
      name: 'Google Analytics 4',
      type: 'analytics',
      code: `gtag('config', '${ga4PropertyId}', {
        page_title: '${page.name}',
        page_location: '${page.url}',
        anonymize_ip: false,
        allow_google_signals: true
      });`,
      beforeConsent: true,
      timestamp: new Date().toISOString(),
      dataCollected: ['IP completo', 'User Agent', 'Referrer', 'Localização', 'Sessão']
    });

    // Eventos base para todas as páginas
    events.push({
      name: 'page_view',
      params: {
        page_title: page.name,
        page_location: page.url,
        client_id: `${Math.random().toString(36).substr(2, 9)}.${Date.now()}`,
        session_id: Math.random().toString(36).substr(2, 9),
        ga_session_number: Math.floor(Math.random() * 10) + 1
      },
      timestamp: new Date().toISOString(),
      beforeConsent: true,
      ga4PropertyId,
      category: 'analytics'
    });

    // Evento de scroll (simulando usuário rolando até o final)
    events.push({
      name: 'scroll',
      params: {
        percent_scrolled: 90,
        page_title: page.name,
        client_id: `${Math.random().toString(36).substr(2, 9)}.${Date.now()}`
      },
      timestamp: new Date(Date.now() + 3000).toISOString(),
      beforeConsent: true,
      ga4PropertyId,
      category: 'analytics'
    });

    // Eventos específicos por tipo de página
    switch (page.type) {
      case 'home':
        events.push({
          name: 'view_promotion',
          params: {
            promotion_id: 'banner_home_1',
            promotion_name: 'Banner Principal',
            creative_name: 'Oferta Especial',
            creative_slot: 'hero_banner'
          },
          timestamp: new Date(Date.now() + 1000).toISOString(),
          beforeConsent: true,
          ga4PropertyId,
          category: 'ecommerce'
        });
        break;

      case 'category':
        events.push({
          name: 'view_item_list',
          params: {
            item_list_id: 'categoria_produtos',
            item_list_name: 'Lista de Produtos',
            items: [
              { item_id: 'prod_001', item_name: 'Produto 1', price: 99.90 },
              { item_id: 'prod_002', item_name: 'Produto 2', price: 149.90 }
            ]
          },
          timestamp: new Date(Date.now() + 2000).toISOString(),
          beforeConsent: true,
          ga4PropertyId,
          category: 'ecommerce'
        });
        break;

      case 'product':
        events.push(
          {
            name: 'view_item',
            params: {
              currency: 'BRL',
              value: 199.90,
              items: [{
                item_id: 'prod_exemplo',
                item_name: 'Produto Exemplo',
                item_category: 'Categoria Principal',
                item_brand: 'Marca Exemplo',
                price: 199.90,
                quantity: 1
              }]
            },
            timestamp: new Date(Date.now() + 1500).toISOString(),
            beforeConsent: true,
            ga4PropertyId,
            category: 'ecommerce'
          },
          {
            name: 'select_item',
            params: {
              item_list_id: 'produtos_relacionados',
              item_list_name: 'Produtos Relacionados',
              items: [{
                item_id: 'prod_exemplo',
                item_name: 'Produto Exemplo'
              }]
            },
            timestamp: new Date(Date.now() + 4000).toISOString(),
            beforeConsent: true,
            ga4PropertyId,
            category: 'ecommerce'
          }
        );
        break;

      case 'cart':
        scripts.push({
          name: 'Meta Pixel (Facebook)',
          type: 'advertising',
          code: `fbq('track', 'AddToCart', {
            content_ids: ['prod_exemplo'],
            content_type: 'product',
            value: 199.90,
            currency: 'BRL'
          });`,
          beforeConsent: true,
          timestamp: new Date(Date.now() + 500).toISOString(),
          dataCollected: ['Produtos no carrinho', 'Valor total', 'Fingerprint do navegador']
        });

        events.push({
          name: 'add_to_cart',
          params: {
            currency: 'BRL',
            value: 199.90,
            items: [{
              item_id: 'prod_exemplo',
              item_name: 'Produto Exemplo',
              quantity: 1,
              price: 199.90
            }]
          },
          timestamp: new Date(Date.now() + 1000).toISOString(),
          beforeConsent: true,
          ga4PropertyId,
          category: 'ecommerce'
        });
        break;

      case 'checkout':
        events.push(
          {
            name: 'begin_checkout',
            params: {
              currency: 'BRL',
              value: 199.90,
              coupon: 'DESCONTO10',
              items: [{
                item_id: 'prod_exemplo',
                item_name: 'Produto Exemplo',
                quantity: 1,
                price: 199.90
              }]
            },
            timestamp: new Date(Date.now() + 2000).toISOString(),
            beforeConsent: true,
            ga4PropertyId,
            category: 'ecommerce'
          },
          {
            name: 'add_shipping_info',
            params: {
              currency: 'BRL',
              value: 209.90,
              shipping_tier: 'Sedex',
              items: [{
                item_id: 'prod_exemplo',
                item_name: 'Produto Exemplo',
                quantity: 1,
                price: 199.90
              }]
            },
            timestamp: new Date(Date.now() + 5000).toISOString(),
            beforeConsent: true,
            ga4PropertyId,
            category: 'ecommerce'
          }
        );
        break;
    }

    return { events, scripts, ga4PropertyId };
  }

  private generateNavigationSummary(): NavigationSummary {
    const totalEvents = this.pages.reduce((sum, page) => sum + page.events.length, 0);
    const totalScripts = this.pages.reduce((sum, page) => sum + page.scripts.length, 0);
    const violationsFound = this.pages.reduce((sum, page) => {
      return sum + page.events.filter(e => e.beforeConsent).length +
        page.scripts.filter(s => s.beforeConsent).length;
    }, 0);

    const pageTypes = [...new Set(this.pages.map(p => p.type))];
    const eventsBeforeConsent = this.pages.reduce((sum, page) =>
      sum + page.events.filter(e => e.beforeConsent).length, 0);

    return {
      totalPages: this.pages.length,
      totalEvents,
      totalScripts,
      violationsFound,
      pageTypes,
      eventsBeforeConsent,
      scriptsBeforeConsent: this.pages.reduce((sum, page) =>
        sum + page.scripts.filter(s => s.beforeConsent).length, 0),
      ga4PropertyId: this.ga4PropertyId,
      complianceScore: Math.max(0, 100 - (violationsFound * 10))
    };
  }

  getCurrentProgress(): { current: number; total: number; currentPage?: string } {
    return {
      current: this.currentPage + 1,
      total: this.pages.length,
      currentPage: this.pages[this.currentPage]?.name
    };
  }
}

export interface NavigationSummary {
  totalPages: number;
  totalEvents: number;
  totalScripts: number;
  violationsFound: number;
  pageTypes: string[];
  eventsBeforeConsent: number;
  scriptsBeforeConsent: number;
  ga4PropertyId: string;
  complianceScore: number;
}
