
import * as XLSX from 'xlsx';
import { AuditResult } from '@/types/audit';

export const exportToXLSX = (auditResult: AuditResult, url: string) => {
  // Legal Summary Data
  const legalSummaryData = [{
    'Gravidade da Coleta': auditResult.legalSummary.dataCollectionSeverity === 'critical' ? '🔴 Crítico' :
                           auditResult.legalSummary.dataCollectionSeverity === 'high' ? '🟠 Alto' :
                           auditResult.legalSummary.dataCollectionSeverity === 'medium' ? '🟡 Médio' : '🟢 OK',
    'Prova de Dano': auditResult.legalSummary.proofOfDamage === 'material' ? '🔴 Dano Material' :
                     auditResult.legalSummary.proofOfDamage === 'proven' ? '🟠 Dano Comprovado' :
                     auditResult.legalSummary.proofOfDamage === 'presumed' ? '🟡 Dano Presumido' : '🟢 Sem Dano',
    'Porte da Empresa': auditResult.legalSummary.companySize === 'large' ? '🏢 Grande Porte' :
                        auditResult.legalSummary.companySize === 'medium' ? '🏬 Médio Porte' : '🏪 Pequeno Porte',
    'Risco Total': auditResult.legalSummary.totalRiskLevel === 'critical' ? '🔴 Crítico' :
                   auditResult.legalSummary.totalRiskLevel === 'high' ? '🟠 Alto' :
                   auditResult.legalSummary.totalRiskLevel === 'medium' ? '🟡 Médio' : '🟢 Baixo',
    'Indenização Estimada': auditResult.legalSummary.estimatedTotalFine,
    'Total de Códigos': auditResult.summary.totalCodes,
    'Códigos Antes do GTM': auditResult.summary.codesBeforeGTM,
    'Códigos Após GTM': auditResult.summary.codesAfterGTM,
    'Total de Eventos': auditResult.summary.totalEvents,
    'Universal Analytics Detectado': auditResult.summary.uaDetected ? 'Sim ⚠️' : 'Não ✅',
    'Posição GTM': auditResult.gtmPosition,
    'Violações Críticas': auditResult.summary.criticalViolations,
    'Violações Altas': auditResult.summary.highViolations,
    'Violações Médias': auditResult.summary.mediumViolations
  }];

  // Violation Risks Data
  const violationRisksData = auditResult.violationRisks.map(risk => ({
    'Evento/Tag': risk.eventName,
    'Tipo de Dado': risk.dataType,
    'Consentimento Dado': risk.hasConsent ? 'Sim ✅' : 'Não ❌',
    'Gravidade': risk.severity === 'critical' ? '🔴 Crítico' :
                 risk.severity === 'high' ? '🟠 Alto' :
                 risk.severity === 'medium' ? '🟡 Médio' : '🟢 OK',
    'Risco Legal': risk.legalRisk,
    'Indenização Estimada': risk.potentialFine,
    'Descrição': risk.description
  }));

  const embedCodesData = auditResult.embedCodes.map(code => ({
    'Nome': code.name,
    'Tipo': code.type,
    'Categoria': code.type === 'consent' ? 'Consentimento' : code.type === 'tag_manager' ? 'Tag Manager' : 'Tracking',
    'Posição': code.position,
    'Status GTM': code.isBeforeGTM ? 'Antes do GTM' : 'Depois do GTM',
    'Compliance LGPD': code.lgpdCompliance === 'compliant' ? '✅ Conforme' : 
                       code.lgpdCompliance === 'warning' ? '⚠️ Atenção' : '❌ Violação',
    'Mensagem Compliance': code.complianceMessage || '',
    'Gravidade da Violação': code.violationSeverity === 'critical' ? '🔴 Crítico' :
                             code.violationSeverity === 'high' ? '🟠 Alto' :
                             code.violationSeverity === 'medium' ? '🟡 Médio' : '🟢 OK',
    'Tipo de Dado': code.dataType === 'sensitive' ? 'Dados Sensíveis' :
                    code.dataType === 'simple' ? 'Dados Pessoais' : 'Outros',
    'Risco Legal Estimado': code.legalRisk?.estimatedFine || '—',
    'Severidade': code.severity === 'ok' ? '✅ OK' : code.severity === 'warning' ? '⚠️ Atenção' : '❌ Problema',
    'Código': code.code
  }));

  const eventsData = auditResult.events.map(event => ({
    'Nome do Evento': event.name,
    'Categoria': event.category,
    'Origem': event.origin,
    'Parâmetros Atuais': event.parameters,
    'Status Validação': event.validation?.status === 'complete' ? '✅ Completo' :
                        event.validation?.status === 'incomplete' ? '❌ Incompleto' : '⚠️ Inválido',
    'Parâmetros Faltantes': event.validation?.missingParams.join(', ') || 'Nenhum',
    'Parâmetros Extras': event.validation?.extraParams.join(', ') || 'Nenhum',
    'Mensagem': event.validation?.validationMessage || 'N/A',
    'Tipo de Dado': event.dataType === 'sensitive' ? 'Dados Sensíveis' :
                    event.dataType === 'simple' ? 'Dados Pessoais' : 'Outros',
    'Consentimento': event.hasConsent ? 'Sim ✅' : 'Não ❌',
    'Gravidade da Violação': event.violationSeverity === 'critical' ? '🔴 Crítico' :
                             event.violationSeverity === 'high' ? '🟠 Alto' :
                             event.violationSeverity === 'medium' ? '🟡 Médio' : '🟢 OK',
    'URL': event.url
  }));

  const uaData = auditResult.universalAnalytics.map(ua => ({
    'Nome': ua.name,
    'Tipo': ua.type,
    'Posição': ua.position,
    'Código': ua.code,
    'Parâmetros': ua.parameters.join(', '),
    'Status': '❌ OBSOLETO - Descontinuado em 2023',
    'Risco Legal': 'Alto - Tecnologia obsoleta coletando dados'
  }));

  const improvementsData = auditResult.improvements.map(improvement => ({
    'Categoria': improvement.category,
    'Problema': improvement.issue,
    'Recomendação': improvement.recommendation,
    'Prioridade': improvement.priority === 'high' ? '🔴 Alta' :
                  improvement.priority === 'medium' ? '🟡 Média' : '🟢 Baixa'
  }));

  const wb = XLSX.utils.book_new();
  
  // Create worksheets
  const wsLegalSummary = XLSX.utils.json_to_sheet(legalSummaryData);
  const wsViolationRisks = XLSX.utils.json_to_sheet(violationRisksData);
  const wsEmbeds = XLSX.utils.json_to_sheet(embedCodesData);
  const wsEvents = XLSX.utils.json_to_sheet(eventsData);
  const wsImprovements = XLSX.utils.json_to_sheet(improvementsData);

  // Add sheets to workbook
  XLSX.utils.book_append_sheet(wb, wsLegalSummary, 'Resumo Legal');
  XLSX.utils.book_append_sheet(wb, wsViolationRisks, 'Riscos e Violações');
  XLSX.utils.book_append_sheet(wb, wsEmbeds, 'Códigos Embed');
  XLSX.utils.book_append_sheet(wb, wsEvents, 'Eventos e Parâmetros');
  XLSX.utils.book_append_sheet(wb, wsImprovements, 'Sugestões de Melhoria');

  if (auditResult.universalAnalytics.length > 0) {
    const wsUA = XLSX.utils.json_to_sheet(uaData);
    XLSX.utils.book_append_sheet(wb, wsUA, 'Universal Analytics');
  }

  const fileName = `laudo_juridico_lgpd_${url.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return fileName;
};
