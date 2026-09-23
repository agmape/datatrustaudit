
import { ViolationRisk, EmbedCode, Event } from '@/types/audit';

export const generateViolationRisks = (embedCodes: EmbedCode[], events: Event[]): ViolationRisk[] => {
  const violations: ViolationRisk[] = [];

  // Analyze embed codes
  embedCodes.forEach(code => {
    if (code.violationSeverity && code.violationSeverity !== 'ok') {
      const dataTypeLabel = code.dataType === 'sensitive' ? 'Dados sensíveis' :
                           code.dataType === 'simple' ? 'Dados pessoais simples' : 'Outros dados';

      violations.push({
        eventName: code.name,
        dataType: dataTypeLabel,
        hasConsent: !code.isBeforeConsent || false,
        severity: code.violationSeverity,
        legalRisk: code.legalRisk?.description || 'Risco não avaliado',
        potentialFine: code.legalRisk?.estimatedFine || '—',
        description: code.violationMessage || 'Violação detectada sem descrição específica'
      });
    }
  });

  // Analyze events
  events.forEach(event => {
    if (event.violationSeverity && event.violationSeverity !== 'ok') {
      const dataTypeLabel = event.dataType === 'sensitive' ? 'Dados sensíveis' :
                           event.dataType === 'simple' ? 'Dados pessoais simples' : 'Outros dados';

      violations.push({
        eventName: `Evento: ${event.name}`,
        dataType: dataTypeLabel,
        hasConsent: event.hasConsent,
        severity: event.violationSeverity,
        legalRisk: event.legalRisk?.description || 'Evento com parâmetros inadequados',
        potentialFine: event.legalRisk?.estimatedFine || '—',
        description: event.validation?.validationMessage || 'Evento com problemas de implementação'
      });
    }
  });

  return violations;
};
