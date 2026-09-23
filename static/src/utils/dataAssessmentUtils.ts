const SENSITIVE_TERMS = [
  'saude', 'saúde', 'health', 'biometric', 'biometria', 'genetic', 'genético',
  'religion', 'religião', 'political_opinion', 'opinião política', 'racial',
  'ethnic', 'sexual', 'sindicato', 'union_membership',
];

const PERSONAL_TERMS = [
  'email', 'e-mail', 'phone', 'telefone', 'cpf', 'rg', 'user_id', 'client_id',
  'ip', 'device_id', 'advertising_id',
];

export const assessDataType = (
  scriptName: string,
  eventName?: string,
  parameters: string[] = [],
): 'simple' | 'sensitive' | 'none' => {
  const haystack = [scriptName, eventName || '', ...parameters].join(' ').toLowerCase();

  if (SENSITIVE_TERMS.some((term) => haystack.includes(term))) return 'sensitive';
  if (PERSONAL_TERMS.some((term) => haystack.includes(term))) return 'simple';

  // A vendor or event name alone is not evidence that sensitive data exists.
  return 'none';
};

export const assessViolationSeverity = (
  hasConsent: boolean,
  dataType: 'simple' | 'sensitive' | 'none',
  isBeforeGTM: boolean,
  scriptType: string,
  isBeforeConsent: boolean = false,
): 'ok' | 'medium' | 'high' | 'critical' => {
  if (scriptType === 'consent' || scriptType === 'cookie_consent') return 'ok';

  if (isBeforeConsent && dataType === 'sensitive') return 'critical';
  if (isBeforeConsent && dataType === 'simple') return 'high';
  if (!hasConsent && dataType !== 'none') return 'medium';

  // Universal Analytics is a deprecated implementation, not automatically a
  // legal violation.
  if (scriptType === 'universal_analytics') return 'medium';

  if (isBeforeGTM && scriptType !== 'tag_manager') return 'medium';

  return 'ok';
};
