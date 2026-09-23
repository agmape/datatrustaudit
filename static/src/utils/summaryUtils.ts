
import { AuditResult } from '@/types/audit';

export const generateSummary = (
  embedCodes: any[],
  events: any[],
  universalAnalytics: any[],
  gtmPosition: number
) => {
  const validEmbedCodes = Array.isArray(embedCodes) ? embedCodes : [];
  const validEvents = Array.isArray(events) ? events : [];
  const validUA = Array.isArray(universalAnalytics) ? universalAnalytics : [];
  
  const codesBeforeGTM = validEmbedCodes.filter(code => code && code.isBeforeGTM).length;
  const codesAfterGTM = validEmbedCodes.length - codesBeforeGTM;
  
  const criticalViolations = validEmbedCodes.filter(code => code && code.violationSeverity === 'critical').length;
  const highViolations = validEmbedCodes.filter(code => code && code.violationSeverity === 'high').length;
  const mediumViolations = validEmbedCodes.filter(code => code && code.violationSeverity === 'medium').length;

  return {
    totalCodes: validEmbedCodes.length,
    codesBeforeGTM,
    codesAfterGTM,
    totalEvents: validEvents.length,
    uaDetected: validUA.length > 0,
    criticalViolations,
    highViolations,
    mediumViolations
  };
};
