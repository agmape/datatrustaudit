
export const assessDataType = (scriptName: string, eventName?: string): 'simple' | 'sensitive' | 'none' => {
  const sensitiveScripts = [
    'facebook pixel', 'google ads', 'linkedin insight', 'hotjar', 'mixpanel',
    'intercom', 'clarity', 'fullstory', 'amplitude', 'segment'
  ];
  
  const sensitiveEvents = [
    'purchase', 'login', 'sign_up', 'add_payment_info', 'add_shipping_info',
    'begin_checkout', 'generate_lead', 'share'
  ];
  
  const simpleDataScripts = [
    'google analytics', 'google tag manager', 'gtag', 'analytics',
    'tracking', 'tag manager', 'consent'
  ];
  
  const simpleEvents = [
    'view_item', 'add_to_cart', 'search', 'page_view', 'scroll',
    'click', 'form_start', 'video_play', 'video_complete'
  ];
  
  // Check for sensitive data collection
  if (sensitiveScripts.some(script => scriptName.toLowerCase().includes(script)) ||
      (eventName && sensitiveEvents.includes(eventName))) {
    return 'sensitive';
  }
  
  // Check for simple personal data
  if (simpleDataScripts.some(script => scriptName.toLowerCase().includes(script)) ||
      (eventName && simpleEvents.includes(eventName))) {
    return 'simple';
  }
  
  return 'none';
};

export const assessViolationSeverity = (
  hasConsent: boolean, 
  dataType: 'simple' | 'sensitive' | 'none',
  isBeforeGTM: boolean,
  scriptType: string,
  isBeforeConsent: boolean = false
): 'ok' | 'medium' | 'high' | 'critical' => {
  // Consent scripts should always be OK
  if (scriptType === 'consent' || scriptType === 'cookie_consent') return 'ok';
  
  // Critical violations
  if (!hasConsent && dataType === 'sensitive') return 'critical';
  if (isBeforeConsent && (dataType === 'sensitive' || dataType === 'simple')) return 'critical';
  
  // High violations
  if (!hasConsent && dataType === 'simple') return 'high';
  if (scriptType === 'universal_analytics') return 'critical'; // UA is always critical
  
  // Medium violations
  if (isBeforeGTM && scriptType !== 'tag_manager' && scriptType !== 'consent') return 'medium';
  
  return 'ok';
};
