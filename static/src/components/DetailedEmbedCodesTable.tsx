
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Code, AlertTriangle, CheckCircle, Info, Eye } from 'lucide-react';
import { EmbedCode } from '@/types/audit';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DetailedEmbedCodesTableProps {
  embedCodes: EmbedCode[];
  gtmPosition: number;
  useViewSource: boolean;
}

const DetailedEmbedCodesTable = ({ embedCodes, gtmPosition, useViewSource }: DetailedEmbedCodesTableProps) => {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'ok': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getComplianceIcon = (compliance: string) => {
    switch (compliance) {
      case 'compliant': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'violation': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return <Info className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <Card className="mb-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Códigos de Rastreamento - Análise Detalhada
        </CardTitle>
        <CardDescription>
          Análise completa de todos os códigos encontrados com verificação LGPD detalhada
          {useViewSource && (
            <Badge className="ml-2 bg-orange-100 text-orange-800">
              <Eye className="h-3 w-3 mr-1" />
              Análise view-source ativa
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-800">
            <strong>Posição do GTM:</strong> #{gtmPosition} | 
            <strong className="ml-2">Total de códigos:</strong> {embedCodes.length}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome & Tipo</TableHead>
                <TableHead>Posição & Status</TableHead>
                <TableHead>Compliance LGPD</TableHead>
                <TableHead>Dados Coletados</TableHead>
                <TableHead>Risco Legal</TableHead>
                <TableHead>Código</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {embedCodes.map((code, index) => (
                <TableRow key={index} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{code.name}</div>
                      <Badge variant="outline" className="text-xs">
                        {code.type}
                      </Badge>
                      {code.realScript && (
                        <Badge className="bg-green-100 text-green-800 text-xs">
                          ✅ Script Real
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="space-y-1">
                      <Badge className="bg-blue-100 text-blue-800">
                        Posição #{code.position}
                      </Badge>
                      <div className="text-xs">
                        {code.isBeforeGTM ? (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Antes do GTM
                          </span>
                        ) : (
                          <span className="text-orange-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Depois do GTM
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {getComplianceIcon(code.lgpdCompliance || 'compliant')}
                        <Badge className={getSeverityColor(code.violationSeverity || 'ok')}>
                          {code.violationSeverity === 'critical' ? '🔴 Crítico' :
                           code.violationSeverity === 'high' ? '🟠 Alto' :
                           code.violationSeverity === 'medium' ? '🟡 Médio' : '🟢 OK'}
                        </Badge>
                      </div>
                      {Array.isArray(code.lgpdArticles) && code.lgpdArticles.length > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                               <Badge className="bg-purple-100 text-purple-800 text-xs cursor-help">
                                 📋 {(code.lgpdArticles || []).length} artigos LGPD
                               </Badge>
                             </TooltipTrigger>
                             <TooltipContent>
                               <p>Artigos aplicáveis: {(code.lgpdArticles || []).join(', ')}</p>
                             </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <div className="text-xs text-gray-600">
                        {code.complianceMessage}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-2">
                      {Array.isArray(code.detectedData) && code.detectedData.length > 0 ? (
                        <div>
                           <Badge className="bg-red-100 text-red-800 text-xs mb-1">
                             🚨 {(code.detectedData || []).length} tipos detectados
                           </Badge>
                           <div className="text-xs text-gray-600">
                             {(code.detectedData || []).slice(0, 3).join(', ')}
                             {(code.detectedData || []).length > 3 && '...'}
                           </div>
                        </div>
                      ) : (
                        <Badge className="bg-green-100 text-green-800 text-xs">
                          ✅ Sem coleta detectada
                        </Badge>
                      )}
                      
                      <Badge className={`text-xs ${
                        code.dataType === 'sensitive' ? 'bg-red-100 text-red-800' :
                        code.dataType === 'simple' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {code.dataType === 'sensitive' ? '🔴 Dados Sensíveis' :
                         code.dataType === 'simple' ? '🟡 Dados Pessoais' : '🟢 Outros'}
                      </Badge>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      {code.legalRisk ? (
                        <>
                          <Badge className={`text-xs ${getSeverityColor(code.legalRisk.level)}`}>
                            {code.legalRisk.level === 'critical' ? '🔴 Crítico' :
                             code.legalRisk.level === 'high' ? '🟠 Alto' :
                             code.legalRisk.level === 'medium' ? '🟡 Médio' : '🟢 Baixo'}
                          </Badge>
                          <div className="text-xs font-medium text-gray-900">
                            {code.legalRisk.estimatedFine}
                          </div>
                          <div className="text-xs text-gray-600">
                            {code.legalRisk.description}
                          </div>
                        </>
                      ) : (
                        <Badge className="text-xs bg-gray-100 text-gray-800">
                          Sem risco identificado
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="max-w-xs">
                       <div className="text-xs font-mono bg-gray-100 p-2 rounded border overflow-hidden">
                         {(code.code || '').length > 100 ? (
                          <TooltipProvider>
                            <Tooltip>
                               <TooltipTrigger className="cursor-help">
                                 {(code.code || '').substring(0, 100)}...
                               </TooltipTrigger>
                               <TooltipContent>
                                 <pre className="max-w-md whitespace-pre-wrap text-xs">
                                   {code.code || ''}
                                 </pre>
                               </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                         ) : (
                           code.code || ''
                         )}
                      </div>
                      {code.scriptAnalysis && (
                         <div className="mt-2 space-y-1">
                           <div className="text-xs text-gray-600">
                             📊 {code.scriptAnalysis?.codeLength || 0} chars | 
                             {code.scriptAnalysis?.hasExternalCalls ? ' 🌐 Ext calls' : ''} |
                             {code.scriptAnalysis?.isMinified ? ' 📦 Minified' : ''}
                           </div>
                           {Array.isArray(code.scriptAnalysis?.issues) && code.scriptAnalysis.issues.length > 0 && (
                             <Badge className="bg-yellow-100 text-yellow-800 text-xs">
                               ⚠️ {code.scriptAnalysis.issues.length} problemas
                             </Badge>
                           )}
                         </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default DetailedEmbedCodesTable;
