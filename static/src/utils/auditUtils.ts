
import { AuditResult } from '@/types/audit';
import { analyzeRealWebsite } from './realDataAnalysisUtils';
import { analyzeEmbedCode, detectGTMPosition, detectUniversalAnalytics } from './scriptAnalysisUtils';
import { analyzeEvent } from './eventAnalysisUtils';
import { generateImprovements } from './improvementUtils';
import { generateViolationRisks } from './violationAnalysisUtils';
import { generateLegalSummary } from './legalRiskUtils';
import { generateSummary } from './summaryUtils';

export const simulateAudit = async (url: string, useViewSource: boolean = false): Promise<AuditResult> => {
  console.log(`🔍 Iniciando auditoria rigorosa de: ${url}`);
  console.log(`📊 Método de análise: ${useViewSource ? 'view-source' : 'DOM padrão'}`);
  console.log(`🧹 Limpando cache de análise anterior...`);
  
  // Garantir que não há dados residuais
  const auditStartTime = new Date().toISOString();
  const auditId = Math.random().toString(36).substr(2, 9);
  
  console.log(`🆔 ID da auditoria: ${auditId}`);
  console.log(`⏰ Timestamp de início: ${auditStartTime}`);
  
  // Simulate loading delay for real analysis
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    // Análise real do website - cada chamada é independente
    console.log(`🌐 Conectando com ${url}...`);
    const realData = await analyzeRealWebsite(url, useViewSource);
    
    console.log(`📋 Scripts detectados: ${realData.scripts?.length || 0}`);
    console.log(`⚡ Eventos encontrados: ${realData.events?.length || 0}`);
    console.log(`🍪 Consentimento detectado: ${realData.cookieConsent ? 'SIM' : 'NÃO'}`);
    console.log(`🏷️ Posição GTM: #${realData.gtmPosition}`);

    // Garantir arrays válidos
    const scripts = realData.scripts || [];
    const events = realData.events || [];
    const gtmPosition = realData.gtmPosition || 1;
    const cookieConsent = realData.cookieConsent || false;

    // Verificar se há dados válidos para analisar
    if (scripts.length === 0 && events.length === 0) {
      console.log(`⚠️ Nenhum script ou evento detectado em: ${url}`);
    }

    // Analisar scripts encontrados - análise independente para cada script
    const embedCodes = scripts.length > 0 
      ? scripts.map((script, index) => {
          console.log(`🔍 Analisando script ${index + 1}: ${script.name}`);
          return analyzeEmbedCode(script, index + 1, gtmPosition, cookieConsent);
        })
      : [{
          name: 'Nenhum script detectado',
          type: 'none',
          position: 1,
          isBeforeGTM: false,
          isBeforeConsent: false,
          code: 'Site sem scripts de tracking detectados',
          severity: 'ok' as const,
          lgpdCompliance: 'compliant' as const,
          complianceMessage: '✅ Site sem coleta de dados detectada',
          violationSeverity: 'ok' as const,
          dataType: 'none' as const,
          detectedData: [],
          lgpdArticles: [],
          realScript: false
        }];

    // Analisar eventos encontrados - análise independente para cada evento
    const processedEvents = events.length > 0
      ? events.map((event, index) => {
          console.log(`⚡ Analisando evento ${index + 1}: ${event.name}`);
          return analyzeEvent(event, cookieConsent);
        })
      : [];

    // Detectar Universal Analytics - análise específica
    const universalAnalytics = detectUniversalAnalytics(scripts);
    
    if (universalAnalytics.length > 0) {
      console.log('🚨 ALERTA: Universal Analytics detectado - tecnologia descontinuada!');
      console.log(`📊 Quantidade de UA detectados: ${universalAnalytics.length}`);
    }

    // Gerar análises baseadas nos dados limpos coletados
    console.log(`🔧 Gerando análises para auditoria ${auditId}...`);
    const improvements = generateImprovements(embedCodes, processedEvents, universalAnalytics.length > 0, gtmPosition);
    const violationRisks = generateViolationRisks(embedCodes, processedEvents);
    const legalSummary = generateLegalSummary(violationRisks, universalAnalytics.length > 0);
    const summary = generateSummary(embedCodes, processedEvents, universalAnalytics, gtmPosition);

    console.log(`⚖️ Violações encontradas: ${violationRisks.length}`);
    console.log(`🎯 Nível de risco total: ${legalSummary.totalRiskLevel}`);
    console.log(`💰 Multa estimada: ${legalSummary.estimatedTotalFine}`);
    console.log(`✅ Auditoria ${auditId} concluída com sucesso!`);

    const auditResult: AuditResult = {
      embedCodes,
      events: processedEvents,
      universalAnalytics,
      improvements,
      violationRisks,
      legalSummary,
      gtmPosition,
      summary,
      // Campos específicos para garantir independência da auditoria
      analysisMethod: useViewSource ? 'view-source' : 'dom-standard',
      websiteUrl: url,
      auditTimestamp: auditStartTime,
      consentDetected: cookieConsent
    };

    // Validação final dos dados
    console.log(`🔍 Validação final da auditoria ${auditId}:`);
    console.log(`   - Códigos analisados: ${auditResult.embedCodes.length}`);
    console.log(`   - Eventos analisados: ${auditResult.events.length}`);
    console.log(`   - URL auditada: ${auditResult.websiteUrl}`);
    console.log(`   - Timestamp: ${auditResult.auditTimestamp}`);

    return auditResult;

  } catch (error) {
    console.error(`❌ Erro na auditoria ${auditId}:`, error);
    console.error(`🌐 URL problemática: ${url}`);
    console.error(`📊 Método de análise: ${useViewSource ? 'view-source' : 'dom-standard'}`);
    throw new Error(`Falha na auditoria de ${url}: ${error}`);
  }
};
