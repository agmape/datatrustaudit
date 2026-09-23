
interface FileAnalysisResult {
  scripts: ScriptInfo[];
  events: EventInfo[];
  duplicates: DuplicateInfo[];
  tagPositions: TagPositionInfo[];
  compliance: ComplianceInfo;
  summary: AnalysisSummary;
}

interface ScriptInfo {
  name: string;
  type: 'analytics' | 'advertising' | 'tag_manager' | 'support' | 'heatmap' | 'consent' | 'custom';
  position: number;
  code: string;
  file: string;
  lineNumber: number;
  dataCollected: string[];
  isBeforeConsent: boolean;
  violationLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  implementationIssues: string[];
}

interface EventInfo {
  name: string;
  parameters: string[];
  requiredParams: string[];
  missingParams: string[];
  undefinedParams: string[];
  file: string;
  lineNumber: number;
  dataType: 'simple' | 'sensitive' | 'none';
  hasConsent: boolean;
  validationStatus: 'valid' | 'incomplete' | 'invalid';
}

interface DuplicateInfo {
  type: 'script' | 'event' | 'tag';
  name: string;
  count: number;
  locations: Array<{
    file: string;
    lineNumber: number;
    code: string;
  }>;
  severity: 'warning' | 'error';
  recommendation: string;
}

interface TagPositionInfo {
  tag: string;
  position: number;
  shouldBeBefore: string[];
  shouldBeAfter: string[];
  issues: string[];
  recommendation: string;
}

interface ComplianceInfo {
  consentDetected: boolean;
  consentType: 'basic' | 'granular' | 'none';
  lgpdCompliant: boolean;
  violations: Array<{
    script: string;
    violation: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    article: string;
  }>;
  estimatedFine: string;
}

interface AnalysisSummary {
  totalScripts: number;
  totalEvents: number;
  duplicateCount: number;
  violationCount: number;
  complianceScore: number;
  mainIssues: string[];
}

export class FileAnalysisService {
  private static instance: FileAnalysisService;
  
  static getInstance(): FileAnalysisService {
    if (!FileAnalysisService.instance) {
      FileAnalysisService.instance = new FileAnalysisService();
    }
    return FileAnalysisService.instance;
  }

  async analyzeFiles(files: Array<{ content: string; file: { name: string }; type: string }>): Promise<FileAnalysisResult> {
    console.log(`🔍 Iniciando análise detalhada de ${files.length} arquivos`);
    
    const allScripts: ScriptInfo[] = [];
    const allEvents: EventInfo[] = [];
    const duplicates: DuplicateInfo[] = [];
    const tagPositions: TagPositionInfo[] = [];
    
    // Analisar cada arquivo
    for (const fileData of files) {
      console.log(`📄 Analisando arquivo: ${fileData.file.name}`);
      
      const fileScripts = this.extractScriptsFromFile(fileData.content, fileData.file.name);
      const fileEvents = this.extractEventsFromFile(fileData.content, fileData.file.name);
      
      allScripts.push(...fileScripts);
      allEvents.push(...fileEvents);
    }

    // Detectar duplicatas
    const scriptDuplicates = this.detectScriptDuplicates(allScripts);
    const eventDuplicates = this.detectEventDuplicates(allEvents);
    duplicates.push(...scriptDuplicates, ...eventDuplicates);

    // Analisar posicionamento de tags
    const positionAnalysis = this.analyzeTagPositioning(allScripts);
    tagPositions.push(...positionAnalysis);

    // Análise de compliance
    const compliance = this.analyzeCompliance(allScripts, allEvents);

    // Gerar resumo
    const summary = this.generateSummary(allScripts, allEvents, duplicates, compliance);

    console.log(`✅ Análise concluída:`);
    console.log(`   - Scripts: ${allScripts.length}`);
    console.log(`   - Eventos: ${allEvents.length}`);
    console.log(`   - Duplicatas: ${duplicates.length}`);
    console.log(`   - Score de compliance: ${summary.complianceScore}%`);

    return {
      scripts: allScripts,
      events: allEvents,
      duplicates,
      tagPositions,
      compliance,
      summary
    };
  }

  private extractScriptsFromFile(content: string, fileName: string): ScriptInfo[] {
    const scripts: ScriptInfo[] = [];
    const lines = content.split('\n');
    
    // Detectar Google Analytics 4
    lines.forEach((line, index) => {
      if (this.containsGA4(line)) {
        scripts.push({
          name: 'Google Analytics 4',
          type: 'analytics',
          position: scripts.length + 1,
          code: line.trim(),
          file: fileName,
          lineNumber: index + 1,
          dataCollected: [
            'Endereço IP completo',
            'Identificadores únicos',
            'Dados de comportamento',
            'Localização geográfica',
            'Demografia inferida'
          ],
          isBeforeConsent: !this.hasConsentBefore(content, index),
          violationLevel: this.hasConsentBefore(content, index) ? 'medium' : 'critical',
          implementationIssues: this.analyzeGA4Implementation(line)
        });
      }
    });

    // Detectar Meta Pixel
    lines.forEach((line, index) => {
      if (this.containsMetaPixel(line)) {
        scripts.push({
          name: 'Meta Pixel (Facebook)',
          type: 'advertising',
          position: scripts.length + 1,
          code: line.trim(),
          file: fileName,
          lineNumber: index + 1,
          dataCollected: [
            'Fingerprint do navegador',
            'Comportamento de compra',
            'Dados de conversão',
            'Interesses comerciais',
            'Identificadores para remarketing'
          ],
          isBeforeConsent: !this.hasConsentBefore(content, index),
          violationLevel: 'critical',
          implementationIssues: this.analyzeMetaPixelImplementation(line)
        });
      }
    });

    // Detectar Google Tag Manager
    lines.forEach((line, index) => {
      if (this.containsGTM(line)) {
        scripts.push({
          name: 'Google Tag Manager',
          type: 'tag_manager',
          position: scripts.length + 1,
          code: line.trim(),
          file: fileName,
          lineNumber: index + 1,
          dataCollected: [
            'Eventos personalizados',
            'Dados de e-commerce',
            'Interações do usuário'
          ],
          isBeforeConsent: false,
          violationLevel: 'low',
          implementationIssues: this.analyzeGTMImplementation(line, index)
        });
      }
    });

    // Detectar outros scripts (Hotjar, Intercom, etc.)
    lines.forEach((line, index) => {
      if (this.containsHotjar(line)) {
        scripts.push({
          name: 'Hotjar',
          type: 'heatmap',
          position: scripts.length + 1,
          code: line.trim(),
          file: fileName,
          lineNumber: index + 1,
          dataCollected: [
            'Gravações de sessão',
            'Mapas de calor',
            'Dados de formulário',
            'Feedback do usuário'
          ],
          isBeforeConsent: !this.hasConsentBefore(content, index),
          violationLevel: 'high',
          implementationIssues: this.analyzeHotjarImplementation(line)
        });
      }
    });

    return scripts;
  }

  private extractEventsFromFile(content: string, fileName: string): EventInfo[] {
    const events: EventInfo[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Detectar eventos GA4
      const ga4Events = this.extractGA4Events(line, fileName, index + 1);
      events.push(...ga4Events);

      // Detectar eventos Meta Pixel
      const metaEvents = this.extractMetaPixelEvents(line, fileName, index + 1);
      events.push(...metaEvents);
    });

    return events;
  }

  private extractGA4Events(line: string, fileName: string, lineNumber: number): EventInfo[] {
    const events: EventInfo[] = [];
    
    // Detectar gtag('event', ...)
    const gtagEventMatch = line.match(/gtag\s*\(\s*['"]event['"],\s*['"]([^'"]+)['"](?:,\s*({[^}]+}))?/);
    if (gtagEventMatch) {
      const eventName = gtagEventMatch[1];
      const paramsString = gtagEventMatch[2] || '{}';
      const parameters = this.extractParametersFromObject(paramsString);
      
      events.push({
        name: eventName,
        parameters,
        requiredParams: this.getRequiredParamsForEvent(eventName),
        missingParams: [],
        undefinedParams: this.detectUndefinedParams(paramsString),
        file: fileName,
        lineNumber,
        dataType: this.assessEventDataType(eventName, parameters),
        hasConsent: this.hasConsentInContext(line),
        validationStatus: 'valid'
      });
    }

    return events;
  }

  private extractMetaPixelEvents(line: string, fileName: string, lineNumber: number): EventInfo[] {
    const events: EventInfo[] = [];
    
    // Detectar fbq('track', ...)
    const fbqEventMatch = line.match(/fbq\s*\(\s*['"]track['"],\s*['"]([^'"]+)['"](?:,\s*({[^}]+}))?/);
    if (fbqEventMatch) {
      const eventName = fbqEventMatch[1];
      const paramsString = fbqEventMatch[2] || '{}';
      const parameters = this.extractParametersFromObject(paramsString);
      
      events.push({
        name: `FB: ${eventName}`,
        parameters,
        requiredParams: this.getRequiredParamsForFBEvent(eventName),
        missingParams: [],
        undefinedParams: this.detectUndefinedParams(paramsString),
        file: fileName,
        lineNumber,
        dataType: 'sensitive',
        hasConsent: this.hasConsentInContext(line),
        validationStatus: 'valid'
      });
    }

    return events;
  }

  private detectScriptDuplicates(scripts: ScriptInfo[]): DuplicateInfo[] {
    const duplicates: DuplicateInfo[] = [];
    const scriptGroups = new Map<string, ScriptInfo[]>();

    // Agrupar scripts por nome/tipo
    scripts.forEach(script => {
      const key = `${script.name}_${script.type}`;
      if (!scriptGroups.has(key)) {
        scriptGroups.set(key, []);
      }
      scriptGroups.get(key)!.push(script);
    });

    // Identificar duplicatas
    scriptGroups.forEach((group, key) => {
      if (group.length > 1) {
        duplicates.push({
          type: 'script',
          name: group[0].name,
          count: group.length,
          locations: group.map(script => ({
            file: script.file,
            lineNumber: script.lineNumber,
            code: script.code
          })),
          severity: group[0].type === 'analytics' ? 'error' : 'warning',
          recommendation: `Remover ${group.length - 1} instância(s) duplicada(s) de ${group[0].name}`
        });
      }
    });

    return duplicates;
  }

  private detectEventDuplicates(events: EventInfo[]): DuplicateInfo[] {
    const duplicates: DuplicateInfo[] = [];
    const eventGroups = new Map<string, EventInfo[]>();

    events.forEach(event => {
      if (!eventGroups.has(event.name)) {
        eventGroups.set(event.name, []);
      }
      eventGroups.get(event.name)!.push(event);
    });

    eventGroups.forEach((group, eventName) => {
      if (group.length > 1) {
        duplicates.push({
          type: 'event',
          name: eventName,
          count: group.length,
          locations: group.map(event => ({
            file: event.file,
            lineNumber: event.lineNumber,
            code: `Evento: ${event.name}`
          })),
          severity: 'warning',
          recommendation: `Consolidar ${group.length} disparos do evento ${eventName}`
        });
      }
    });

    return duplicates;
  }

  private analyzeTagPositioning(scripts: ScriptInfo[]): TagPositionInfo[] {
    const positions: TagPositionInfo[] = [];
    
    const gtmScript = scripts.find(s => s.type === 'tag_manager');
    const consentScript = scripts.find(s => s.type === 'consent');
    
    scripts.forEach(script => {
      const issues: string[] = [];
      let recommendation = '';

      // Verificar posicionamento em relação ao GTM
      if (gtmScript && script.type !== 'tag_manager' && script.position < gtmScript.position) {
        if (script.type === 'analytics' || script.type === 'advertising') {
          issues.push('Script carregado antes do GTM');
          recommendation = 'Mover para dentro do GTM para melhor controle';
        }
      }

      // Verificar posicionamento em relação ao consentimento
      if (consentScript && script.isBeforeConsent && script.type !== 'consent') {
        issues.push('Script executando antes do consentimento');
        recommendation = 'Aguardar consentimento antes da execução';
      }

      if (issues.length > 0) {
        positions.push({
          tag: script.name,
          position: script.position,
          shouldBeBefore: [],
          shouldBeAfter: consentScript ? [consentScript.name] : [],
          issues,
          recommendation
        });
      }
    });

    return positions;
  }

  private analyzeCompliance(scripts: ScriptInfo[], events: EventInfo[]): ComplianceInfo {
    const violations: Array<{
      script: string;
      violation: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      article: string;
    }> = [];

    let criticalCount = 0;
    let highCount = 0;

    scripts.forEach(script => {
      if (script.violationLevel === 'critical') {
        criticalCount++;
        violations.push({
          script: script.name,
          violation: 'Coleta de dados antes do consentimento',
          severity: 'critical',
          article: 'Art. 7º e 8º LGPD'
        });
      } else if (script.violationLevel === 'high') {
        highCount++;
        violations.push({
          script: script.name,
          violation: 'Dados sensíveis sem base legal adequada',
          severity: 'high',
          article: 'Art. 11 LGPD'
        });
      }
    });

    const totalFine = this.calculateEstimatedFine(criticalCount, highCount);
    const consentDetected = scripts.some(s => s.type === 'consent');
    
    return {
      consentDetected,
      consentType: consentDetected ? 'basic' : 'none',
      lgpdCompliant: violations.length === 0,
      violations,
      estimatedFine: totalFine
    };
  }

  private generateSummary(scripts: ScriptInfo[], events: EventInfo[], duplicates: DuplicateInfo[], compliance: ComplianceInfo): AnalysisSummary {
    const violationCount = compliance.violations.length;
    const complianceScore = Math.max(0, 100 - (violationCount * 10));
    
    const mainIssues: string[] = [];
    if (duplicates.length > 0) mainIssues.push(`${duplicates.length} duplicatas detectadas`);
    if (!compliance.consentDetected) mainIssues.push('Sistema de consentimento ausente');
    if (violationCount > 0) mainIssues.push(`${violationCount} violações de LGPD`);

    return {
      totalScripts: scripts.length,
      totalEvents: events.length,
      duplicateCount: duplicates.length,
      violationCount,
      complianceScore,
      mainIssues
    };
  }

  // Métodos auxiliares de detecção
  private containsGA4(line: string): boolean {
    return line.includes('gtag(') || line.includes('google-analytics.com/gtag/js') || line.includes('G-');
  }

  private containsMetaPixel(line: string): boolean {
    return line.includes('fbq(') || line.includes('connect.facebook.net');
  }

  private containsGTM(line: string): boolean {
    return line.includes('googletagmanager.com/gtm.js') || line.includes('GTM-');
  }

  private containsHotjar(line: string): boolean {
    return line.includes('hotjar.com') || line.includes('hj(');
  }

  private hasConsentBefore(content: string, lineIndex: number): boolean {
    const beforeContent = content.split('\n').slice(0, lineIndex).join('\n');
    return beforeContent.includes('consent') || beforeContent.includes('cookie');
  }

  private hasConsentInContext(line: string): boolean {
    return line.includes('consent') || line.includes('cookie');
  }

  private extractParametersFromObject(paramsString: string): string[] {
    const params: string[] = [];
    const matches = paramsString.match(/['"]([^'"]+)['"]:/g);
    if (matches) {
      matches.forEach(match => {
        const param = match.replace(/['"]/g, '').replace(':', '');
        params.push(param);
      });
    }
    return params;
  }

  private detectUndefinedParams(paramsString: string): string[] {
    const undefinedParams: string[] = [];
    if (paramsString.includes('undefined')) undefinedParams.push('undefined values');
    if (paramsString.includes('null')) undefinedParams.push('null values');
    return undefinedParams;
  }

  private getRequiredParamsForEvent(eventName: string): string[] {
    const requirements: { [key: string]: string[] } = {
      'page_view': ['page_title', 'page_location'],
      'purchase': ['transaction_id', 'value', 'currency'],
      'view_item': ['item_id', 'item_name'],
      'add_to_cart': ['item_id', 'quantity']
    };
    return requirements[eventName] || [];
  }

  private getRequiredParamsForFBEvent(eventName: string): string[] {
    const requirements: { [key: string]: string[] } = {
      'PageView': [],
      'Purchase': ['value', 'currency'],
      'AddToCart': ['content_ids', 'content_type']
    };
    return requirements[eventName] || [];
  }

  private assessEventDataType(eventName: string, parameters: string[]): 'simple' | 'sensitive' | 'none' {
    if (parameters.some(p => p.includes('email') || p.includes('phone'))) return 'sensitive';
    if (parameters.some(p => p.includes('user_id') || p.includes('client_id'))) return 'simple';
    return 'none';
  }

  private analyzeGA4Implementation(line: string): string[] {
    const issues: string[] = [];
    if (!line.includes('anonymize_ip')) issues.push('IP não anonimizado');
    if (line.includes('ads_data_redaction: false')) issues.push('Dados de publicidade não protegidos');
    return issues;
  }

  private analyzeMetaPixelImplementation(line: string): string[] {
    const issues: string[] = [];
    if (line.includes('advanced_matching')) issues.push('Advanced Matching ativo sem consentimento');
    return issues;
  }

  private analyzeGTMImplementation(line: string, lineIndex: number): string[] {
    const issues: string[] = [];
    if (lineIndex > 10) issues.push('GTM posicionado muito abaixo no código');
    return issues;
  }

  private analyzeHotjarImplementation(line: string): string[] {
    const issues: string[] = [];
    if (line.includes('hjSuppressQuestionnaire: false')) issues.push('Questionários ativos sem consentimento');
    return issues;
  }

  private calculateEstimatedFine(criticalCount: number, highCount: number): string {
    const baseFine = (criticalCount * 15000) + (highCount * 5000);
    const minFine = Math.max(2000, baseFine * 0.7);
    const maxFine = baseFine * 1.5;
    return `R$ ${minFine.toLocaleString('pt-BR')} - R$ ${maxFine.toLocaleString('pt-BR')}`;
  }
}
