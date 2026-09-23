import { OmnibugAnalysisResult, LGPDViolation } from '@/types/omnibug';
import { OmnibugEventAnalyzer } from './omnibugEventAnalyzer';
import { OmnibugScriptAnalyzer } from './omnibugScriptAnalyzer';
import { OmnibugNetworkAnalyzer } from './omnibugNetworkAnalyzer';

export class OmnibugRealDataService {
  private static instance: OmnibugRealDataService;
  private eventAnalyzer = new OmnibugEventAnalyzer();
  private scriptAnalyzer = new OmnibugScriptAnalyzer();
  private networkAnalyzer = new OmnibugNetworkAnalyzer();

  private proxyUrls = [
    'https://api.allorigins.win/get?url=',
    'https://cors-anywhere.herokuapp.com/',
    'https://proxy.cors.sh/',
    'https://thingproxy.freeboard.io/fetch/'
  ];

  static getInstance(): OmnibugRealDataService {
    if (!OmnibugRealDataService.instance) {
      OmnibugRealDataService.instance = new OmnibugRealDataService();
    }
    return OmnibugRealDataService.instance;
  }

  async captureRealData(url: string): Promise<OmnibugAnalysisResult> {
    console.log(`🔍 [OMNIBUG] Iniciando captura via backend local: ${url}`);
    const startTime = Date.now();

    try {
      // Chamar o backend local que faz a análise real
      const response = await fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        throw new Error(`Backend retornou status ${response.status}`);
      }

      const backendData = await response.json();
      const loadTime = Date.now() - startTime;
      console.log(`✅ [OMNIBUG] Dados reais do backend em ${loadTime}ms`);

      // Converter dados do backend para formato Omnibug
      return this.convertBackendToOmnibug(backendData, url, loadTime);

    } catch (error) {
      console.error('❌ [OMNIBUG] Erro na captura real:', error);
      return this.generateRealisticFallback(url);
    }
  }

  private convertBackendToOmnibug(data: any, url: string, loadTime: number): OmnibugAnalysisResult {
    // Converter tags para eventos Omnibug
    const events = (data.tags || []).map((tag: any, index: number) => ({
      name: tag.name || 'Unknown',
      pixelType: this.mapTagTypeToPixel(tag.type),
      timestamp: new Date().toISOString(),
      parameters: { tagId: tag.tagId, pattern: tag.matchedPattern },
      requiredParams: [],
      missingParams: [],
      malformedParams: [],
      violations: tag.isBeforeConsent ? [{
        article: 'Art. 7 LGPD',
        severity: 'high' as const,
        description: 'Script carregado antes do consentimento',
        evidence: tag.context,
        recommendation: 'Carregar após obter consentimento',
        estimatedFine: 'R$ 50.000'
      }] : [],
      beforeConsent: tag.isBeforeConsent || false,
      networkRequest: { url: '', method: 'GET', timing: 0 }
    }));

    // Converter para scripts
    const scripts = (data.tags || []).map((tag: any) => ({
      name: tag.name,
      vendor: tag.type,
      src: tag.matchedPattern,
      beforeConsent: tag.isBeforeConsent || false,
      dataCollected: tag.dataCollected || [],
      loadTime: 0,
      dataTransfers: [],
      inlineCode: tag.context?.substring(0, 200) || '',
      realTimeData: { activeConnections: 0, dataFlow: [], userIdentifiers: [] },
      lgpdViolations: []
    }));

    return {
      url,
      timestamp: new Date().toISOString(),
      events,
      scripts,
      dataLayer: data.dataLayer || [],
      cookies: { essential: [], analytics: [], marketing: [], uncategorized: [] },
      consentMechanism: {
        detected: data.lgpdAnalysis?.hasConsentTool || false,
        type: data.lgpdAnalysis?.hasConsentTool ? 'binary' : 'none',
        vendor: data.lgpdAnalysis?.hasConsentTool ? 'Detectado' : 'Não detectado',
        beforeScripts: true,
        compliant: (data.score || 0) > 70,
        issues: (data.lgpdAnalysis?.violations || []).map((v: any) => v.violation).slice(0, 3)
      },
      networkActivity: {
        totalRequests: data.tagCount || 0,
        analyticsRequests: data.typeCounts?.analytics || 0,
        advertisingRequests: data.typeCounts?.advertising || 0,
        dataTransfers: 0
      },
      compliance: {
        score: data.score || 0,
        violations: (data.lgpdAnalysis?.violations || []).map((v: any) => ({
          article: v.article,
          severity: v.severity || 'medium',
          description: v.violation,
          evidence: v.tag,
          recommendation: v.recommendation,
          estimatedFine: v.estimatedFine
        })),
        recommendations: ['Implementar Consent Mode v2', 'Revisar tags de alto risco']
      },
      performance: {
        loadTime,
        scriptCount: scripts.length,
        trackingImpact: scripts.length > 10 ? 'Alto' : scripts.length > 5 ? 'Médio' : 'Baixo'
      }
    };
  }

  private mapTagTypeToPixel(type: string): string {
    const map: Record<string, string> = {
      'analytics': 'GA4',
      'advertising': 'Meta',
      'tag_manager': 'GTM',
      'consent': 'CMP',
      'heatmap': 'Hotjar'
    };
    return map[type] || type;
  }

  private async fetchWithMultipleProxies(url: string): Promise<string> {
    const errors: Error[] = [];

    for (const proxy of this.proxyUrls) {
      try {
        console.log(`🌐 Tentando proxy: ${proxy}`);
        const response = await fetch(`${proxy}${encodeURIComponent(url)}`, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (response.ok) {
          const data = await response.json();
          return data.contents || data.data || data;
        }
      } catch (error) {
        errors.push(error as Error);
        continue;
      }
    }

    try {
      const response = await fetch(url);
      return await response.text();
    } catch (error) {
      throw new Error(`Falha em todos os proxies: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  private async performDeepAnalysis(html: string, url: string): Promise<OmnibugAnalysisResult> {
    const events = this.eventAnalyzer.extractRealEvents(html, url);
    const scripts = this.scriptAnalyzer.extractRealScripts(html, url);
    const cookies = this.networkAnalyzer.analyzeCookies(html);
    const consentMechanism = this.networkAnalyzer.analyzeConsentMechanism(html);
    const networkActivity = this.networkAnalyzer.analyzeNetworkActivity(html);
    const compliance = this.performLGPDAnalysis(events, scripts);

    return {
      url,
      timestamp: new Date().toISOString(),
      events,
      scripts,
      dataLayer: this.extractDataLayer(html),
      cookies,
      consentMechanism,
      networkActivity,
      compliance,
      performance: {
        loadTime: 0,
        scriptCount: scripts.length,
        trackingImpact: this.scriptAnalyzer.calculateTrackingImpact(scripts)
      }
    };
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

  private performLGPDAnalysis(events: any[], scripts: any[]) {
    const allViolations = [
      ...events.flatMap(e => e.violations),
      ...scripts.flatMap(s => s.lgpdViolations)
    ];

    const criticalCount = allViolations.filter(v => v.severity === 'critical').length;
    const highCount = allViolations.filter(v => v.severity === 'high').length;

    const score = Math.max(0, 100 - (criticalCount * 25) - (highCount * 15));

    return {
      score,
      violations: allViolations,
      recommendations: this.generateRecommendations(allViolations)
    };
  }

  private generateRecommendations(violations: LGPDViolation[]): string[] {
    const recommendations = new Set<string>();
    violations.forEach(v => recommendations.add(v.recommendation));
    return Array.from(recommendations);
  }

  private generateRealisticFallback(url: string): OmnibugAnalysisResult {
    console.log('⚠️ [OMNIBUG] Usando fallback - nenhum dado real capturado');

    return {
      url,
      timestamp: new Date().toISOString(),
      events: [],
      scripts: [],
      dataLayer: [],
      cookies: { essential: [], analytics: [], marketing: [], uncategorized: [] },
      consentMechanism: {
        detected: false,
        type: 'none' as const,
        vendor: 'Não detectado',
        beforeScripts: false,
        compliant: false,
        issues: ['Nenhum dado capturado - site pode estar bloqueando análise']
      },
      networkActivity: { totalRequests: 0, analyticsRequests: 0, advertisingRequests: 0, dataTransfers: 0 },
      compliance: {
        score: 0,
        violations: [],
        recommendations: ['Instalar extensão Omnibug para captura real']
      },
      performance: { loadTime: 0, scriptCount: 0, trackingImpact: 'Nenhum dado' }
    };
  }
}
