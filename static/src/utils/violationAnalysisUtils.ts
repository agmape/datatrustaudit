import { ViolationRisk, EmbedCode, Event } from '@/types/audit';

/**
 * Backwards-compatible adapter. The historical type is named ViolationRisk,
 * but values produced here are technical risk indicators, not legal findings.
 */
export const generateViolationRisks = (
  embedCodes: EmbedCode[],
  events: Event[],
): ViolationRisk[] => {
  const indicators: ViolationRisk[] = [];

  embedCodes.forEach((code) => {
    if (code.violationSeverity && code.violationSeverity !== 'ok') {
      const dataTypeLabel =
        code.dataType === 'sensitive'
          ? 'Possível dado sensível'
          : code.dataType === 'simple'
            ? 'Possível dado pessoal'
            : 'Tipo não determinado';

      indicators.push({
        eventName: code.name,
        dataType: dataTypeLabel,
        hasConsent: code.isBeforeConsent === false,
        severity: code.violationSeverity,
        legalRisk: code.legalRisk?.description || 'Requer verificação manual',
        potentialFine: 'Não estimável por scanner externo',
        description:
          code.violationMessage ||
          'Indicador técnico observado; não constitui determinação jurídica.',
      });
    }
  });

  events.forEach((event) => {
    if (event.violationSeverity && event.violationSeverity !== 'ok') {
      const dataTypeLabel =
        event.dataType === 'sensitive'
          ? 'Possível dado sensível'
          : event.dataType === 'simple'
            ? 'Possível dado pessoal'
            : 'Tipo não determinado';

      indicators.push({
        eventName: `Evento: ${event.name}`,
        dataType: dataTypeLabel,
        hasConsent: event.hasConsent,
        severity: event.violationSeverity,
        legalRisk: event.legalRisk?.description || 'Requer verificação manual',
        potentialFine: 'Não estimável por scanner externo',
        description:
          event.validation?.validationMessage ||
          'Indicador técnico de implementação; não constitui determinação jurídica.',
      });
    }
  });

  return indicators;
};
