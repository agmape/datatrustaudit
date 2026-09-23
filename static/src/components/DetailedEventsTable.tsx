
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, AlertTriangle, CheckCircle, Shield, Database } from 'lucide-react';
import { Event } from '@/types/audit';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DetailedEventsTableProps {
  events: Event[];
}

const DetailedEventsTable = ({ events }: DetailedEventsTableProps) => {
  const getValidationColor = (status: string) => {
    switch (status) {
      case 'complete': return 'bg-green-100 text-green-800 border-green-300';
      case 'incomplete': return 'bg-red-100 text-red-800 border-red-300';
      case 'invalid': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'ok': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (events.length === 0) {
    return (
      <Card className="mb-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Eventos GA4 - Análise Detalhada
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum evento GA4 detectado neste site</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Eventos GA4 - Análise Detalhada e Validação LGPD
        </CardTitle>
        <CardDescription>
          Análise completa de eventos com validação de parâmetros obrigatórios e compliance LGPD
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-800">
            <strong>Total de eventos analisados:</strong> {events.length}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento & Categoria</TableHead>
                <TableHead>Origem & Validação</TableHead>
                <TableHead>Dados Coletados</TableHead>
                <TableHead>Compliance LGPD</TableHead>
                <TableHead>Parâmetros</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event, index) => (
                <TableRow key={index} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="space-y-2">
                      <div className="font-medium font-mono text-sm">
                        {event.name}
                      </div>
                      <Badge className="bg-indigo-100 text-indigo-800">
                        {event.category}
                      </Badge>
                      {event.realEvent && (
                        <Badge className="bg-green-100 text-green-800 text-xs">
                          ✅ Evento Real
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">{event.origin}</div>
                      
                      {event.validation && (
                        <div className="space-y-1">
                          <Badge className={getValidationColor(event.validation.status)}>
                            {event.validation.status === 'complete' ? '✅ Completo' :
                             event.validation.status === 'incomplete' ? '❌ Incompleto' : '⚠️ Inválido'}
                          </Badge>
                          
                          {Array.isArray(event.validation.missingParams) && event.validation.missingParams.length > 0 && (
                             <div className="text-xs text-red-600">
                               <strong>Faltam:</strong> {(event.validation.missingParams || []).join(', ')}
                             </div>
                          )}
                          
                          {Array.isArray(event.validation.extraParams) && event.validation.extraParams.length > 0 && (
                             <div className="text-xs text-yellow-600">
                               <strong>Extras:</strong> {(event.validation.extraParams || []).join(', ')}
                             </div>
                          )}
                        </div>
                      )}
                      
                      {event.url && (
                        <div className="text-xs text-gray-600 font-mono">
                          🌐 {event.url.substring(0, 30)}...
                        </div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-2">
                      {event.dataCollected ? (
                        <div>
                          <Badge className="bg-red-100 text-red-800 text-xs mb-1">
                            <Database className="h-3 w-3 mr-1" />
                            Dados coletados
                          </Badge>
                          <div className="text-xs text-gray-700 bg-red-50 p-2 rounded border">
                            {event.dataCollected}
                          </div>
                        </div>
                      ) : (
                        <Badge className="bg-green-100 text-green-800 text-xs">
                          ✅ Sem coleta detectada
                        </Badge>
                      )}
                      
                      <Badge className={`text-xs ${
                        event.dataType === 'sensitive' ? 'bg-red-100 text-red-800' :
                        event.dataType === 'simple' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {event.dataType === 'sensitive' ? '🔴 Dados Sensíveis' :
                         event.dataType === 'simple' ? '🟡 Dados Pessoais' : '🟢 Outros'}
                      </Badge>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {event.hasConsent ? (
                          <Badge className="bg-green-100 text-green-800 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Com consentimento
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Sem consentimento
                          </Badge>
                        )}
                      </div>

                      {event.violationSeverity && event.violationSeverity !== 'ok' && (
                        <Badge className={getSeverityColor(event.violationSeverity)}>
                          <Shield className="h-3 w-3 mr-1" />
                          {event.violationSeverity === 'critical' ? '🔴 Crítico' :
                           event.violationSeverity === 'high' ? '🟠 Alto' : '🟡 Médio'}
                        </Badge>
                      )}

                      {event.legalRisk && (
                        <div className="text-xs text-gray-700">
                          <strong>Multa estimada:</strong> {event.legalRisk.estimatedFine}
                        </div>
                      )}

                      {event.violationReason && (
                        <div className="text-xs text-red-600 bg-red-50 p-1 rounded">
                          ⚠️ {event.violationReason}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="max-w-xs">
                       <div className="text-xs font-mono bg-gray-100 p-2 rounded border">
                         {(event.parameters || '').length > 100 ? (
                          <TooltipProvider>
                            <Tooltip>
                               <TooltipTrigger className="cursor-help">
                                 {(event.parameters || '').substring(0, 100)}...
                               </TooltipTrigger>
                               <TooltipContent>
                                 <pre className="max-w-md whitespace-pre-wrap text-xs">
                                   {event.parameters || ''}
                                 </pre>
                               </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                         ) : (
                           event.parameters || ''
                         )}
                      </div>
                      
                      {event.validation?.validationMessage && (
                        <div className="text-xs text-gray-600 mt-1">
                          💬 {event.validation.validationMessage}
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

export default DetailedEventsTable;
