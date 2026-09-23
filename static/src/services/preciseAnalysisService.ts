import {
  EnhancedRealDataService,
  RealAnalysisResult as EnhancedAnalysisResult,
} from './enhancedRealDataService';

export type RealAnalysisResult = Omit<EnhancedAnalysisResult, 'fetchSuccess' | 'fetchMethod'>;

/**
 * Legacy compatibility wrapper.
 *
 * The authoritative scanner is POST /api/audit. This wrapper intentionally
 * performs no simulated fallback and never invents scripts, events, cookies,
 * consent state, data flows or legal conclusions.
 */
export class PreciseAnalysisService {
  private static instance: PreciseAnalysisService;

  static getInstance(): PreciseAnalysisService {
    if (!PreciseAnalysisService.instance) {
      PreciseAnalysisService.instance = new PreciseAnalysisService();
    }
    return PreciseAnalysisService.instance;
  }

  async analyzeWebsite(url: string): Promise<RealAnalysisResult> {
    const result = await EnhancedRealDataService.getInstance().analyzeWebsite(url);
    return {
      scripts: result.scripts,
      events: result.events,
      consentMechanism: result.consentMechanism,
      privacyPolicy: result.privacyPolicy,
      cookieAnalysis: result.cookieAnalysis,
    };
  }
}
