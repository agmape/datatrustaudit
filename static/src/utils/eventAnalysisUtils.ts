import { Event } from '@/types/audit';
import { validateEventParameters } from './validationUtils';
import { assessDataType, assessViolationSeverity } from './dataAssessmentUtils';
import { calculateLegalRisk } from './legalRiskUtils';

export const analyzeEvent = (event: any, hasConsent: boolean): Event => {
  const actualParams = Array.isArray(event.actualParams) ? event.actualParams : [];
  const validation = validateEventParameters(event.name, actualParams);
  const dataType = assessDataType('', event.name, actualParams);
  const isBeforeConsent = event?.isBeforeConsent === true;
  const violationSeverity = assessViolationSeverity(
    hasConsent,
    dataType,
    false,
    'event',
    isBeforeConsent,
  );
  const legalRisk = calculateLegalRisk(violationSeverity, event.name, dataType);

  return {
    name: event.name,
    origin: event.origin || 'Fonte técnica não informada',
    parameters: event.parameters || actualParams.join(', '),
    url: event.url,
    category: event.category || 'unknown',
    validation,
    actualParams,
    dataType,
    hasConsent,
    violationSeverity,
    legalRisk,
    description: event.description,
  };
};
