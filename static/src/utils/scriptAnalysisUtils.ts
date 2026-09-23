import { EmbedCode } from '@/types/audit';
import { assessLGPDCompliance, calculateRealFine } from './lgpdComplianceUtils';

export const analyzeEmbedCode = (
  script: any,
  position: number,
  gtmPosition: number,
  hasConsent: boolean,
): EmbedCode => {
  const isBeforeGTM = gtmPosition > 0 && position < gtmPosition;
  const isBeforeConsent = script?.isBeforeConsent === true;

  const compliance = assessLGPDCompliance(script, hasConsent);

  let violationSeverity: 'ok' | 'medium' | 'high' | 'critical' = 'ok';
  if (compliance.severity === 'critical') violationSeverity = 'critical';
  else if (compliance.severity === 'high') violationSeverity = 'high';
  else if (compliance.violations.length > 0 || compliance.dataIssues.length > 0) violationSeverity = 'medium';

  // UA is a deprecated technical implementation. Deprecation alone is not
  // proof of an LGPD violation.
  if (script.type === 'universal_analytics' && violationSeverity === 'ok') {
    violationSeverity = 'medium';
    compliance.violations.push(
      'Indicador técnico: Universal Analytics é tecnologia descontinuada e deve ser removida/migrada.',
    );
  }

  const dataType = assessRealDataType(script);
  const fineCalculation = calculateRealFine(
    violationSeverity,
    'unknown',
    script.dataCollected || [],
  );

  const hasIndicators = compliance.violations.length > 0 || compliance.dataIssues.length > 0;

  return {
    name: script.name || 'Script não identificado',
    type: script.type || 'unknown',
    position,
    isBeforeGTM,
    isBeforeConsent,
    code: script.code || 'Código não disponível',
    severity: violationSeverity === 'ok' ? 'ok' : violationSeverity === 'medium' ? 'warning' : 'error',
    lgpdCompliance: hasIndicators ? 'warning' : 'compliant',
    complianceMessage: hasIndicators
      ? compliance.violations[0] || compliance.dataIssues[0]
      : 'Nenhum indicador técnico de privacidade identificado neste item.',
    violationSeverity,
    violationMessage: [...compliance.violations.slice(1), ...compliance.dataIssues].join(' • '),
    dataType,
    legalRisk: {
      level: violationSeverity === 'ok' ? 'none' : violationSeverity,
      estimatedFine: fineCalculation.range,
      description:
        compliance.violations[0] ||
        compliance.dataIssues[0] ||
        'Nenhum indicador técnico prioritário identificado.',
    },
    detectedData: Array.isArray(script.dataCollected) ? script.dataCollected : [],
    lgpdArticles: Array.isArray(compliance.lgpdArticles) ? compliance.lgpdArticles : [],
    scriptAnalysis: analyzeScriptCode(script.code || ''),
    realScript: script.realScript === true,
  };
};

const assessRealDataType = (script: any): 'simple' | 'sensitive' | 'none' => {
  const values = Array.isArray(script?.dataCollected) ? script.dataCollected : [];
  const dataString = values.join(' ').toLowerCase();

  const sensitivePatterns = [
    'saúde', 'health', 'biometr', 'genét', 'genetic', 'relig',
    'opinião política', 'political opinion', 'origem racial', 'racial',
    'vida sexual', 'sexual', 'sindical', 'union membership',
  ];
  const personalPatterns = [
    'email', 'e-mail', 'telefone', 'phone', 'cpf', 'rg', 'ip address',
    'endereço ip', 'user id', 'client id', 'identificador',
  ];

  if (sensitivePatterns.some((pattern) => dataString.includes(pattern))) return 'sensitive';
  if (personalPatterns.some((pattern) => dataString.includes(pattern))) return 'simple';
  return 'none';
};

const analyzeScriptCode = (code: string) => {
  const issues: string[] = [];
  const dataPoints: string[] = [];

  if (code.includes('user_id') || code.includes('client_id')) {
    issues.push('Identificador persistente referenciado no código');
    dataPoints.push('Identificador de usuário/cliente');
  }
  if (code.includes('email') || code.includes('@')) {
    issues.push('Referência a e-mail encontrada no código');
    dataPoints.push('Possível endereço de e-mail');
  }
  if (code.includes('phone') || code.includes('telefone')) {
    issues.push('Referência a telefone encontrada no código');
    dataPoints.push('Possível telefone');
  }
  if (code.includes('geolocation') || code.includes('coords')) {
    issues.push('Referência a geolocalização encontrada');
    dataPoints.push('Possível localização');
  }
  if (code.includes('facebook.net') || code.includes('fbq')) {
    issues.push('Integração Meta observada');
    dataPoints.push('Fluxo para endpoint/SDK Meta requer verificação runtime');
  }

  return {
    issues,
    dataPoints,
    codeLength: code.length,
    hasExternalCalls: code.includes('https://') || code.includes('http://'),
    isMinified: code.length > 500 && !code.includes('\n'),
  };
};

export const detectGTMPosition = (scripts: any[]): number => {
  if (!Array.isArray(scripts)) return 0;
  const gtmIndex = scripts.findIndex(
    (script) =>
      script &&
      (script.type === 'tag_manager' ||
        (script.name && script.name.toLowerCase().includes('tag manager'))),
  );
  return gtmIndex >= 0 ? gtmIndex + 1 : 0;
};

export const detectUniversalAnalytics = (scripts: any[]) => {
  if (!Array.isArray(scripts)) return [];
  return scripts
    .filter((script) => script && script.type === 'universal_analytics')
    .map((script, index) => ({
      name: script.name || 'Universal Analytics',
      type: script.type,
      code: script.code || '',
      position: index + 1,
      parameters: [],
    }));
};
