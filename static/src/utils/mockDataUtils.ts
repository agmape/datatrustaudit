
export const generateRealisticScripts = () => [
  // Consent Management
  { 
    name: "Cookiebot CMP", 
    type: "consent", 
    code: "window.Cookiebot=window.Cookiebot||{}; Cookiebot.dialog={};", 
    category: "consent",
    description: "Sistema de gerenciamento de consentimento LGPD"
  },
  { 
    name: "OneTrust Cookie Consent", 
    type: "consent", 
    code: "function OptanonWrapper() { window.dataLayer.push({event: 'OneTrustGroupsUpdated'}); }", 
    category: "consent",
    description: "Plataforma de privacidade e consentimento"
  },
  { 
    name: "Termly Cookie Consent", 
    type: "consent", 
    code: "!function(){var t=document.createElement('script');t.type='text/javascript',t.async=!0,t.src='https://app.termly.io/embed.min.js';", 
    category: "consent",
    description: "Widget de consentimento de cookies"
  },
  
  // Tag Management
  { 
    name: "Google Tag Manager", 
    type: "tag_manager", 
    code: "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});", 
    category: "tag_manager",
    description: "Sistema de gerenciamento de tags do Google"
  },
  
  // Analytics - Modern
  { 
    name: "Google Analytics 4", 
    type: "analytics", 
    code: "gtag('config', 'G-XXXXXXXXXX', { anonymize_ip: true, allow_google_signals: false });", 
    category: "tracking",
    description: "Analytics moderno do Google com controles de privacidade"
  },
  { 
    name: "Microsoft Clarity", 
    type: "analytics", 
    code: "(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};", 
    category: "tracking",
    description: "Ferramenta de análise de comportamento da Microsoft"
  },
  
  // Analytics - Legacy (problematic)
  { 
    name: "Universal Analytics (Legacy)", 
    type: "universal_analytics", 
    code: "(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){(i[r].q=i[r].q||[]).push(arguments)};", 
    category: "tracking",
    description: "Google Analytics obsoleto - descontinuado em julho/2023"
  },
  
  // Advertising
  { 
    name: "Facebook Pixel", 
    type: "advertising", 
    code: "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};", 
    category: "tracking",
    description: "Pixel de conversão do Facebook/Meta"
  },
  { 
    name: "Google Ads Conversion", 
    type: "advertising", 
    code: "gtag('config', 'AW-XXXXXXXXX/XXXXXXX', { allow_enhanced_conversions: true });", 
    category: "tracking",
    description: "Tracking de conversões do Google Ads"
  },
  { 
    name: "LinkedIn Insight Tag", 
    type: "advertising", 
    code: "_linkedin_partner_id = 'XXXXXX'; window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];", 
    category: "tracking",
    description: "Tag de insights do LinkedIn para B2B"
  },
  
  // User Experience
  { 
    name: "Hotjar Tracking", 
    type: "analytics", 
    code: "(function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};", 
    category: "tracking",
    description: "Ferramenta de heatmaps e gravação de sessões"
  },
  { 
    name: "Intercom Messenger", 
    type: "support", 
    code: "window.Intercom('boot', { app_id: 'xxxxxxxx', user_id: user.id, email: user.email });", 
    category: "other",
    description: "Chat de atendimento ao cliente"
  },
  
  // Advanced Analytics
  { 
    name: "Mixpanel Analytics", 
    type: "analytics", 
    code: "(function(f,b){if(!b.__SV){var e,g,i,h;window.mixpanel=b;b._i=[];", 
    category: "tracking",
    description: "Analytics avançado para produtos digitais"
  }
];

export const generateRealisticEvents = () => [
  {
    name: "page_view",
    origin: "Google Analytics 4",
    parameters: "page_title, page_location, page_referrer",
    category: "engagement",
    actualParams: ["page_title", "page_location", "page_referrer", "user_id"],
    description: "Visualização de página com dados de navegação"
  },
  {
    name: "view_item",
    origin: "E-commerce Enhanced",
    parameters: "item_id, item_name, item_category, value, currency",
    category: "ecommerce",
    actualParams: ["item_id", "item_name", "item_category", "value"],
    description: "Visualização de produto em e-commerce"
  },
  {
    name: "purchase",
    origin: "Facebook Pixel + GA4",
    parameters: "transaction_id, value, currency, items, payment_method",
    category: "conversion",
    actualParams: ["transaction_id", "value", "currency", "items", "payment_method", "user_email"],
    description: "Evento de compra com dados financeiros sensíveis"
  },
  {
    name: "add_to_cart",
    origin: "Google Analytics 4",
    parameters: "currency, value, items",
    category: "ecommerce",
    actualParams: ["currency", "value", "items", "item_id"],
    description: "Adição de item ao carrinho de compras"
  },
  {
    name: "begin_checkout",
    origin: "Enhanced Ecommerce",
    parameters: "value, currency, items, coupon",
    category: "ecommerce",
    actualParams: ["value", "currency", "items"],
    description: "Início do processo de checkout"
  },
  {
    name: "login",
    origin: "Custom Implementation",
    parameters: "method, user_id",
    category: "engagement",
    actualParams: ["method", "user_id", "email", "login_timestamp"],
    description: "Login do usuário com dados pessoais"
  },
  {
    name: "sign_up",
    origin: "Lead Generation",
    parameters: "method, campaign_source",
    category: "conversion",
    actualParams: ["method", "campaign_source", "user_email", "phone", "full_name"],
    description: "Cadastro de novo usuário com dados sensíveis"
  },
  {
    name: "search",
    origin: "Site Search Tracking",
    parameters: "search_term, search_results",
    category: "engagement",
    actualParams: ["search_term", "search_results", "user_location"],
    description: "Busca interna com dados comportamentais"
  },
  {
    name: "video_play",
    origin: "YouTube Analytics",
    parameters: "video_title, video_duration, video_percent",
    category: "engagement",
    actualParams: ["video_title", "video_duration", "video_percent"],
    description: "Reprodução de vídeo para análise de engajamento"
  },
  {
    name: "form_submit",
    origin: "Lead Tracking",
    parameters: "form_id, form_name, form_destination",
    category: "lead",
    actualParams: ["form_id", "form_name", "form_destination", "user_email", "phone"],
    description: "Envio de formulário com dados de contato"
  }
];
