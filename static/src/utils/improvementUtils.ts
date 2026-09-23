
import { Improvement, EmbedCode, Event } from '@/types/audit';

export const generateImprovements = (
  embedCodes: EmbedCode[], 
  events: Event[], 
  hasUA: boolean,
  gtmPosition: number
): Improvement[] => {
  const improvements: Improvement[] = [];

  // GTM positioning issues
  const codesBeforeGTM = embedCodes.filter(code => code.isBeforeGTM && code.type !== 'consent').length;
  if (codesBeforeGTM > 0) {
    improvements.push({
      category: 'Organização de Tags',
      issue: `${codesBeforeGTM} códigos de tracking posicionados antes do GTM`,
      recommendation: 'Mover todos os códigos de tracking para dentro do Google Tag Manager para melhor controle e compliance',
      priority: 'high'
    });
  }

  // Universal Analytics
  if (hasUA) {
    improvements.push({
      category: 'Compliance Técnico',
      issue: 'Universal Analytics detectado (descontinuado em julho/2023)',
      recommendation: 'Migrar urgentemente para Google Analytics 4 - UA não recebe mais dados e representa risco legal',
      priority: 'high'
    });
  }

  // Consent management
  const hasConsentScript = embedCodes.some(code => code.type === 'consent');
  if (!hasConsentScript) {
    improvements.push({
      category: 'LGPD Compliance',
      issue: 'Nenhum sistema de gerenciamento de consentimento detectado',
      recommendation: 'Implementar Cookiebot, OneTrust ou Termly para compliance com LGPD',
      priority: 'high'
    });
  }

  // Critical violations
  const criticalViolations = embedCodes.filter(code => code.violationSeverity === 'critical').length;
  if (criticalViolations > 0) {
    improvements.push({
      category: 'Risco Legal',
      issue: `${criticalViolations} violações críticas de LGPD detectadas`,
      recommendation: 'Implementar bloqueio de scripts até obtenção de consentimento válido',
      priority: 'high'
    });
  }

  // Event validation issues
  const incompleteEvents = events.filter(event => event.validation?.status === 'incomplete').length;
  if (incompleteEvents > 0) {
    improvements.push({
      category: 'Qualidade dos Dados',
      issue: `${incompleteEvents} eventos com parâmetros obrigatórios faltantes`,
      recommendation: 'Revisar implementação dos eventos GA4 para garantir todos os parâmetros obrigatórios',
      priority: 'medium'
    });
  }

  // Data organization
  const advertisingScripts = embedCodes.filter(code => code.type === 'advertising').length;
  if (advertisingScripts > 2) {
    improvements.push({
      category: 'Organização de Dados',
      issue: `${advertisingScripts} scripts de publicidade diferentes detectados`,
      recommendation: 'Considerar centralizar tracking publicitário via GTM para melhor controle',
      priority: 'medium'
    });
  }

  return improvements;
};
