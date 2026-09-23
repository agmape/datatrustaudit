import { Improvement, EmbedCode, Event } from '@/types/audit';

export const generateImprovements = (
  embedCodes: EmbedCode[],
  events: Event[],
  hasUA: boolean,
  _gtmPosition: number,
): Improvement[] => {
  const improvements: Improvement[] = [];

  const codesBeforeGTM = embedCodes.filter(
    (code) => code.isBeforeGTM && code.type !== 'consent',
  ).length;
  if (codesBeforeGTM > 0) {
    improvements.push({
      category: 'Organização de Tags',
      issue: `${codesBeforeGTM} integrações aparecem antes do GTM na ordem observada`,
      recommendation:
        'Revisar se a ordem é intencional e centralizar tags no GTM quando isso melhorar governança e controle.',
      priority: 'medium',
    });
  }

  if (hasUA) {
    improvements.push({
      category: 'Qualidade Técnica',
      issue: 'Universal Analytics legado detectado',
      recommendation:
        'Remover ou migrar o código legado para uma implementação atual. A presença de UA é um problema técnico, não prova automática de infração legal.',
      priority: 'high',
    });
  }

  const hasConsentScript = embedCodes.some((code) => code.type === 'consent');
  if (!hasConsentScript) {
    improvements.push({
      category: 'Privacidade',
      issue: 'Nenhum CMP conhecido foi observado neste fluxo de análise',
      recommendation:
        'Verificar manualmente a base legal e o mecanismo de consentimento aplicável. Se consentimento for necessário, implementar uma CMP adequada.',
      priority: 'high',
    });
  }

  const highPriorityIndicators = embedCodes.filter(
    (code) => code.violationSeverity === 'critical' || code.violationSeverity === 'high',
  ).length;
  if (highPriorityIndicators > 0) {
    improvements.push({
      category: 'Risco Técnico',
      issue: `${highPriorityIndicators} indicadores técnicos de alta prioridade`,
      recommendation:
        'Revisar a evidência associada e confirmar contexto, consentimento/base legal e ordem de disparo antes de concluir conformidade.',
      priority: 'high',
    });
  }

  const incompleteEvents = events.filter(
    (event) => event.validation?.status === 'incomplete',
  ).length;
  if (incompleteEvents > 0) {
    improvements.push({
      category: 'Qualidade dos Dados',
      issue: `${incompleteEvents} eventos com parâmetros esperados ausentes`,
      recommendation:
        'Revisar a implementação dos eventos e confirmar os requisitos do evento no contexto real de negócio.',
      priority: 'medium',
    });
  }

  return improvements;
};
