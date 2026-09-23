
import { AuditResult } from '@/types/audit';
import { EnhancedPdfService } from '@/services/enhancedPdfService';

export const exportToPDF = async (auditResult: AuditResult, url: string): Promise<string> => {
  try {
    console.log('🔄 Iniciando geração de PDF aprimorado...');
    
    const pdfService = new EnhancedPdfService();
    const fileName = await pdfService.generateComprehensiveReport(auditResult, url);
    
    console.log('✅ PDF gerado com sucesso:', fileName);
    return fileName;
  } catch (error) {
    console.error('❌ Erro na geração do PDF:', error);
    throw error;
  }
};
