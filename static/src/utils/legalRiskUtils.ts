
import { ViolationRisk, LegalSummary } from '@/types/audit';

export const calculateLegalRisk = (
  severity: 'ok' | 'medium' | 'high' | 'critical', 
  scriptName: string,
  dataType: 'simple' | 'sensitive' | 'none'
) => {
  const baseRiskLevels = {
    critical: {
      level: 'critical' as const,
      baseRange: { min: 5000, max: 50000 },
      descriptions: {
        ua: 'Tecnologia obsoleta coletando dados sem base legal atualizada',
        sensitive: 'Coleta de dados sensíveis sem consentimento específico - violação direta à LGPD',
        beforeConsent: 'Scripts de tracking ativados antes do consentimento do usuário'
      }
    },
    high: {
      level: 'high' as const,
      baseRange: { min: 1000, max: 10000 },
      descriptions: {
        personal: 'Uso indevido de dados pessoais sem consentimento adequado',
        incomplete: 'Implementação inadequada de parâmetros obrigatórios para tracking'
      }
    },
    medium: {
      level: 'medium' as const,
      baseRange: { min: 500, max: 2000 },
      descriptions: {
        organization: 'Desorganização de scripts pode indicar falta de controle sobre dados',
        positioning: 'Posicionamento inadequado de scripts de tracking'
      }
    }
  };

  switch (severity) {
    case 'critical':
      const criticalRange = baseRiskLevels.critical.baseRange;
      let description = baseRiskLevels.critical.descriptions.sensitive;
      
      if (scriptName.toLowerCase().includes('universal analytics')) {
        description = baseRiskLevels.critical.descriptions.ua;
      } else if (dataType === 'sensitive') {
        description = baseRiskLevels.critical.descriptions.sensitive;
      } else {
        description = baseRiskLevels.critical.descriptions.beforeConsent;
      }
      
      return {
        level: 'critical' as const,
        estimatedFine: `R$ ${criticalRange.min.toLocaleString('pt-BR')} ~ R$ ${criticalRange.max.toLocaleString('pt-BR')}`,
        description
      };
      
    case 'high':
      const highRange = baseRiskLevels.high.baseRange;
      return {
        level: 'high' as const,
        estimatedFine: `R$ ${highRange.min.toLocaleString('pt-BR')} ~ R$ ${highRange.max.toLocaleString('pt-BR')}`,
        description: baseRiskLevels.high.descriptions.personal
      };
      
    case 'medium':
      const mediumRange = baseRiskLevels.medium.baseRange;
      return {
        level: 'medium' as const,
        estimatedFine: `R$ ${mediumRange.min.toLocaleString('pt-BR')} ~ R$ ${mediumRange.max.toLocaleString('pt-BR')}`,
        description: baseRiskLevels.medium.descriptions.organization
      };
      
    default:
      return {
        level: 'none' as const,
        estimatedFine: '—',
        description: 'Em conformidade com LGPD - coleta realizada após consentimento adequado'
      };
  }
};

export const generateLegalSummary = (violationRisks: ViolationRisk[], hasUA: boolean): LegalSummary => {
  const criticalCount = violationRisks.filter(r => r.severity === 'critical').length;
  const highCount = violationRisks.filter(r => r.severity === 'high').length;
  const mediumCount = violationRisks.filter(r => r.severity === 'medium').length;

  let dataCollectionSeverity: 'ok' | 'medium' | 'high' | 'critical' = 'ok';
  let proofOfDamage: 'none' | 'presumed' | 'proven' | 'material' = 'none';
  let totalRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  let estimatedTotalFine = '—';

  // Determine overall severity
  if (criticalCount > 0 || hasUA) {
    dataCollectionSeverity = 'critical';
    proofOfDamage = 'presumed';
    totalRiskLevel = 'critical';
    
    // Calculate fine range based on number of violations
    const baseFine = criticalCount * 15000 + (hasUA ? 25000 : 0);
    const minFine = Math.max(baseFine * 0.5, 10000);
    const maxFine = baseFine * 2;
    estimatedTotalFine = `R$ ${minFine.toLocaleString('pt-BR')} ~ R$ ${maxFine.toLocaleString('pt-BR')}+`;
    
  } else if (highCount > 0) {
    dataCollectionSeverity = 'high';
    proofOfDamage = 'presumed';
    totalRiskLevel = 'high';
    
    const baseFine = highCount * 5000;
    const minFine = Math.max(baseFine * 0.8, 2000);
    const maxFine = baseFine * 1.5;
    estimatedTotalFine = `R$ ${minFine.toLocaleString('pt-BR')} ~ R$ ${maxFine.toLocaleString('pt-BR')}`;
    
  } else if (mediumCount > 0) {
    dataCollectionSeverity = 'medium';
    proofOfDamage = 'none';
    totalRiskLevel = 'medium';
    
    const baseFine = mediumCount * 1000;
    const minFine = Math.max(baseFine * 0.5, 500);
    const maxFine = baseFine * 2;
    estimatedTotalFine = `R$ ${minFine.toLocaleString('pt-BR')} ~ R$ ${maxFine.toLocaleString('pt-BR')}`;
  }

  return {
    dataCollectionSeverity,
    proofOfDamage,
    companySize: 'medium', // This could be made dynamic based on domain analysis
    totalRiskLevel,
    estimatedTotalFine
  };
};
