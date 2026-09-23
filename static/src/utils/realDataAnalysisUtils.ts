import { EnhancedRealDataService } from '../services/enhancedRealDataService';

export const analyzeRealWebsite = async (
  url: string,
  _useViewSource: boolean = false,
): Promise<{
  scripts: any[];
  events: any[];
  cookieConsent: boolean;
  gtmPosition: number;
}> => {
  const realData = await EnhancedRealDataService.getInstance().analyzeWebsite(url);

  if (!realData.fetchSuccess) {
    // Fail closed: absence of evidence is not evidence of absence and must
    // never be replaced by plausible-looking synthetic data.
    return {
      scripts: [],
      events: [],
      cookieConsent: false,
      gtmPosition: 0,
    };
  }

  const scripts = realData.scripts.map((script) => ({
    ...script,
    evidenceType: 'html_heuristic',
    verified: true,
    confidence: 'medium',
    // Keep compatibility fields but do not convert a technical observation
    // into an automatic LGPD violation.
    violatesLGPD: false,
    lgpdViolationReason: null,
  }));

  const events = realData.events.map((event, index) => ({
    ...event,
    hasConsent: false,
    lgpdCompliant: undefined,
    violationReason: null,
    evidenceType: 'html_heuristic',
    verified: true,
    confidence: 'medium',
    eventPosition: index + 1,
  }));

  const gtmIndex = scripts.findIndex((script) => script.type === 'tag_manager');

  return {
    scripts,
    events,
    cookieConsent: false,
    gtmPosition: gtmIndex >= 0 ? gtmIndex + 1 : 0,
  };
};
