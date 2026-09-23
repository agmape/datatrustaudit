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

export class SiteNavigationService {
  private static instance: SiteNavigationService;
  private pages: NavigationPage[] = [];
  private currentPage = 0;
  private totalPages = 1;

  static getInstance(): SiteNavigationService {
    if (!SiteNavigationService.instance) {
      SiteNavigationService.instance = new SiteNavigationService();
    }
    return SiteNavigationService.instance;
  }

  private normalizeUrl(url: string): string {
    const trimmed = (url || '').trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  private pageType(url: string, baseUrl: string): NavigationPage['type'] {
    try {
      const path = new URL(url).pathname.toLowerCase();
      if (url.replace(/\/$/, '') === baseUrl.replace(/\/$/, '') || path === '/') return 'home';
      if (/checkout|pagamento/.test(path)) return 'checkout';
      if (/cart|carrinho/.test(path)) return 'cart';
      if (/produto|product/.test(path)) return 'product';
      if (/categoria|category|shop|loja/.test(path)) return 'category';
      return 'institutional';
    } catch {
      return 'institutional';
    }
  }

  async startFullNavigation(url: string): Promise<{
    pages: NavigationPage[];
    ga4PropertyId: string;
    totalEvents: number;
    violationsFound: number;
    summary: NavigationSummary;
  }> {
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl) throw new Error('URL inválida');

    this.pages = [];
    this.currentPage = 0;
    this.totalPages = 1;

    const response = await fetch('/deep-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: normalizedUrl }),
    });

    let data: any = null;
    try { data = await response.json(); } catch { /* handled below */ }

    if (!response.ok || data?.status !== 'ok' || !data?.result) {
      throw new Error(data?.message || `Deep Scan falhou (HTTP ${response.status})`);
    }
    if (data.simulated === true) {
      throw new Error('O backend retornou dados simulados; o DataTrust recusou exibi-los.');
    }

    const result = data.result;
    const reports = Array.isArray(result.pageReports) ? result.pageReports : [];
    this.totalPages = Math.max(1, reports.length);

    this.pages = reports
      .filter((report: any) => report && report.status !== 'failed')
      .map((report: any) => {
        const tags = Array.isArray(report.tags) ? report.tags : [];
        const reportEvents = Array.isArray(report.events) ? report.events : [];
        const ga4Tag = tags.find((t: any) => typeof t?.tagId === 'string' && t.tagId.startsWith('G-'));

        const events: CapturedEvent[] = reportEvents.map((event: any) => {
          const params: Record<string, any> = {};
          for (const p of (event.parametersFound || event.parameters_found || [])) {
            if (p?.name) params[p.name] = p.value;
          }
          return {
            name: event.name || 'event',
            params,
            timestamp: report.timestamp || new Date().toISOString(),
            beforeConsent: Boolean(event.isBeforeConsent ?? event.is_before_consent ?? false),
            ga4PropertyId: ga4Tag?.tagId,
            category: /purchase|cart|checkout|item/i.test(event.name || '') ? 'ecommerce' : 'analytics',
          };
        });

        const scripts: CapturedScript[] = tags.map((tag: any) => ({
          name: tag.name || tag.vendor || 'Tag',
          type: tag.type || 'custom',
          code: tag.context || tag.matchedPattern || '',
          beforeConsent: Boolean(tag.isBeforeConsent ?? tag.is_before_consent ?? false),
          timestamp: report.timestamp || new Date().toISOString(),
          dataCollected: Array.isArray(tag.dataCollected) ? tag.dataCollected : [],
        }));

        return {
          url: report.url,
          name: (() => {
            try {
              const p = new URL(report.url).pathname;
              return p === '/' ? 'Página inicial' : p;
            } catch {
              return report.url;
            }
          })(),
          type: this.pageType(report.url, normalizedUrl),
          visited: true,
          events,
          scripts,
        };
      });

    this.currentPage = this.pages.length;

    const consolidatedTags = Array.isArray(result.consolidatedTags) ? result.consolidatedTags : [];
    const ga4PropertyId =
      consolidatedTags.find((t: any) => typeof t?.tagId === 'string' && t.tagId.startsWith('G-'))?.tagId || '';

    const totalEvents = this.pages.reduce((sum, page) => sum + page.events.length, 0);
    const totalScripts = this.pages.reduce((sum, page) => sum + page.scripts.length, 0);
    const eventsBeforeConsent = this.pages.reduce((sum, page) => sum + page.events.filter(e => e.beforeConsent).length, 0);
    const scriptsBeforeConsent = this.pages.reduce((sum, page) => sum + page.scripts.filter(s => s.beforeConsent).length, 0);
    const violationsFound = Number(result.totalViolations || 0);

    return {
      pages: this.pages,
      ga4PropertyId,
      totalEvents,
      violationsFound,
      summary: {
        totalPages: Number(result.pagesAudited || this.pages.length),
        totalEvents,
        totalScripts,
        violationsFound,
        pageTypes: [...new Set(this.pages.map(p => p.type))],
        eventsBeforeConsent,
        scriptsBeforeConsent,
        ga4PropertyId,
        complianceScore: typeof result.averageScore === 'number' ? result.averageScore : 0,
      },
    };
  }

  getCurrentProgress(): { current: number; total: number; currentPage?: string } {
    return {
      current: this.currentPage,
      total: Math.max(1, this.totalPages),
      currentPage: this.pages[Math.max(0, this.currentPage - 1)]?.name || 'Auditando páginas reais...',
    };
  }
}
