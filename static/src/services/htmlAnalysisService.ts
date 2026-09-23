interface ScriptInfo {
  name: string;
  type: string;
  code: string;
  position: number;
  dataCollected: string[];
  isBeforeConsent: boolean;
  actualDataFlow: string;
  realScript: true;
}

interface EventInfo {
  name: string;
  actualParams: string[];
  dataCollected: string;
  origin: string;
  category: string;
  realEvent: true;
}

/**
 * Legacy HTML-only analyzer.
 *
 * It may identify explicit source signatures, but it cannot prove runtime
 * execution, cookie creation, consent effectiveness or actual data transfer.
 * Those require the backend runtime scanner.
 */
export class HtmlAnalysisService {
  private static instance: HtmlAnalysisService;

  static getInstance(): HtmlAnalysisService {
    if (!HtmlAnalysisService.instance) {
      HtmlAnalysisService.instance = new HtmlAnalysisService();
    }
    return HtmlAnalysisService.instance;
  }

  extractScripts(html: string, _url: string): ScriptInfo[] {
    if (!html || typeof html !== 'string') return [];

    const findings: Array<{name:string; type:string; match:RegExpMatchArray}> = [];
    const signatures = [
      {
        name: 'Google Analytics 4',
        type: 'analytics',
        re: /(?:googletagmanager\.com\/gtag\/js[^"'<>]*|gtag\s*\(\s*['"]config['"][^)]*|G-[A-Z0-9]{10,12})/i,
      },
      {
        name: 'Meta Pixel',
        type: 'advertising',
        re: /(?:connect\.facebook\.net[^"'<>]*fbevents\.js|fbq\s*\(\s*['"]init['"][^)]*)/i,
      },
      {
        name: 'Google Tag Manager',
        type: 'tag_manager',
        re: /(?:googletagmanager\.com\/gtm\.js[^"'<>]*|GTM-[A-Z0-9]{6,8})/i,
      },
      {
        name: 'Hotjar',
        type: 'heatmap',
        re: /(?:static\.hotjar\.com|_hjSettings\s*=|hj\s*\()/i,
      },
    ];

    for (const signature of signatures) {
      const match = html.match(signature.re);
      if (match) findings.push({ name: signature.name, type: signature.type, match });
    }

    return findings
      .sort((a, b) => (a.match.index ?? 0) - (b.match.index ?? 0))
      .map((finding, index) => ({
        name: finding.name,
        type: finding.type,
        code: finding.match[0].slice(0, 500),
        position: index + 1,
        dataCollected: [],
        isBeforeConsent: false,
        actualDataFlow:
          'Assinatura encontrada no HTML. Execução, parâmetros transmitidos e destino efetivo não foram confirmados.',
        realScript: true as const,
      }));
  }

  extractEvents(html: string, url: string): EventInfo[] {
    if (!html || typeof html !== 'string') return [];
    const events: EventInfo[] = [];

    const gaRe = /gtag\s*\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"](?:\s*,\s*({[\s\S]*?}))?\s*\)/gi;
    let match: RegExpExecArray | null;
    while ((match = gaRe.exec(html)) !== null && events.length < 100) {
      const params = match[2]
        ? Array.from(match[2].matchAll(/['"]?([A-Za-z0-9_]+)['"]?\s*:/g)).map((m) => m[1])
        : [];
      events.push({
        name: match[1],
        actualParams: Array.from(new Set(params)),
        dataCollected: 'Somente nomes de parâmetros explicitamente presentes no HTML foram observados.',
        origin: `Assinatura gtag(event) no HTML de ${url}`,
        category: 'analytics',
        realEvent: true as const,
      });
    }

    const fbRe = /fbq\s*\(\s*['"]track(?:Custom)?['"]\s*,\s*['"]([^'"]+)['"](?:\s*,\s*({[\s\S]*?}))?\s*\)/gi;
    while ((match = fbRe.exec(html)) !== null && events.length < 200) {
      const params = match[2]
        ? Array.from(match[2].matchAll(/['"]?([A-Za-z0-9_]+)['"]?\s*:/g)).map((m) => m[1])
        : [];
      events.push({
        name: match[1],
        actualParams: Array.from(new Set(params)),
        dataCollected: 'Somente nomes de parâmetros explicitamente presentes no HTML foram observados.',
        origin: `Assinatura fbq(track) no HTML de ${url}`,
        category: 'advertising',
        realEvent: true as const,
      });
    }

    return events;
  }

  analyzeConsentMechanism(html: string) {
    if (!html || typeof html !== 'string') {
      return {
        detected: false,
        type: 'Não observado',
        implementation: 'Não verificável no HTML disponível',
        compliant: false,
      };
    }

    const knownCmp = /(?:Cookiebot|OneTrust|OptanonWrapper|Didomi|UC_UI|usercentrics|__tcfapi)/i.test(html);
    const consentWords = /(?:cookie.{0,80}(?:consent|consentimento)|consent.{0,80}cookie)/i.test(html);

    return {
      detected: knownCmp || consentWords,
      type: knownCmp ? 'CMP/signature observed' : consentWords ? 'Consent-related text observed' : 'Não observado',
      implementation:
        'Presença no HTML não confirma bloqueio prévio, granularidade, revogação ou validade jurídica; requer runtime/manual.',
      compliant: false,
    };
  }
}
