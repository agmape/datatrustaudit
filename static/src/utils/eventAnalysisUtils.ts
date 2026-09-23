
import { Event } from '@/types/audit';
import { validateEventParameters } from './validationUtils';
import { assessDataType, assessViolationSeverity } from './dataAssessmentUtils';
import { calculateLegalRisk } from './legalRiskUtils';

export const analyzeEvent = (event: any, hasConsent: boolean): Event => {
  const actualParams = event.actualParams || [];
  const validation = validateEventParameters(event.name, actualParams);
  const dataType = assessDataType('', event.name);
  const violationSeverity = assessViolationSeverity(hasConsent, dataType, false, 'event');
  const legalRisk = calculateLegalRisk(violationSeverity, event.name, dataType);

  return {
    name: event.name,
    origin: event.origin,
    parameters: event.parameters,
    url: `https://analytics.google.com/analytics/web/#/reports/defaultid/${Math.random().toString(36).substr(2, 9)}`,
    category: event.category,
    validation,
    actualParams,
    dataType,
    hasConsent,
    violationSeverity,
    legalRisk,
    description: event.description
  };
};
