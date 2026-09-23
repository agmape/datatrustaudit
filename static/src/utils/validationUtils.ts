
import { EventValidation } from '@/types/audit';
import { GA4_EVENT_REQUIREMENTS } from '@/constants/ga4Events';

export const validateEventParameters = (eventName: string, actualParams: string[]): EventValidation => {
  const requirements = GA4_EVENT_REQUIREMENTS[eventName as keyof typeof GA4_EVENT_REQUIREMENTS];
  
  if (!requirements) {
    return {
      status: 'complete',
      missingParams: [],
      extraParams: actualParams,
      validationMessage: 'Evento customizado - validação não aplicável'
    };
  }

  const missingParams = requirements.required.filter(param => !actualParams.includes(param));
  const allKnownParams = [...requirements.required, ...requirements.optional];
  const extraParams = actualParams.filter(param => !allKnownParams.includes(param));

  let status: 'complete' | 'incomplete' | 'invalid' = 'complete';
  let validationMessage = '✅ Parâmetros obrigatórios presentes';

  if (missingParams.length > 0) {
    status = 'incomplete';
    validationMessage = `❌ Faltam parâmetros: ${missingParams.join(', ')}`;
  } else if (extraParams.length > 0) {
    status = 'invalid';
    validationMessage = `⚠️ Parâmetros extras: ${extraParams.join(', ')}`;
  }

  return {
    status,
    missingParams,
    extraParams,
    validationMessage
  };
};
