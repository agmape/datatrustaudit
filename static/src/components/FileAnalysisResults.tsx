
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  Copy, 
  Users, 
  TrendingUp,
  Shield,
  Bug,
  Target,
  MapPin
} from 'lucide-react';

interface FileAnalysisResultsProps {
  analysisResult: any;
}

const FileAnalysisResults = ({ analysisResult }: FileAnalysisResultsProps) => {
  if (!analysisResult) return null;

  const { scripts, events, duplicates, tagPositions, compliance, summary } = analysisResult;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high': return <AlertTriangle className="h-4 w-4" />;
      case 'error': return <AlertTriangle className="h-4 w-4" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Resumo Executivo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Resumo da Análise
          </CardTitle>
          <CardDescription>
            Visão geral dos resultados encontrados nos arquivos analisados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{summary.totalScripts}</div>
              <div className="text-sm text-blue-800">Scripts Detectados</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{summary.totalEvents}</div>
              <div className="text-sm text-green-800">Eventos Encontrados</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{summary.duplicateCount}</div>
              <div className="text-sm text-orange-800">Duplicatas</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{summary.complianceScore}%</div>
              <div className="text-sm text-purple-800">Score LGPD</div>
            </div>
          </div>

          {summary.mainIssues.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Principais problemas encontrados:</strong>
                <ul className="mt-2 space-y-1">
                  {summary.mainIssues.map((issue, index) => (
                    <li key={index}>• {issue}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Detalhes em Abas */}
      <Tabs defaultValue="scripts" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicatas</TabsTrigger>
          <TabsTrigger value="positioning">Posicionamento</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>

        {/* Aba Scripts */}
        <TabsContent value="scripts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Scripts Detectados ({scripts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {scripts.map((script, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold">{script.name}</h4>
                        <p className="text-sm text-gray-600">
                          {script.file} • Linha {script.lineNumber}
                        </p>
                      </div>
                      <Badge className={getSeverityColor(script.violationLevel)}>
                        {getSeverityIcon(script.violationLevel)}
                        <span className="ml-1 capitalize">{script.violationLevel}</span>
                      </Badge>
                    </div>

                    <div className="bg-gray-50 p-3 rounded mb-3">
                      <code className="text-sm">{script.code}</code>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h5 className="font-medium mb-2">Dados Coletados:</h5>
                        <ul className="text-sm space-y-1">
                          {script.dataCollected.map((data, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                              <Users className="h-3 w-3 text-gray-500" />
                              {data}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {script.implementationIssues.length > 0 && (
                        <div>
                          <h5 className="font-medium mb-2 text-orange-700">Problemas de Implementação:</h5>
                          <ul className="text-sm space-y-1">
                            {script.implementationIssues.map((issue, idx) => (
                              <li key={idx} className="flex items-center gap-2 text-orange-700">
                                <Bug className="h-3 w-3" />
                                {issue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Eventos */}
        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Eventos Detectados ({events.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {events.map((event, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold">{event.name}</h4>
                        <p className="text-sm text-gray-600">
                          {event.file} • Linha {event.lineNumber}
                        </p>
                      </div>
                      <Badge 
                        className={event.validationStatus === 'valid' ? 
                          'bg-green-100 text-green-800 border-green-300' : 
                          'bg-red-100 text-red-800 border-red-300'
                        }
                      >
                        {event.validationStatus === 'valid' ? <CheckCircle className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                        {event.validationStatus}
                      </Badge>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <h5 className="font-medium mb-2">Parâmetros Encontrados:</h5>
                        <div className="flex flex-wrap gap-1">
                          {event.parameters.map((param, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {param}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h5 className="font-medium mb-2">Parâmetros Obrigatórios:</h5>
                        <div className="flex flex-wrap gap-1">
                          {event.requiredParams.map((param, idx) => (
                            <Badge key={idx} className="bg-blue-100 text-blue-800 border-blue-300 text-xs">
                              {param}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {event.undefinedParams.length > 0 && (
                        <div>
                          <h5 className="font-medium mb-2 text-red-700">Problemas:</h5>
                          <div className="flex flex-wrap gap-1">
                            {event.undefinedParams.map((param, idx) => (
                              <Badge key={idx} className="bg-red-100 text-red-800 border-red-300 text-xs">
                                {param}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Duplicatas */}
        <TabsContent value="duplicates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Copy className="h-5 w-5" />
                Duplicatas Detectadas ({duplicates.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {duplicates.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p>Nenhuma duplicata detectada! 🎉</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {duplicates.map((duplicate, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold">{duplicate.name}</h4>
                          <p className="text-sm text-gray-600">
                            {duplicate.count} ocorrências encontradas
                          </p>
                        </div>
                        <Badge className={getSeverityColor(duplicate.severity)}>
                          {getSeverityIcon(duplicate.severity)}
                          <span className="ml-1 capitalize">{duplicate.severity}</span>
                        </Badge>
                      </div>

                      <div className="mb-3">
                        <h5 className="font-medium mb-2">Localizações:</h5>
                        <div className="space-y-1">
                          {duplicate.locations.map((location, idx) => (
                            <div key={idx} className="text-sm bg-gray-50 p-2 rounded">
                              <strong>{location.file}</strong> • Linha {location.lineNumber}
                            </div>
                          ))}
                        </div>
                      </div>

                      <Alert>
                        <AlertDescription>
                          <strong>Recomendação:</strong> {duplicate.recommendation}
                        </AlertDescription>
                      </Alert>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Posicionamento */}
        <TabsContent value="positioning">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Análise de Posicionamento ({tagPositions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tagPositions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p>Posicionamento das tags está adequado! 👍</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tagPositions.map((position, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold">{position.tag}</h4>
                          <p className="text-sm text-gray-600">
                            Posição atual: #{position.position}
                          </p>
                        </div>
                      </div>

                      {position.issues.length > 0 && (
                        <div className="mb-3">
                          <h5 className="font-medium mb-2 text-orange-700">Problemas Identificados:</h5>
                          <ul className="space-y-1">
                            {position.issues.map((issue, idx) => (
                              <li key={idx} className="flex items-center gap-2 text-orange-700 text-sm">
                                <AlertTriangle className="h-3 w-3" />
                                {issue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <Alert>
                        <AlertDescription>
                          <strong>Recomendação:</strong> {position.recommendation}
                        </AlertDescription>
                      </Alert>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Compliance */}
        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Indicadores Técnicos de Privacidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Status Geral */}
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-lg font-bold text-blue-600">
                      {compliance.consentDetected ? 'Detectado' : 'Ausente'}
                    </div>
                    <div className="text-sm text-blue-800">Sistema de Consentimento</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-lg font-bold text-purple-600 capitalize">
                      {compliance.consentType}
                    </div>
                    <div className="text-sm text-purple-800">Tipo de Consentimento</div>
                  </div>
                  <div className={`text-center p-4 rounded-lg ${
                    compliance.lgpdCompliant ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    <div className={`text-lg font-bold ${
                      compliance.lgpdCompliant ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {compliance.lgpdCompliant ? 'Sem sinal crítico observado' : 'Requer revisão'}
                    </div>
                    <div className={`text-sm ${
                      compliance.lgpdCompliant ? 'text-green-800' : 'text-red-800'
                    }`}>
                      Status técnico
                    </div>
                  </div>
                </div>

                {/* Violações */}
                {compliance.violations.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-4">Indicadores Técnicos ({compliance.violations.length})</h3>
                    <div className="space-y-3">
                      {compliance.violations.map((violation, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-medium">{violation.script}</h4>
                            <Badge className={getSeverityColor(violation.severity)}>
                              {getSeverityIcon(violation.severity)}
                              <span className="ml-1 capitalize">{violation.severity}</span>
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{violation.violation}</p>
                          <Badge variant="outline" className="text-xs">
                            {violation.article}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Monetary exposure cannot be inferred from a technical file scan */}
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Exposição monetária:</strong> {compliance.estimatedFine}
                    <br />
                    <span className="text-sm text-gray-600 mt-1 block">
                      Uma análise estática não determina infração jurídica nem valor de sanção. Requer avaliação do contexto e base legal.
                    </span>
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FileAnalysisResults;
