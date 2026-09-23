
import { Event, EmbedCode } from '@/types/audit';

export interface DuplicateAnalysis {
  duplicateEvents: {
    eventName: string;
    count: number;
    occurrences: Event[];
  }[];
  duplicateTags: {
    tagName: string;
    count: number;
    occurrences: EmbedCode[];
  }[];
  undefinedParameters: {
    eventName: string;
    undefinedParams: string[];
    suggestions: string[];
  }[];
  tagInstallationIssues: {
    tagName: string;
    issue: string;
    recommendation: string;
  }[];
}

export const analyzeDuplicatesAndIssues = (events: Event[], embedCodes: EmbedCode[]): DuplicateAnalysis => {
  // Detectar eventos duplicados
  const eventCounts = new Map<string, Event[]>();
  events.forEach(event => {
    const key = event.name;
    if (!eventCounts.has(key)) {
      eventCounts.set(key, []);
    }
    eventCounts.get(key)!.push(event);
  });

  const duplicateEvents = Array.from(eventCounts.entries())
    .filter(([_, occurrences]) => occurrences.length > 1)
    .map(([eventName, occurrences]) => ({
      eventName,
      count: occurrences.length,
      occurrences
    }));

  // Detectar tags duplicadas
  const tagCounts = new Map<string, EmbedCode[]>();
  embedCodes.forEach(code => {
    const key = `${code.name}_${code.type}`;
    if (!tagCounts.has(key)) {
      tagCounts.set(key, []);
    }
    tagCounts.get(key)!.push(code);
  });

  const duplicateTags = Array.from(tagCounts.entries())
    .filter(([_, occurrences]) => occurrences.length > 1)
    .map(([tagName, occurrences]) => ({
      tagName: occurrences[0].name,
      count: occurrences.length,
      occurrences
    }));

  // Detectar parâmetros undefined
  const undefinedParameters = events
    .filter(event => event.parameters && (
      event.parameters.includes('undefined') || 
      event.parameters.includes('null') ||
      event.parameters === ''
    ))
    .map(event => ({
      eventName: event.name,
      undefinedParams: extractUndefinedParams(event.parameters || ''),
      suggestions: generateParameterSuggestions(event.name)
    }));

  // Verificar problemas de instalação de tags
  const tagInstallationIssues = embedCodes
    .filter(code => hasInstallationIssues(code))
    .map(code => ({
      tagName: code.name,
      issue: getInstallationIssue(code),
      recommendation: getInstallationRecommendation(code)
    }));

  return {
    duplicateEvents,
    duplicateTags,
    undefinedParameters,
    tagInstallationIssues
  };
};

const extractUndefinedParams = (parameters: string): string[] => {
  const undefinedParams: string[] = [];
  if (parameters.includes('undefined')) {
    undefinedParams.push('undefined values detected');
  }
  if (parameters.includes('null')) {
    undefinedParams.push('null values detected');
  }
  if (parameters === '' || parameters.trim() === '') {
    undefinedParams.push('empty parameters');
  }
  return undefinedParams;
};

const generateParameterSuggestions = (eventName: string): string[] => {
  const suggestions: { [key: string]: string[] } = {
    'page_view': ['page_title', 'page_location', 'client_id'],
    'view_item': ['item_id', 'item_name', 'item_category', 'value', 'currency'],
    'add_to_cart': ['item_id', 'item_name', 'quantity', 'value', 'currency'],
    'purchase': ['transaction_id', 'value', 'currency', 'items'],
    'search': ['search_term'],
    'login': ['method'],
    'sign_up': ['method'],
    'share': ['content_type', 'item_id'],
    'video_start': ['video_title', 'video_duration'],
    'video_complete': ['video_title', 'video_duration']
  };

  return suggestions[eventName] || ['Definir parâmetros específicos para este evento'];
};

const hasInstallationIssues = (code: EmbedCode): boolean => {
  // Verificar se há problemas comuns de instalação
  if (code.type === 'analytics' && code.isBeforeConsent) {
    return true;
  }
  if (code.type === 'tag_manager' && code.position > 3) {
    return true;
  }
  if (code.violationSeverity === 'critical') {
    return true;
  }
  return false;
};

const getInstallationIssue = (code: EmbedCode): string => {
  if (code.type === 'analytics' && code.isBeforeConsent) {
    return 'Analytics executando antes do consentimento';
  }
  if (code.type === 'tag_manager' && code.position > 3) {
    return 'Google Tag Manager posicionado muito abaixo no código';
  }
  if (code.violationSeverity === 'critical') {
    return 'Violação crítica de LGPD detectada';
  }
  return 'Problema de instalação detectado';
};

const getInstallationRecommendation = (code: EmbedCode): string => {
  if (code.type === 'analytics' && code.isBeforeConsent) {
    return 'Mover execução do Analytics para após obter consentimento do usuário';
  }
  if (code.type === 'tag_manager' && code.position > 3) {
    return 'Reposicionar GTM para o topo da tag <head> para melhor performance';
  }
  if (code.violationSeverity === 'critical') {
    return 'Implementar mecanismo de consentimento antes da execução desta tag';
  }
  return 'Revisar configuração e posicionamento da tag';
};
