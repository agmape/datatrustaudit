interface FetchResult {
  html: string;
  success: boolean;
  method: string;
  error?: string;
}

/**
 * Legacy compatibility service.
 *
 * Browser-side public CORS proxies are intentionally disabled in production:
 * they leak the audit target to unrelated third parties, are unreliable, and
 * cannot provide browser-runtime evidence. The authoritative collection path
 * is POST /api/audit, which applies SSRF controls and runtime/static evidence
 * labeling server-side.
 */
export class WebsiteFetchService {
  private static instance: WebsiteFetchService;

  static getInstance(): WebsiteFetchService {
    if (!WebsiteFetchService.instance) {
      WebsiteFetchService.instance = new WebsiteFetchService();
    }
    return WebsiteFetchService.instance;
  }

  async fetchWebsiteContent(_url: string): Promise<FetchResult> {
    return {
      html: '',
      success: false,
      method: 'deprecated-browser-proxy-disabled',
      error: 'Legacy browser proxy fetching is disabled. Use POST /api/audit.',
    };
  }
}
