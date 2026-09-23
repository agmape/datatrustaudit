import { ViolationRisk, LegalSummary } from '@/types/audit';

const NON_ESTIMABLE =
  'Não estimável por scanner externo. Sanções dependem de fatos, contexto jurídico, atuação da ANPD e informações não observáveis tecnicamente.';

export const calculateLegalRisk = (
  severity: 'ok' | 'medium' | 'high' | 'critical',
  scriptName: string,
  dataType: 'simple' | 'sensitive' | 'none',
) => {
  if (severity === 'ok') {
    return {
      level: 'none' as const,
      estimatedFine: '—',
      description: 'Nenhum indicador técnico prioritário foi identificado neste item.',
    };
  }

  const label =
    severity === 'critical'
      ? 'Indicador técnico crítico'
      : severity === 'high'
        ? 'Indicador técnico de alta prioridade'
        : 'Indicador técnico de média prioridade';

  const detail = dataType === 'sensitive'
    ? 'Há sinal técnico compatível com possível tratamento de categoria sensível; classificação e base legal exigem verificação manual.'
    : `${scriptName}: requer revisão técnica e jurídica contextual. O scanner não determina ilicitude.`;

  return {
    level: severity,
    estimatedFine: NON_ESTIMABLE,
    description: `${label}. ${detail}`,
  };
};

export const generateLegalSummary = (
  violationRisks: ViolationRisk[],
  hasUA: boolean,
): LegalSummary => {
  const criticalCount = violationRisks.filter((r) => r.severity === 'critical').length;
  const highCount = violationRisks.filter((r) => r.severity === 'high').length;
  const mediumCount = violationRisks.filter((r) => r.severity === 'medium').length;

  let dataCollectionSeverity: 'ok' | 'medium' | 'high' | 'critical' = 'ok';
  let totalRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

  if (criticalCount > 0) {
    dataCollectionSeverity = 'critical';
    totalRiskLevel = 'critical';
  } else if (highCount > 0) {
    dataCollectionSeverity = 'high';
    totalRiskLevel = 'high';
  } else if (mediumCount > 0 || hasUA) {
    dataCollectionSeverity = 'medium';
    totalRiskLevel = 'medium';
  }

  return {
    dataCollectionSeverity,
    proofOfDamage: 'none',
    companySize: 'unknown',
    totalRiskLevel,
    estimatedTotalFine: NON_ESTIMABLE,
  };
};
