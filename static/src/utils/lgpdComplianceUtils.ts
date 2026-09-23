export const assessLGPDCompliance = (script: any, hasGlobalConsent: boolean) => {
  const violations: string[] = [];
  const dataIssues: string[] = [];

  // Compatibility field name "violations" is retained, but entries are
  // technical risk indicators rather than legal determinations.
  if (script?.isBeforeConsent === true) {
    violations.push(
      'Indicador técnico: tracker aparenta ativar antes de um sinal observável de consentimento.',
    );
  }

  if (!hasGlobalConsent && ['analytics', 'advertising', 'heatmap', 'marketing'].includes(script?.type)) {
    violations.push(
      'Indicador técnico: nenhum mecanismo global de consentimento foi confirmado neste fluxo de análise.',
    );
  }

  const collected = Array.isArray(script?.dataCollected)
    ? script.dataCollected.join(' ').toLowerCase()
    : String(script?.dataCollected || '').toLowerCase();

  if (/(email|e-mail|telefone|phone|cpf|rg|user[_ -]?id|client[_ -]?id|ip)/i.test(collected)) {
    dataIssues.push(
      'Possível dado pessoal (LGPD Art. 5º, I); identificação concreta e finalidade exigem verificação contextual.',
    );
  }

  if (/(sa[uú]de|biometr|gen[eé]tic|relig|opini[aã]o pol[ií]tica|origem racial|vida sexual|filia[cç][aã]o sindical)/i.test(collected)) {
    dataIssues.push(
      'Possível dado pessoal sensível (LGPD Art. 5º, II); requer confirmação da evidência e do contexto.',
    );
  }

  const severity: 'medium' | 'high' | 'critical' =
    dataIssues.some((item) => item.includes('sensível')) && script?.isBeforeConsent === true
      ? 'critical'
      : violations.length > 0
        ? 'high'
        : 'medium';

  return {
    violations,
    dataIssues,
    severity,
    lgpdArticles: identifyRelevantArticles(violations, dataIssues),
  };
};

const identifyRelevantArticles = (indicators: string[], dataIssues: string[]): string[] => {
  const articles = new Set<string>();

  if (indicators.some((item) => item.toLowerCase().includes('consentimento'))) {
    articles.add('LGPD Art. 7º — bases legais; aplicabilidade exige avaliação do contexto');
    articles.add('LGPD Art. 8º — requisitos do consentimento quando essa for a base legal aplicável');
  }

  if (dataIssues.some((item) => item.includes('Art. 5º, I'))) {
    articles.add('LGPD Art. 5º, I — definição de dado pessoal');
  }

  if (dataIssues.some((item) => item.includes('Art. 5º, II'))) {
    articles.add('LGPD Art. 5º, II — definição de dado pessoal sensível');
    articles.add('LGPD Art. 11 — hipóteses de tratamento de dados pessoais sensíveis');
  }

  return Array.from(articles);
};

/**
 * Retained for compatibility with legacy components.
 * An external technical scan cannot calculate a real administrative fine.
 */
export const calculateRealFine = (
  severity: string,
  _companySize: string,
  _dataTypes: string[],
) => ({
  range:
    severity === 'ok'
      ? '—'
      : 'Não estimável por scanner externo; requer contexto jurídico, regulatório e econômico.',
  baseViolation: severity,
  aggravatingFactors: 'Não determinável externamente',
  legalBasis:
    'LGPD Art. 52 prevê sanções administrativas, mas o scanner não determina aplicação ou valor.',
});
