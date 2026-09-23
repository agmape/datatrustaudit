export interface EmbedCode {
  name: string;
  type: string;
  position: number;
  isBeforeGTM: boolean;
  isBeforeConsent?: boolean;
  code: string;
  severity: 'ok' | 'warning' | 'error';
  lgpdCompliance?: 'compliant' | 'violation' | 'warning';
  complianceMessage?: string;
  violationSeverity?: 'ok' | 'medium' | 'high' | 'critical';
  violationMessage?: string;
  dataType?: 'simple' | 'sensitive' | 'none';
  legalRisk?: {
    level: 'none' | 'low' | 'medium' | 'high' | 'critical';
    estimatedFine: string;
    description: string;
  };
  detectedData: string[];
  lgpdArticles: string[];
  scriptAnalysis?: {
    issues: string[];
    dataPoints: string[];
    codeLength: number;
    hasExternalCalls: boolean;
    isMinified: boolean;
  };
  realScript?: boolean;
}

export interface EventValidation {
  status: 'complete' | 'incomplete' | 'invalid';
  missingParams: string[];
  extraParams: string[];
  validationMessage: string;
}

export interface Event {
  name: string;
  origin: string;
  parameters: string;
  url?: string;
  category: string;
  validation?: EventValidation;
  actualParams: string[];
  dataType?: 'simple' | 'sensitive' | 'none';
  hasConsent: boolean;
  violationSeverity?: 'ok' | 'medium' | 'high' | 'critical';
  legalRisk?: {
    level: 'none' | 'low' | 'medium' | 'high' | 'critical';
    estimatedFine: string;
    description: string;
  };
  description?: string;
  dataCollected?: string;
  lgpdCompliant?: boolean;
  violationReason?: string | null;
  realEvent?: boolean;
}

export interface UniversalAnalyticsCode {
  name: string;
  type: string;
  code: string;
  position: number;
  parameters: string[];
}

export interface Improvement {
  category: string;
  issue: string;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ViolationRisk {
  eventName: string;
  dataType: string;
  hasConsent: boolean;
  severity: 'ok' | 'medium' | 'high' | 'critical';
  legalRisk: string;
  potentialFine: string;
  description: string;
}

export interface LegalSummary {
  dataCollectionSeverity: 'ok' | 'medium' | 'high' | 'critical';
  proofOfDamage: 'none' | 'presumed' | 'proven' | 'material';
  companySize: 'unknown' | 'small' | 'medium' | 'large';
  totalRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  estimatedTotalFine: string;
}

export interface AuditResult {
  embedCodes: EmbedCode[];
  events: Event[];
  universalAnalytics: UniversalAnalyticsCode[];
  improvements: Improvement[];
  violationRisks: ViolationRisk[];
  legalSummary: LegalSummary;
  gtmPosition: number;
  summary: {
    totalCodes: number;
    codesBeforeGTM: number;
    codesAfterGTM: number;
    totalEvents: number;
    uaDetected: boolean;
    criticalViolations: number;
    highViolations: number;
    mediumViolations: number;
  };
  analysisMethod?: string;
  websiteUrl?: string;
  auditTimestamp?: string;
  consentDetected?: boolean;
}
