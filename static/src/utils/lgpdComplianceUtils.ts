
export const assessLGPDCompliance = (script: any, hasGlobalConsent: boolean) => {
  const violations: string[] = [];
  const dataIssues: string[] = [];
  
  // Análise crítica baseada no tipo de script
  switch (script.type) {
    case 'analytics':
      if (script.isBeforeConsent) {
        violations.push('🔴 CRÍTICO: Coleta de dados analíticos antes do consentimento');
        violations.push('📊 Dados coletados: IP, comportamento de navegação, sessão');
      }
      if (script.dataCollected?.includes('IP')) {
        dataIssues.push('🌐 Endereço IP (dado pessoal) - Art. 5º, II LGPD');
      }
      break;
      
    case 'advertising':
      violations.push('🔴 CRÍTICO: Compartilhamento com terceiros para publicidade');
      violations.push('📈 Facebook/Google Ads: perfil comportamental sem base legal');
      dataIssues.push('🎯 Dados para segmentação publicitária');
      dataIssues.push('🔄 Sincronização entre plataformas (Facebook ↔ Google)');
      break;
      
    case 'tag_manager':
      if (script.isBeforeConsent) {
        violations.push('⚠️ ALTO: GTM carregado antes do consentimento');
        violations.push('🏷️ Permite disparo de tags sem controle de privacidade');
      }
      break;
      
    case 'support':
      if (script.name.toLowerCase().includes('intercom') || script.name.toLowerCase().includes('chat')) {
        violations.push('💬 Chat coleta: nome, email, IP, mensagens');
        dataIssues.push('📝 Histórico de conversas armazenado');
      }
      break;
  }
  
  // Verificações específicas de código
  if (script.code) {
    if (script.code.includes('user_id') || script.code.includes('client_id')) {
      violations.push('🆔 Identificação persistente de usuário detectada');
    }
    if (script.code.includes('email') || script.code.includes('phone')) {
      violations.push('🔴 CRÍTICO: Dados sensíveis no código (email/telefone)');
    }
    if (script.code.includes('geolocation') || script.code.includes('coords')) {
      violations.push('🔴 CRÍTICO: Coleta de geolocalização precisa');
    }
  }
  
  return {
    violations,
    dataIssues,
    severity: violations.some(v => v.includes('CRÍTICO')) ? 'critical' : 
              violations.some(v => v.includes('ALTO')) ? 'high' : 'medium',
    lgpdArticles: identifyViolatedArticles(violations, dataIssues)
  };
};

const identifyViolatedArticles = (violations: string[], dataIssues: string[]): string[] => {
  const articles: Set<string> = new Set();
  
  // Mapeamento de violações para artigos da LGPD
  violations.forEach(violation => {
    if (violation.includes('consentimento')) {
      articles.add('Art. 7º - Base legal para tratamento');
      articles.add('Art. 8º - Consentimento');
    }
    if (violation.includes('terceiros') || violation.includes('compartilhamento')) {
      articles.add('Art. 26 - Responsabilidade solidária');
    }
    if (violation.includes('geolocalização') || violation.includes('dados sensíveis')) {
      articles.add('Art. 11 - Tratamento de dados sensíveis');
    }
  });
  
  dataIssues.forEach(issue => {
    if (issue.includes('IP')) {
      articles.add('Art. 5º, II - Definição de dado pessoal');
    }
    if (issue.includes('email') || issue.includes('telefone')) {
      articles.add('Art. 5º, I - Dados pessoais identificáveis');
    }
  });
  
  return Array.from(articles);
};

export const calculateRealFine = (severity: string, companySize: string, dataTypes: string[]) => {
  const baseFines = {
    critical: { min: 10000, max: 50000 },
    high: { min: 2000, max: 15000 },
    medium: { min: 500, max: 5000 }
  };
  
  const sizeMultiplier = {
    small: 0.5,
    medium: 1.0,
    large: 2.0
  };
  
  const base = baseFines[severity as keyof typeof baseFines] || baseFines.medium;
  const multiplier = sizeMultiplier[companySize as keyof typeof sizeMultiplier] || 1.0;
  
  // Aumentar multa baseado nos tipos de dados
  let dataMultiplier = 1.0;
  if (dataTypes.includes('email') || dataTypes.includes('telefone')) dataMultiplier += 0.5;
  if (dataTypes.includes('geolocalização')) dataMultiplier += 1.0;
  if (dataTypes.includes('dados sensíveis')) dataMultiplier += 1.5;
  
  const minFine = Math.round(base.min * multiplier * dataMultiplier);
  const maxFine = Math.round(base.max * multiplier * dataMultiplier);
  
  return {
    range: `R$ ${minFine.toLocaleString('pt-BR')} ~ R$ ${maxFine.toLocaleString('pt-BR')}`,
    baseViolation: severity,
    aggravatingFactors: dataTypes.length > 2 ? 'Múltiplos tipos de dados coletados' : 'Dados básicos',
    legalBasis: 'Art. 52 LGPD - Sanções administrativas'
  };
};
