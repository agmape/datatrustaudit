
import jsPDF from 'jspdf';
import { AuditResult } from '@/types/audit';
import { analyzeDuplicatesAndIssues } from '@/utils/duplicateDetectionUtils';

export class EnhancedPdfService {
  private pdf: jsPDF;
  private pageHeight: number = 280;
  private currentY: number = 20;
  private margin: number = 20;
  private pageWidth: number = 170;
  private lineHeight: number = 6;
  private colors = {
    primary: [31, 41, 55] as [number, number, number],
    secondary: [107, 114, 128] as [number, number, number],
    success: [34, 197, 94] as [number, number, number],
    warning: [251, 191, 36] as [number, number, number],
    danger: [239, 68, 68] as [number, number, number],
    info: [59, 130, 246] as [number, number, number],
    light: [248, 250, 252] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    purple: [147, 51, 234] as [number, number, number],
    orange: [255, 165, 0] as [number, number, number]
  };
  
  constructor() {
    this.pdf = new jsPDF('p', 'mm', 'a4');
    this.pdf.setFont('helvetica');
  }

  async generateComprehensiveReport(auditResult: AuditResult, url: string): Promise<string> {
    // Analisar duplicatas e problemas
    const duplicateAnalysis = analyzeDuplicatesAndIssues(auditResult.events, auditResult.embedCodes);
    
    // Cabeçalho do relatório
    this.addHeader(url);
    
    // Resumo executivo
    this.addExecutiveSummary(auditResult);
    
    // Duplicatas e problemas detectados
    this.addDuplicateAnalysis(duplicateAnalysis);
    
    // Análise legal detalhada
    this.addLegalAnalysis(auditResult.legalSummary);
    
    // Scripts detalhados
    this.addScriptsAnalysis(auditResult.embedCodes);
    
    // Eventos detalhados
    this.addEventsAnalysis(auditResult.events);
    
    // Violações e riscos
    if (auditResult.violationRisks && auditResult.violationRisks.length > 0) {
      this.addViolationsAnalysis(auditResult.violationRisks);
    }
    
    // Recomendações
    this.addRecommendations(auditResult.improvements);
    
    // Rodapé final
    this.addFooter();
    
    const fileName = `auditoria_lgpd_completa_${url.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    this.pdf.save(fileName);
    
    return fileName;
  }

  private addHeader(url: string): void {
    // Background colorido para o cabeçalho
    this.pdf.setFillColor(...this.colors.info);
    this.pdf.rect(0, 0, 210, 35, 'F');
    
    // Título principal
    this.pdf.setFontSize(24);
    this.pdf.setTextColor(...this.colors.white);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text('AUDITORIA LGPD COMPLETA', this.margin, this.currentY + 5);
    
    // Ícone e subtítulo
    this.currentY += 15;
    this.pdf.setFontSize(14);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.text(`Website: ${this.truncateText(url, 45)}`, this.margin, this.currentY);
    
    this.currentY += 8;
    this.pdf.setFontSize(11);
    this.pdf.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} as ${new Date().toLocaleTimeString('pt-BR')}`, this.margin, this.currentY);
    
    this.currentY = 45;
    this.pdf.setTextColor(...this.colors.primary);
  }

  private addExecutiveSummary(auditResult: AuditResult): void {
    this.checkPageBreak(50);
    
    // Box colorido para o resumo
    this.pdf.setFillColor(245, 247, 250);
    this.pdf.rect(this.margin - 5, this.currentY - 5, this.pageWidth + 10, 45, 'F');
    
    this.pdf.setFontSize(18);
    this.pdf.setTextColor(...this.colors.primary);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text('RESUMO EXECUTIVO', this.margin, this.currentY + 5);
    this.currentY += 15;
    
    this.pdf.setFontSize(10);
    this.pdf.setFont('helvetica', 'normal');
    
    const summaryItems = [
      { text: `Total de Codigos: ${auditResult.summary.totalCodes}`, color: this.colors.info },
      { text: `Codigos Antes do GTM: ${auditResult.summary.codesBeforeGTM}`, color: this.colors.warning },
      { text: `Total de Eventos: ${auditResult.summary.totalEvents}`, color: this.colors.success },
      { text: `Violacoes Criticas: ${auditResult.summary.criticalViolations}`, color: this.colors.danger },
      { text: `Violacoes Altas: ${auditResult.summary.highViolations}`, color: this.colors.warning },
      { text: `Universal Analytics: ${auditResult.summary.uaDetected ? 'Detectado' : 'Nao detectado'}`, color: auditResult.summary.uaDetected ? this.colors.danger : this.colors.success }
    ];
    
    summaryItems.forEach(item => {
      this.checkPageBreak(8);
      this.pdf.setTextColor(...item.color);
      this.pdf.text(`• ${item.text}`, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight + 1;
    });
    
    this.currentY += 10;
  }

  private addDuplicateAnalysis(analysis: any): void {
    if (analysis.duplicateEvents.length === 0 && 
        analysis.duplicateTags.length === 0 && 
        analysis.undefinedParameters.length === 0 && 
        analysis.tagInstallationIssues.length === 0) {
      return;
    }

    this.checkPageBreak(40);
    
    // Box de alerta vermelho
    this.pdf.setFillColor(254, 242, 242);
    this.pdf.rect(this.margin - 5, this.currentY - 5, this.pageWidth + 10, 10, 'F');
    
    this.pdf.setFontSize(16);
    this.pdf.setTextColor(...this.colors.danger);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text('PROBLEMAS DETECTADOS', this.margin, this.currentY + 2);
    this.currentY += 15;
    
    // Eventos duplicados
    if (analysis.duplicateEvents.length > 0) {
      this.addProblemSection('Eventos Duplicados:', analysis.duplicateEvents, this.colors.danger, 
        (duplicate: any) => `${duplicate.eventName} (${duplicate.count} ocorrencias)`);
    }
    
    // Tags duplicadas
    if (analysis.duplicateTags.length > 0) {
      this.addProblemSection('Tags Duplicadas:', analysis.duplicateTags, this.colors.danger,
        (duplicate: any) => `${duplicate.tagName} (${duplicate.count} instalacoes)`);
    }
    
    // Parâmetros undefined
    if (analysis.undefinedParameters.length > 0) {
      this.checkPageBreak(20);
      this.pdf.setFontSize(12);
      this.pdf.setTextColor(...this.colors.warning);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text('Parametros Indefinidos:', this.margin, this.currentY);
      this.currentY += 8;
      
      this.pdf.setFontSize(9);
      this.pdf.setTextColor(...this.colors.primary);
      this.pdf.setFont('helvetica', 'normal');
      
      analysis.undefinedParameters.forEach((param: any) => {
        this.checkPageBreak(15);
        this.pdf.text(`• ${param.eventName}:`, this.margin + 5, this.currentY);
        this.currentY += this.lineHeight;
        
        const suggestions = this.wrapText(`  Sugestoes: ${param.suggestions.join(', ')}`, this.pageWidth - 15);
        suggestions.forEach(line => {
          this.checkPageBreak(6);
          this.pdf.setTextColor(...this.colors.success);
          this.pdf.text(line, this.margin + 8, this.currentY);
          this.currentY += this.lineHeight;
        });
        this.pdf.setTextColor(...this.colors.primary);
      });
      this.currentY += 8;
    }
    
    // Problemas de instalação
    if (analysis.tagInstallationIssues.length > 0) {
      this.addProblemSection('Problemas de Instalacao:', analysis.tagInstallationIssues, this.colors.warning,
        (issue: any) => issue.tagName, (issue: any) => issue.recommendation);
    }
  }

  private addProblemSection(title: string, items: any[], color: [number, number, number], formatter: (item: any) => string, detailFormatter?: (item: any) => string): void {
    this.checkPageBreak(20);
    
    this.pdf.setFontSize(12);
    this.pdf.setTextColor(...color);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text(title, this.margin, this.currentY);
    this.currentY += 8;
    
    this.pdf.setFontSize(9);
    this.pdf.setTextColor(...this.colors.primary);
    this.pdf.setFont('helvetica', 'normal');
    
    items.forEach((item: any) => {
      this.checkPageBreak(12);
      this.pdf.text(`• ${formatter(item)}`, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
      
      if (detailFormatter) {
        const detailLines = this.wrapText(`  ${detailFormatter(item)}`, this.pageWidth - 15);
        detailLines.forEach(line => {
          this.checkPageBreak(6);
          this.pdf.setTextColor(...this.colors.secondary);
          this.pdf.text(line, this.margin + 8, this.currentY);
          this.currentY += this.lineHeight;
        });
        this.pdf.setTextColor(...this.colors.primary);
      }
    });
    this.currentY += 8;
  }

  private addLegalAnalysis(legalSummary: any): void {
    if (!legalSummary) return;
    
    this.checkPageBreak(50);
    
    // Box azul para análise legal
    this.pdf.setFillColor(239, 246, 255);
    this.pdf.rect(this.margin - 5, this.currentY - 5, this.pageWidth + 10, 40, 'F');
    
    this.pdf.setFontSize(16);
    this.pdf.setTextColor(...this.colors.info);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text('ANALISE LEGAL', this.margin, this.currentY + 2);
    this.currentY += 15;
    
    this.pdf.setFontSize(10);
    this.pdf.setFont('helvetica', 'normal');
    
    const legalItems = [
      { text: `Nivel de Risco: ${this.getRiskText(legalSummary.totalRiskLevel)}`, color: this.getRiskColor(legalSummary.totalRiskLevel) },
      { text: `Multa Estimada: ${legalSummary.estimatedTotalFine}`, color: this.colors.danger },
      { text: `Porte da Empresa: ${this.getCompanySizeText(legalSummary.companySize)}`, color: this.colors.info },
      { text: `Prova de Dano: ${this.getProofOfDamageText(legalSummary.proofOfDamage)}`, color: this.colors.warning }
    ];
    
    legalItems.forEach(item => {
      this.checkPageBreak(8);
      this.pdf.setTextColor(...item.color);
      this.pdf.text(`• ${item.text}`, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight + 1;
    });
    
    this.currentY += 15;
  }

  private addScriptsAnalysis(embedCodes: any[]): void {
    if (!embedCodes || embedCodes.length === 0) return;
    
    this.checkPageBreak(30);
    
    // Box verde para códigos
    this.pdf.setFillColor(240, 253, 244);
    this.pdf.rect(this.margin - 5, this.currentY - 5, this.pageWidth + 10, 15, 'F');
    
    this.pdf.setFontSize(16);
    this.pdf.setTextColor(...this.colors.success);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text('CODIGOS DE RASTREAMENTO', this.margin, this.currentY + 5);
    this.currentY += 20;
    
    embedCodes.forEach((code, index) => {
      this.checkPageBreak(30);
      
      this.pdf.setFontSize(12);
      this.pdf.setTextColor(...this.colors.primary);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(`${index + 1}. ${this.truncateText(code.name || 'Codigo Desconhecido', 40)}`, this.margin, this.currentY);
      this.currentY += 8;
      
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      
      const codeInfo = [
        { text: `Tipo: ${code.type || 'N/A'}`, color: this.colors.info },
        { text: `Posicao: #${code.position || 'N/A'}`, color: this.colors.secondary },
        { text: `Status GTM: ${code.isBeforeGTM ? 'Antes do GTM' : 'Depois do GTM'}`, color: code.isBeforeGTM ? this.colors.warning : this.colors.success },
        { text: `Compliance: ${this.getComplianceText(code.lgpdCompliance)}`, color: this.getComplianceColor(code.lgpdCompliance) }
      ];
      
      codeInfo.forEach(info => {
        this.checkPageBreak(6);
        this.pdf.setTextColor(...info.color);
        this.pdf.text(`• ${info.text}`, this.margin + 3, this.currentY);
        this.currentY += this.lineHeight;
      });
      
      this.currentY += 8;
    });
  }

  private addEventsAnalysis(events: any[]): void {
    if (!events || events.length === 0) return;
    
    this.checkPageBreak(30);
    
    // Box roxo para eventos
    this.pdf.setFillColor(245, 243, 255);
    this.pdf.rect(this.margin - 5, this.currentY - 5, this.pageWidth + 10, 15, 'F');
    
    this.pdf.setFontSize(16);
    this.pdf.setTextColor(...this.colors.purple);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text('EVENTOS DETECTADOS', this.margin, this.currentY + 5);
    this.currentY += 20;
    
    events.forEach((event, index) => {
      this.checkPageBreak(25);
      
      this.pdf.setFontSize(12);
      this.pdf.setTextColor(...this.colors.primary);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(`${index + 1}. ${this.truncateText(event.name || 'Evento Desconhecido', 40)}`, this.margin, this.currentY);
      this.currentY += 8;
      
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      
      const eventInfo = [
        { text: `Categoria: ${event.category || 'N/A'}`, color: this.colors.info },
        { text: `Origem: ${event.origin || 'N/A'}`, color: this.colors.secondary },
        { text: `Consentimento: ${event.hasConsent ? 'Sim' : 'Nao'}`, color: event.hasConsent ? this.colors.success : this.colors.danger },
        { text: `Tipo de Dado: ${this.getDataTypeText(event.dataType)}`, color: this.getDataTypeColor(event.dataType) }
      ];
      
      eventInfo.forEach(info => {
        this.checkPageBreak(6);
        this.pdf.setTextColor(...info.color);
        this.pdf.text(`• ${info.text}`, this.margin + 3, this.currentY);
        this.currentY += this.lineHeight;
      });
      
      this.currentY += 8;
    });
  }

  private addViolationsAnalysis(violationRisks: any[]): void {
    if (!violationRisks || violationRisks.length === 0) return;
    
    this.checkPageBreak(30);
    
    // Box vermelho para violações
    this.pdf.setFillColor(254, 242, 242);
    this.pdf.rect(this.margin - 5, this.currentY - 5, this.pageWidth + 10, 15, 'F');
    
    this.pdf.setFontSize(16);
    this.pdf.setTextColor(...this.colors.danger);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text('VIOLACOES E RISCOS', this.margin, this.currentY + 5);
    this.currentY += 20;
    
    violationRisks.forEach((violation, index) => {
      this.checkPageBreak(30);
      
      this.pdf.setFontSize(12);
      this.pdf.setTextColor(...this.colors.primary);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(`${index + 1}. ${this.truncateText(violation.eventName || 'Violacao', 40)}`, this.margin, this.currentY);
      this.currentY += 8;
      
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      
      const violationInfo = [
        { text: `Tipo de Dado: ${this.getDataTypeText(violation.dataType)}`, color: this.getDataTypeColor(violation.dataType) },
        { text: `Consentimento: ${violation.hasConsent ? 'Sim' : 'Nao'}`, color: violation.hasConsent ? this.colors.success : this.colors.danger },
        { text: `Gravidade: ${this.getSeverityText(violation.severity)}`, color: this.getSeverityColor(violation.severity) },
        { text: `Multa Potencial: ${violation.potentialFine}`, color: this.colors.danger }
      ];
      
      violationInfo.forEach(info => {
        this.checkPageBreak(6);
        this.pdf.setTextColor(...info.color);
        this.pdf.text(`• ${info.text}`, this.margin + 3, this.currentY);
        this.currentY += this.lineHeight;
      });
      
      // Descrição da violação
      if (violation.description) {
        this.checkPageBreak(12);
        this.pdf.setTextColor(...this.colors.secondary);
        this.pdf.text('Descricao:', this.margin + 3, this.currentY);
        this.currentY += this.lineHeight;
        
        const descriptionLines = this.wrapText(violation.description, this.pageWidth - 15);
        descriptionLines.forEach(line => {
          this.checkPageBreak(6);
          this.pdf.text(line, this.margin + 6, this.currentY);
          this.currentY += this.lineHeight;
        });
      }
      
      this.currentY += 8;
    });
  }

  private addRecommendations(improvements: any[]): void {
    if (!improvements || improvements.length === 0) return;
    
    this.checkPageBreak(30);
    
    // Box amarelo para recomendações
    this.pdf.setFillColor(255, 251, 235);
    this.pdf.rect(this.margin - 5, this.currentY - 5, this.pageWidth + 10, 15, 'F');
    
    this.pdf.setFontSize(16);
    this.pdf.setTextColor(...this.colors.warning);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text('RECOMENDACOES', this.margin, this.currentY + 5);
    this.currentY += 20;
    
    improvements.forEach((improvement, index) => {
      this.checkPageBreak(40);
      
      this.pdf.setFontSize(12);
      this.pdf.setTextColor(...this.colors.primary);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(`${index + 1}. ${this.truncateText(improvement.category || 'Recomendacao', 40)}`, this.margin, this.currentY);
      this.currentY += 10;
      
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      
      // Problema
      this.pdf.setTextColor(...this.colors.danger);
      this.pdf.text('Problema:', this.margin + 3, this.currentY);
      this.currentY += this.lineHeight;
      
      this.pdf.setTextColor(...this.colors.primary);
      const problemLines = this.wrapText(improvement.issue || '', this.pageWidth - 15);
      problemLines.forEach(line => {
        this.checkPageBreak(6);
        this.pdf.text(line, this.margin + 6, this.currentY);
        this.currentY += this.lineHeight;
      });
      
      this.currentY += 3;
      
      // Recomendação
      this.pdf.setTextColor(...this.colors.success);
      this.pdf.text('Recomendacao:', this.margin + 3, this.currentY);
      this.currentY += this.lineHeight;
      
      this.pdf.setTextColor(...this.colors.primary);
      const recommendationLines = this.wrapText(improvement.recommendation || '', this.pageWidth - 15);
      recommendationLines.forEach(line => {
        this.checkPageBreak(6);
        this.pdf.text(line, this.margin + 6, this.currentY);
        this.currentY += this.lineHeight;
      });
      
      this.currentY += 12;
    });
  }

  private addFooter(): void {
    this.checkPageBreak(25);
    
    // Linha separadora
    this.pdf.setDrawColor(...this.colors.secondary);
    this.pdf.line(this.margin, this.currentY, this.margin + this.pageWidth, this.currentY);
    this.currentY += 8;
    
    this.pdf.setFillColor(...this.colors.light);
    this.pdf.rect(this.margin - 5, this.currentY - 5, this.pageWidth + 10, 20, 'F');
    
    this.pdf.setFontSize(9);
    this.pdf.setTextColor(...this.colors.secondary);
    this.pdf.setFont('helvetica', 'italic');
    
    const footerLines = [
      'Relatorio gerado automaticamente pela ferramenta de Auditoria LGPD',
      'Este documento possui valor consultivo e deve ser analisado por especialista juridico',
      'Conforme Lei Geral de Protecao de Dados (Lei no 13.709/2018)'
    ];
    
    footerLines.forEach(line => {
      this.pdf.text(line, this.margin, this.currentY);
      this.currentY += this.lineHeight;
    });
  }

  private getRiskColor(risk: string): [number, number, number] {
    switch (risk) {
      case 'critical': return this.colors.danger;
      case 'high': return this.colors.warning;
      case 'medium': return this.colors.orange;
      default: return this.colors.success;
    }
  }

  private getDataTypeColor(dataType: string): [number, number, number] {
    if (dataType?.includes('sensível') || dataType?.includes('sensitive')) return this.colors.danger;
    if (dataType?.includes('pessoal') || dataType?.includes('simple')) return this.colors.warning;
    return this.colors.info;
  }

  private getSeverityColor(severity: string): [number, number, number] {
    switch (severity) {
      case 'critical': return this.colors.danger;
      case 'high': return this.colors.warning;
      case 'medium': return this.colors.orange;
      default: return this.colors.success;
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  private checkPageBreak(requiredSpace: number): void {
    if (this.currentY + requiredSpace > this.pageHeight) {
      this.pdf.addPage();
      this.currentY = 20;
    }
  }

  private wrapText(text: string, maxWidth: number): string[] {
    if (!text) return [''];
    
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const textWidth = this.pdf.getTextWidth(testLine);
      
      if (textWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.length > 0 ? lines : [''];
  }

  private getComplianceColor(compliance: string): [number, number, number] {
    switch (compliance) {
      case 'compliant': return this.colors.success;
      case 'warning': return this.colors.warning;
      default: return this.colors.danger;
    }
  }

  private getRiskText(risk: string): string {
    switch (risk) {
      case 'critical': return 'CRITICO';
      case 'high': return 'ALTO';
      case 'medium': return 'MEDIO';
      default: return 'BAIXO';
    }
  }

  private getCompanySizeText(size: string): string {
    switch (size) {
      case 'large': return 'Grande Porte';
      case 'medium': return 'Medio Porte';
      default: return 'Pequeno Porte';
    }
  }

  private getProofOfDamageText(proof: string): string {
    switch (proof) {
      case 'material': return 'Dano Material';
      case 'proven': return 'Dano Comprovado';
      case 'presumed': return 'Dano Presumido';
      default: return 'Sem Dano';
    }
  }

  private getComplianceText(compliance: string): string {
    switch (compliance) {
      case 'compliant': return 'Conforme';
      case 'warning': return 'Atencao';
      default: return 'Violacao';
    }
  }

  private getDataTypeText(dataType: string): string {
    switch (dataType) {
      case 'sensitive': return 'Sensivel';
      case 'simple': return 'Pessoal';
      default: return 'Outros';
    }
  }

  private getSeverityText(severity: string): string {
    switch (severity) {
      case 'critical': return 'Critico';
      case 'high': return 'Alto';
      case 'medium': return 'Medio';
      default: return 'OK';
    }
  }
}
