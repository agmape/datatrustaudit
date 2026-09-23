import { WebsiteFetchService } from './websiteFetchService';
import { HtmlAnalysisService } from './htmlAnalysisService';

export interface RealAnalysisResult {
  scripts: Array<{
    name: string;
    type: string;
    code: string;
    position: number;
    dataCollected: string[];
    isBeforeConsent: boolean;
    actualDataFlow: string;
    realScript: true;
  }>;
  events: Array<{
    name: string;
    actualParams: string[];
    dataCollected: string;
    origin: string;
    category: string;
    realEvent: true;
  }>;
  consentMechanism: {
    detected: boolean;
    type: string;
    implementation: string;
    compliant: boolean;
  };
  privacyPolicy: {
    exists: boolean;
    lgpdCompliant: boolean;
    issues: string[];
  };
  cookieAnalysis: {
    essential: string[];
    analytics: string[];
    marketing: string[];
    uncategorized: string[];
  };
  fetchSuccess: boolean;
  fetchMethod: string;
}

const unavailableResult = (method: string, issue: string): RealAnalysisResult => ({
  scripts: [],
  events: [],
  consentMechanism: {
    detected: false,
    type: 'Não verificado',
    implementation: 'Não foi possível verificar externamente',
    compliant: false,
  },
  privacyPolicy: {
    exists: false,
    lgpdCompliant: false,
    issues: [issue],
  },
  cookieAnalysis: {
    essential: [],
    analytics: [],
    marketing: [],
    uncategorized: [],
  },
  fetchSuccess: false,
  fetchMethod: method,
});

export class EnhancedRealDataService {
  private static instance: EnhancedRealDataService;
  private fetchService: WebsiteFetchService;
  private analysisService: HtmlAnalysisService;

  static getInstance(): EnhancedRealDataService {
    if (!EnhancedRealDataService.instance) {
      EnhancedRealDataService.instance = new EnhancedRealDataService();
    }
    return EnhancedRealDataService.instance;
  }

  constructor() {
    this.fetchService = WebsiteFetchService.getInstance();
    this.analysisService = HtmlAnalysisService.getInstance();
  }

  async analyzeWebsite(url: string): Promise<RealAnalysisResult> {
    try {
      const fetchResult = await this.fetchService.fetchWebsiteContent(url);
      if (!fetchResult.success || !fetchResult.html) {
        return unavailableResult(
          fetchResult.method || 'unavailable',
          fetchResult.error || 'HTML não obtido. Nenhuma evidência foi inferida ou simulada.',
        );
      }

      const html = fetchResult.html;
      const scripts = this.analysisService.extractScripts(html, url);
      const events = this.analysisService.extractEvents(html, url);
      const consentMechanism = this.analysisService.analyzeConsentMechanism(html);

      // These are HTML heuristics only. They are deliberately not presented
      // as legal determinations.
      const lower = html.toLowerCase();
      const privacyPolicy = {
        exists: lower.includes('privacidade') || lower.includes('privacy'),
        lgpdCompliant: false,
        issues: [
          'A existência ou conformidade jurídica de uma política não pode ser determinada por busca textual no HTML.',
        ],
      };

      // Cookie presence cannot be proven by strings in source HTML. Runtime
      // browser evidence from /api/audit is the authoritative path.
      const cookieAnalysis = {
        essential: [],
        analytics: [],
        marketing: [],
        uncategorized: [],
      };

      return {
        scripts,
        events,
        consentMechanism: {
          ...consentMechanism,
          implementation: consentMechanism.detected
            ? 'Mecanismo aparente detectado; eficácia requer verificação runtime'
            : 'Não observado no HTML analisado',
          compliant: false,
        },
        privacyPolicy,
        cookieAnalysis,
        fetchSuccess: true,
        fetchMethod: fetchResult.method,
      };
    } catch (error) {
      return unavailableResult(
        'error',
        `Falha de coleta: ${error instanceof Error ? error.message : String(error)}. Nenhum dado simulado foi gerado.`,
      );
    }
  }
}
