import { OmnibugAnalysisResult, OmnibugEvent, OmnibugScript, LGPDViolation } from '@/types/omnibug';

export class OmnibugRealDataService {
  private static instance: OmnibugRealDataService;

  static getInstance(): OmnibugRealDataService {
    if (!OmnibugRealDataService.instance) {
      OmnibugRealDataService.instance = new OmnibugRealDataService();
    }
    return OmnibugRealDataService.instance;
  }

  async captureRealData(url: string): Promise<OmnibugAnalysisResult> {
    const started = Date.now();
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, view_source: true }),
    });

    let data: any = null;
    try { data = await response.json(); } catch { /* handled below */ }

    if (!response.ok || !data || data.success === false) {
      throw new Error(data?.message || `Auditoria real falhou (HTTP ${response.status})`);
    }

    return this.convertBackendToOmnibug(data, url, Date.now() - started);
  }

  private convertBackendToOmnibug(data: any, url: string, requestDuration: number): OmnibugAnalysisResult {
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const rawEvents = Array.isArray(data.events) ? data.events : [];
    const violationsRaw = Array.isArray(data.violations)
      ? data.violations
      : (Array.isArray(data.privacy?.violations) ? data.privacy.violations : []);
    const networkHints = Array.isArray(data.debugging?.networkHints) ? data.debugging.networkHints : [];
    const observedCookies = Array.isArray(data.privacy?.observedCookies) ? data.privacy.observedCookies : [];
    const ga4Id =
      (Array.isArray(data.ga4?.measurementIds) ? data.ga4.measurementIds[0] : '') ||
      tags.find((t: any) => typeof t?.tagId === 'string' && t.tagId.startsWith('G-'))?.tagId ||
      '';

    const violations: LGPDViolation[] = violationsRaw.map((v: any) => ({
      severity: ['critical','high','medium','low'].includes(v?.severity) ? v.severity : 'medium',
      article: v?.article || 'Requer verificação jurídica',
      description: v?.violation || v?.description || 'Indicador técnico observado',
      evidence: v?.tag || v?.tagId || v?.evidence || '',
      recommendation: v?.recommendation || v?.howToFix || 'Revisar a implementação e a base legal aplicável.',
      estimatedFine: 'Não estimável por auditoria técnica externa.',
      dataTypes: Array.isArray(v?.dataCollected) ? v.dataCollected : [],
    }));

    const events: OmnibugEvent[] = rawEvents.map((event: any) => {
      const parameters: Record<string, any> = {};
      for (const p of (event.parametersFound || event.parameters_found || [])) {
        if (p?.name) parameters[p.name] = p.value;
      }
      const name = event.name || 'event';
      return {
        name,
        eventType: /purchase|cart|checkout|item/i.test(name) ? 'ecommerce' : (name === 'page_view' ? 'pageview' : 'event'),
        timestamp: data.finished_at || new Date().toISOString(),
        parameters,
        requiredParams: [],
        missingParams: event.missingRequiredParams || event.missing_required_params || [],
        malformedParams: [],
        beforeConsent: Boolean(event.isBeforeConsent ?? event.is_before_consent ?? false),
        ga4PropertyId: ga4Id,
        category: /purchase|cart|checkout|item/i.test(name) ? 'ecommerce' : 'analytics',
        pixelType: 'GA4',
        networkRequest: { url: '', method: 'GET', headers: {}, payload: null },
        dataLayerState: data.debugging?.dataLayerPushes || [],
        violations: [],
      };
    });

    const scripts: OmnibugScript[] = tags.map((tag: any) => {
      const tagType = String(tag.type || 'custom');
      const type: OmnibugScript['type'] =
        tagType === 'analytics' || tagType === 'advertising' || tagType === 'tag_manager' ||
        tagType === 'heatmap' || tagType === 'chat' || tagType === 'social'
          ? tagType as OmnibugScript['type']
          : 'custom';

      const name = tag.name || tag.vendor || 'Tag';
      const vendor: OmnibugScript['vendor'] =
        /google|gtm|analytics/i.test(name) ? 'Google' :
        /meta|facebook/i.test(name) ? 'Meta' :
        /microsoft|clarity/i.test(name) ? 'Microsoft' :
        /linkedin/i.test(name) ? 'LinkedIn' :
        /tiktok/i.test(name) ? 'TikTok' :
        /pinterest/i.test(name) ? 'Pinterest' :
        /criteo/i.test(name) ? 'Criteo' :
        /hotjar/i.test(name) ? 'Hotjar' :
        /intercom/i.test(name) ? 'Intercom' : 'Other';

      return {
        name,
        type,
        vendor,
        scriptSrc: tag.matchedPattern || '',
        inlineCode: tag.context || '',
        position: Number(tag.position || 0),
        loadTime: 0,
        beforeConsent: Boolean(tag.isBeforeConsent ?? tag.is_before_consent ?? false),
        dataCollected: Array.isArray(tag.dataCollected) ? tag.dataCollected : [],
        cookiesSet: [],
        networkRequests: networkHints
          .map((n: any) => n?.url)
          .filter((u: any) => typeof u === 'string' && u.length > 0),
        dataTransfers: [],
        lgpdViolations: [],
        realTimeData: {
          activeConnections: 0,
          dataFlow: [],
          userIdentifiers: [],
        },
      };
    });

    const analyticsRequests = networkHints.filter((n: any) =>
      /google-analytics|googletagmanager|collect|analytics/i.test(String(n?.url || ''))
    ).length;
    const advertisingRequests = networkHints.filter((n: any) =>
      /facebook|doubleclick|googlead|tiktok|linkedin|pinterest|criteo/i.test(String(n?.url || ''))
    ).length;

    const cookies = observedCookies.map((name: string) => ({
      name,
      value: '',
      domain: '',
      secure: false,
    }));

    const score = typeof data.score === 'number' ? data.score : 0;
    const duration = Number(data.observability?.duration_ms || requestDuration || 0);

    return {
      url: data.url || url,
      timestamp: data.finished_at || new Date().toISOString(),
      events,
      scripts,
      dataLayer: data.debugging?.dataLayerPushes || [],
      cookies: {
        essential: [],
        analytics: [],
        marketing: [],
        uncategorized: cookies,
      },
      consentMechanism: {
        detected: Boolean(data.consent?.cmpDetected ?? data.privacy?.cmpDetected ?? data.summary?.consentDetected),
        type: (data.consent?.cmpDetected ?? data.privacy?.cmpDetected) ? 'binary' : 'none',
        vendor: data.consent?.cmpName || '',
        beforeScripts: scripts.some(s => s.beforeConsent),
        compliant: violations.length === 0,
        issues: violations.slice(0, 5).map(v => v.description),
      },
      networkActivity: {
        totalRequests: networkHints.length,
        analyticsRequests,
        advertisingRequests,
        dataTransfers: networkHints.length,
      },
      compliance: {
        score,
        violations,
        recommendations: (data.recommendations || [])
          .map((r: any) => r?.howToFix || r?.description || r?.title)
          .filter(Boolean),
      },
      performance: {
        loadTime: duration,
        scriptCount: scripts.length,
        trackingImpact: 'Não calculado',
      },
    };
  }
}
