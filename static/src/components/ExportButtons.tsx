
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { AuditResult } from '@/types/audit';
import { exportToXLSX } from '@/utils/exportUtils';
import { exportToPDF } from '@/utils/pdfExportUtils';

interface ExportButtonsProps {
  auditResult: AuditResult;
  currentAuditUrl: string;
  url: string;
}

const ExportButtons = ({ auditResult, currentAuditUrl, url }: ExportButtonsProps) => {
  const handleExport = () => {
    if (!auditResult) return;

    try {
      const universalAnalyticsCount = auditResult.universalAnalytics?.length || 0;
      const fileName = exportToXLSX(auditResult, currentAuditUrl || url);
      toast({
        title: "📊 Exportação Excel Concluída!",
        description: `${fileName} baixado com análise completa em ${universalAnalyticsCount > 0 ? '6' : '5'} abas detalhadas!`
      });
    } catch (error) {
      console.error('Erro na exportação:', error);
      toast({
        title: "Erro na Exportação",
        description: "Ocorreu um erro ao exportar os dados. Tente novamente.",
        variant: "destructive"
      });
    }
  };

  const handleExportPDF = async () => {
    if (!auditResult) return;

    try {
      toast({
        title: "🔄 Gerando Relatório PDF...",
        description: "Criando relatório executivo com análise jurídica completa...",
      });
      
      const fileName = await exportToPDF(auditResult, currentAuditUrl || url);
      
      toast({
        title: "📄 Relatório PDF Completo!",
        description: `${fileName} - Análise jurídica detalhada com formatação profissional`,
      });
    } catch (error) {
      console.error('Erro na exportação PDF:', error);
      toast({
        title: "Erro na Exportação PDF",
        description: "Ocorreu um erro ao gerar o PDF. Tente novamente.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="text-center space-y-6">
      <div className="flex justify-center gap-4">
        <Button 
          onClick={handleExport}
          size="lg"
          className="px-8 py-4 bg-green-600 hover:bg-green-700 text-lg font-semibold"
        >
          <Download className="h-5 w-5 mr-2" />
          📊 Exportar Dados (Excel)
        </Button>
        
        <Button 
          onClick={handleExportPDF}
          size="lg"
          className="px-8 py-4 bg-red-600 hover:bg-red-700 text-lg font-semibold"
        >
          <Download className="h-5 w-5 mr-2" />
          📄 Relatório Executivo (PDF)
        </Button>
      </div>
    </div>
  );
};

export default ExportButtons;
