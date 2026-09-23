export interface OmnibugEvent {
  name: string;
  eventType: 'pageview' | 'event' | 'ecommerce' | 'custom';
  timestamp: string;
  parameters: Record<string, any>;
  requiredParams: string[];
  missingParams: string[];
  malformedParams: string[];
  beforeConsent: boolean;
  ga4PropertyId: string;
  category: 'analytics' | 'ecommerce' | 'advertising' | 'custom';
  pixelType: 'GA4' | 'Meta' | 'LinkedIn' | 'TikTok' | 'Pinterest' | 'Criteo' | 'Microsoft';
  networkRequest: {
    url: string;
    method: string;
    headers: Record<string, string>;
    payload: any;
  };
  dataLayerState: any[];
  violations: LGPDViolation[];
}

export interface OmnibugScript {
  name: string;
  type: 'analytics' | 'advertising' | 'tag_manager' | 'heatmap' | 'chat' | 'social' | 'custom';
  vendor: 'Google' | 'Meta' | 'Microsoft' | 'LinkedIn' | 'TikTok' | 'Pinterest' | 'Criteo' | 'Hotjar' | 'Intercom' | 'Other';
  scriptSrc: string;
  inlineCode: string;
  position: number;
  loadTime: number;
  beforeConsent: boolean;
  dataCollected: string[];
  cookiesSet: string[];
  networkRequests: string[];
  dataTransfers: {
    destination: string;
    country: string;
    dataTypes: string[];
    legalBasis: string;
  }[];
  lgpdViolations: LGPDViolation[];
  realTimeData: {
    activeConnections: number;
    dataFlow: string[];
    userIdentifiers: string[];
  };
}

export interface LGPDViolation {
  severity: 'critical' | 'high' | 'medium' | 'low';
  article: string;
  description: string;
  evidence: string;
  recommendation: string;
  estimatedFine: string;
  dataTypes: string[];
}

export interface OmnibugAnalysisResult {
  url: string;
  timestamp: string;
  events: OmnibugEvent[];
  scripts: OmnibugScript[];
  dataLayer: any[];
  cookies: {
    essential: Array<{name: string; value: string; domain: string; secure: boolean}>;
    analytics: Array<{name: string; value: string; domain: string; secure: boolean}>;
    marketing: Array<{name: string; value: string; domain: string; secure: boolean}>;
    uncategorized: Array<{name: string; value: string; domain: string; secure: boolean}>;
  };
  consentMechanism: {
    detected: boolean;
    type: 'granular' | 'binary' | 'none';
    vendor: string;
    beforeScripts: boolean;
    compliant: boolean;
    issues: string[];
  };
  networkActivity: {
    totalRequests: number;
    analyticsRequests: number;
    advertisingRequests: number;
    dataTransfers: number;
  };
  compliance: {
    score: number;
    violations: LGPDViolation[];
    recommendations: string[];
  };
  performance: {
    loadTime: number;
    scriptCount: number;
    trackingImpact: string;
  };
}
