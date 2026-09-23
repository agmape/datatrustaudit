import { EmbedCode } from '@/types/audit';
import { assessLGPDCompliance, calculateRealFine } from './lgpdComplianceUtils';

export const analyzeEmbedCode = (
  script: any, 
  position: number, 
  gtmPosition: number, 
  hasConsent: boolean
): EmbedCode => {
  const isBeforeGTM = position < gtmPosition;
  const isBeforeConsent = !hasConsent || position <= 1;
  
  // Análise crítica de compliance LGPD
  const compliance = assessLGPDCompliance(script, hasConsent);
  
  // Classificação rigorosa de severidade
  let violationSeverity: 'ok' | 'medium' | 'high' | 'critical' = 'ok';
  let lgpdCompliance: 'compliant' | 'violation' | 'warning' = 'compliant';
  
  if (compliance.severity === 'critical') {
    violationSeverity = 'critical';
    lgpdCompliance = 'violation';
  } else if (compliance.severity === 'high') {
    violationSeverity = 'high';
    lgpdCompliance = 'violation';
  } else if (compliance.severity === 'medium') {
    violationSeverity = 'medium';
    lgpdCompliance = 'warning';
  }
  
  // Universal Analytics é sempre crítico
  if (script.type === 'universal_analytics') {
    violationSeverity = 'critical';
    lgpdCompliance = 'violation';
    compliance.violations.push('🔴 CRÍTICO: Universal Analytics descontinuado (Jul/2023)');
  }
  
  // Calcular multa realista
  const fineCalculation = calculateRealFine(
    violationSeverity, 
    'medium', // Assumir empresa média
    script.dataCollected || []
  );
  
  const complianceMessage = compliance.violations.length > 0 
    ? compliance.violations[0] 
    : '✅ Em conformidade com LGPD';
    
  const violationMessage = compliance.violations.length > 1 
    ? compliance.violations.slice(1).join(' • ')
    : compliance.dataIssues.join(' • ');

  return {
    name: script.name,
    type: script.type,
    position,
    isBeforeGTM,
    isBeforeConsent,
    code: script.code || 'Código não detectado',
    severity: violationSeverity === 'ok' ? 'ok' : violationSeverity === 'medium' ? 'warning' : 'error',
    lgpdCompliance,
    complianceMessage,
    violationSeverity,
    violationMessage,
    dataType: assessRealDataType(script),
    legalRisk: {
      level: violationSeverity === 'ok' ? 'none' : violationSeverity,
      estimatedFine: fineCalculation.range,
      description: compliance.violations[0] || 'Script em conformidade'
    },
    // Novos campos para auditoria rigorosa
    detectedData: Array.isArray(script.dataCollected) ? script.dataCollected : [],
    lgpdArticles: Array.isArray(compliance.lgpdArticles) ? compliance.lgpdArticles : [],
    scriptAnalysis: analyzeScriptCode(script.code || ''),
    realScript: script.realScript || false
  };
};

const assessRealDataType = (script: any): 'simple' | 'sensitive' | 'none' => {
  if (!script.dataCollected) return 'none';
  
  const sensitivePatterns = ['email', 'telefone', 'geolocalização', 'dados sensíveis', 'CPF', 'RG'];
  const simplePatterns = ['IP', 'navegação', 'sessão', 'página'];
  
  const dataString = Array.isArray(script.dataCollected) 
    ? script.dataCollected.join(' ').toLowerCase()
    : script.dataCollected.toLowerCase();
  
  if (sensitivePatterns.some(pattern => dataString.includes(pattern.toLowerCase()))) {
    return 'sensitive';
  }
  
  if (simplePatterns.some(pattern => dataString.includes(pattern.toLowerCase()))) {
    return 'simple';
  }
  
  return 'none';
};

const analyzeScriptCode = (code: string) => {
  const issues: string[] = [];
  const dataPoints: string[] = [];
  
  // Análise do código do script
  if (code.includes('user_id') || code.includes('client_id')) {
    issues.push('Identificação persistente detectada');
    dataPoints.push('ID do usuário');
  }
  
  if (code.includes('email') || code.includes('@')) {
    issues.push('Email detectado no código');
    dataPoints.push('Endereço de email');
  }
  
  if (code.includes('phone') || code.includes('telefone')) {
    issues.push('Telefone detectado no código');
    dataPoints.push('Número de telefone');
  }
  
  if (code.includes('geolocation') || code.includes('coords')) {
    issues.push('Geolocalização detectada');
    dataPoints.push('Localização precisa');
  }
  
  if (code.includes('facebook.net') || code.includes('fbq')) {
    issues.push('Compartilhamento com Facebook');
    dataPoints.push('Dados enviados para Facebook');
  }
  
  return {
    issues,
    dataPoints,
    codeLength: code.length,
    hasExternalCalls: code.includes('https://') || code.includes('http://'),
    isMinified: code.length > 500 && !code.includes('\n')
  };
};

export const detectGTMPosition = (scripts: any[]): number => {
  if (!scripts || !Array.isArray(scripts)) {
    return 1;
  }
  
  const gtmIndex = scripts.findIndex(script => 
    script && (
      script.type === 'tag_manager' || 
      (script.name && script.name.toLowerCase().includes('tag manager'))
    )
  );
  return gtmIndex >= 0 ? gtmIndex + 1 : scripts.length + 1;
};

export const detectUniversalAnalytics = (scripts: any[]) => {
  if (!scripts || !Array.isArray(scripts)) {
    return [];
  }
  
  return scripts
    .filter(script => script && script.type === 'universal_analytics')
    .map((script, index) => ({
      name: script.name || 'Universal Analytics',
      type: script.type,
      code: script.code || '',
      position: index + 1,
      parameters: ['_gaq', '_ga', '_gid', 'collect', 'analytics.js']
    }));
};
