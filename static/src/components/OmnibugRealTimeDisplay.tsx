import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Globe, 
  Code,
  Database,
  Shield,
  Zap,
  TrendingUp,
  Settings
} from 'lucide-react';
import { OmnibugRealDataService } from '@/services/omnibugRealDataService';
import { OmnibugAnalysisResult } from '@/types/omnibug';
import OmnibugConfig from './OmnibugConfig';

interface OmnibugRealTimeDisplayProps {
  url: string;
  onComplete?: (results: OmnibugAnalysisResult) => void;
}

const OmnibugRealTimeDisplay = ({ url, onComplete }: OmnibugRealTimeDisplayProps) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<OmnibugAnalysisResult | null>(null);
  const [currentStep, setCurrentStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [showConfig, setShowConfig] = useState(false);

  const handleAnalysis = async () => {
    if (!url) return;
    
    setIsAnalyzing(true);
    setProgress(0);
    setCurrentStep('Conectando ao site...');
    
    try {
      const omnibugService = OmnibugRealDataService.getInstance();
      
      // Simular progresso
      const steps = [
        'Conectando ao site...',
        'Capturando código fonte...',
        'Analisando scripts em tempo real...',
        'Detectando eventos GA4...',
        'Verificando Meta Pixel...',
        'Analisando DataLayer...',
        'Verificando compliance LGPD...',
        'Gerando relatório completo...'
      ];
      
      for (let i = 0; i < steps.length; i++) {
        setCurrentStep(steps[i]);
        setProgress((i + 1) / steps.length * 100);
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      const analysisResults = await omnibugService.captureRealData(url);
      setResults(analysisResults);
      onComplete?.(analysisResults);
      
    } catch (error) {
      console.error('Erro na análise Omnibug:', error);
    } finally {
      setIsAnalyzing(false);
      setCurrentStep('');
      setProgress(100);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const getPixelColor = (pixelType: string) => {
    switch (pixelType) {
      case 'GA4': return 'bg-blue-500';
      case 'Meta': return 'bg-blue-600';
      case 'LinkedIn': return 'bg-blue-700';
      case 'TikTok': return 'bg-black';
      case 'Pinterest': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (!results && !isAnalyzing) {
    return (
      <div className="space-y-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Análise Omnibug em Tempo Real
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowConfig(!showConfig)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Configurar
              </Button>
            </CardTitle>
            <CardDescription>
              Captura dados reais do site usando a extensão Omnibug ou análise interna avançada
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleAnalysis} className="w-full" size="lg" disabled={!url}>
              <Globe className="h-4 w-4 mr-2" />
              Iniciar Captura Real de Dados
            </Button>
          </CardContent>
        </Card>
        
        {showConfig && <OmnibugConfig />}
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 animate-pulse" />
            Capturando Dados em Tempo Real
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-sm text-muted-foreground">{currentStep}</p>
          </div>
          <Progress value={progress} className="w-full" />
          <p className="text-xs text-center text-muted-foreground">
            Analisando como Omnibug: {Math.round(progress)}%
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!results) return null;

  return (
    <div className="space-y-6">
      {/* Header com Resumo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Análise Omnibug Completa
            </div>
            <Badge variant={results.compliance.score > 70 ? 'default' : 'destructive'}>
              Score: {results.compliance.score}/100
            </Badge>
          </CardTitle>
          <CardDescription>
            {results.url} • {results.events.length} eventos • {results.scripts.length} scripts detectados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{results.events.length}</div>
              <div className="text-sm text-muted-foreground">Eventos Capturados</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{results.scripts.length}</div>
              <div className="text-sm text-muted-foreground">Scripts Detectados</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{results.compliance.violations.length}</div>
              <div className="text-sm text-muted-foreground">Violações LGPD</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{results.performance.loadTime}ms</div>
              <div className="text-sm text-muted-foreground">Tempo de Análise</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert de Consentimento */}
      {!results.consentMechanism.compliant && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Crítico:</strong> Consentimento LGPD não conforme detectado. 
            {results.consentMechanism.issues.length > 0 && ` Problemas: ${results.consentMechanism.issues.join(', ')}`}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="events" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="events">
            <Database className="h-4 w-4 mr-1" />
            Eventos ({results.events.length})
          </TabsTrigger>
          <TabsTrigger value="scripts">
            <Code className="h-4 w-4 mr-1" />
            Scripts ({results.scripts.length})
          </TabsTrigger>
          <TabsTrigger value="compliance">
            <Shield className="h-4 w-4 mr-1" />
            LGPD ({results.compliance.violations.length})
          </TabsTrigger>
          <TabsTrigger value="network">
            <Zap className="h-4 w-4 mr-1" />
            Network ({results.networkActivity.totalRequests})
          </TabsTrigger>
          <TabsTrigger value="performance">
            <TrendingUp className="h-4 w-4 mr-1" />
            Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          {results.events.map((event, index) => (
            <Card key={index}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className={`w-3 h-3 rounded-full ${getPixelColor(event.pixelType)}`}></div>
                    {event.name}
                    <Badge variant="outline">{event.pixelType}</Badge>
                  </CardTitle>
                  <div className="flex gap-2">
                    {event.beforeConsent && (
                      <Badge variant="destructive">Antes do Consentimento</Badge>
                    )}
                    {event.missingParams.length > 0 && (
                      <Badge variant="secondary">Parâmetros Faltando</Badge>
                    )}
                    {event.malformedParams.length > 0 && (
                      <Badge variant="destructive">Parâmetros Malformados</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Parâmetros Detectados:</h4>
                    <div className="bg-muted p-3 rounded text-sm">
                      <pre>{JSON.stringify(event.parameters, null, 2)}</pre>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {event.requiredParams.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1">Parâmetros Obrigatórios:</h4>
                        <div className="flex flex-wrap gap-1">
                          {event.requiredParams.map(param => (
                            <Badge 
                              key={param} 
                              variant={event.missingParams.includes(param) ? 'destructive' : 'default'}
                            >
                              {param}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {event.missingParams.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1 text-red-600">Parâmetros Faltando:</h4>
                        <div className="flex flex-wrap gap-1">
                          {event.missingParams.map(param => (
                            <Badge key={param} variant="destructive">{param}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {event.malformedParams.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1 text-red-600">Parâmetros Malformados:</h4>
                        <div className="text-sm text-red-600">
                          {event.malformedParams.map(param => (
                            <div key={param}>• {param}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="font-medium mb-1">Network Request:</h4>
                      <div className="text-sm text-muted-foreground">
                        <div>{event.networkRequest.method} {event.networkRequest.url}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {event.violations.length > 0 && (
                  <div className="border-t pt-3">
                    <h4 className="font-medium mb-2 text-red-600">Violações LGPD:</h4>
                    {event.violations.map((violation, vIndex) => (
                      <Alert key={vIndex} variant="destructive" className="mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>{violation.article}:</strong> {violation.description}
                          <br />
                          <strong>Recomendação:</strong> {violation.recommendation}
                          <br />
                          <strong>Multa Estimada:</strong> {violation.estimatedFine}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="scripts" className="space-y-4">
          {results.scripts.map((script, index) => (
            <Card key={index}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Badge variant="outline">{script.vendor}</Badge>
                    {script.name}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge variant={script.beforeConsent ? 'destructive' : 'default'}>
                      {script.beforeConsent ? 'Antes do Consentimento' : 'Após Consentimento'}
                    </Badge>
                    <Badge variant="secondary">{script.loadTime.toFixed(0)}ms</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Dados Coletados:</h4>
                    <ul className="text-sm space-y-1">
                      {script.dataCollected.map((data, dIndex) => (
                        <li key={dIndex} className="flex items-center gap-2">
                          <XCircle className="h-3 w-3 text-red-500" />
                          {data}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Transferências de Dados:</h4>
                    {script.dataTransfers.map((transfer, tIndex) => (
                      <div key={tIndex} className="bg-muted p-3 rounded text-sm mb-2">
                        <div><strong>Destino:</strong> {transfer.destination}</div>
                        <div><strong>País:</strong> {transfer.country}</div>
                        <div><strong>Base Legal:</strong> {transfer.legalBasis}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Código Inline Detectado:</h4>
                  <div className="bg-muted p-3 rounded text-sm font-mono">
                    <pre>{script.inlineCode}</pre>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Dados em Tempo Real:</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <strong>Conexões Ativas:</strong> {script.realTimeData.activeConnections}
                    </div>
                    <div>
                      <strong>Fluxo de Dados:</strong>
                      <ul className="mt-1 space-y-1">
                        {script.realTimeData.dataFlow.map((flow, fIndex) => (
                          <li key={fIndex} className="text-muted-foreground">• {flow}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Identificadores:</strong>
                      <ul className="mt-1 space-y-1">
                        {script.realTimeData.userIdentifiers.map((id, idIndex) => (
                          <li key={idIndex} className="text-muted-foreground">• {id}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {script.lgpdViolations.length > 0 && (
                  <div className="border-t pt-3">
                    <h4 className="font-medium mb-2 text-red-600">Violações LGPD:</h4>
                    {script.lgpdViolations.map((violation, vIndex) => (
                      <Alert key={vIndex} variant="destructive" className="mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>{violation.article}:</strong> {violation.description}
                          <br />
                          <strong>Evidência:</strong> {violation.evidence}
                          <br />
                          <strong>Multa Estimada:</strong> {violation.estimatedFine}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Análise de Conformidade LGPD
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Score de Conformidade:</span>
                <div className="flex items-center gap-2">
                  <Progress value={results.compliance.score} className="w-32" />
                  <Badge variant={results.compliance.score > 70 ? 'default' : 'destructive'}>
                    {results.compliance.score}/100
                  </Badge>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Recomendações Prioritárias:</h4>
                <ul className="space-y-2">
                  {results.compliance.recommendations.map((rec, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                      <span className="text-sm">{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-medium mb-3">Todas as Violações Detectadas:</h4>
                <div className="space-y-3">
                  {results.compliance.violations.map((violation, index) => (
                    <Alert key={index} variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="flex items-center justify-between mb-2">
                          <strong>{violation.article}</strong>
                          <Badge variant={getSeverityColor(violation.severity)}>
                            {violation.severity.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <div><strong>Descrição:</strong> {violation.description}</div>
                          <div><strong>Evidência:</strong> {violation.evidence}</div>
                          <div><strong>Recomendação:</strong> {violation.recommendation}</div>
                          <div><strong>Multa Estimada:</strong> {violation.estimatedFine}</div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="network" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Atividade de Rede Detectada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-2xl font-bold">{results.networkActivity.totalRequests}</div>
                  <div className="text-sm text-muted-foreground">Total de Requests</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{results.networkActivity.analyticsRequests}</div>
                  <div className="text-sm text-muted-foreground">Analytics</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{results.networkActivity.advertisingRequests}</div>
                  <div className="text-sm text-muted-foreground">Advertising</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{results.networkActivity.dataTransfers}</div>
                  <div className="text-sm text-muted-foreground">Transferências</div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Mecanismo de Consentimento:</h4>
                <div className="bg-muted p-4 rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Status:</span>
                    <Badge variant={results.consentMechanism.compliant ? 'default' : 'destructive'}>
                      {results.consentMechanism.detected ? 'Detectado' : 'Não Detectado'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Tipo:</span>
                    <Badge variant="outline">{results.consentMechanism.type}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Vendor:</span>
                    <span className="text-sm">{results.consentMechanism.vendor}</span>
                  </div>
                  {results.consentMechanism.issues.length > 0 && (
                    <div>
                      <h5 className="font-medium text-red-600 mb-1">Problemas Detectados:</h5>
                      <ul className="text-sm space-y-1">
                        {results.consentMechanism.issues.map((issue, index) => (
                          <li key={index} className="flex items-center gap-2">
                            <XCircle className="h-3 w-3 text-red-500" />
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Análise de Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{results.performance.loadTime}ms</div>
                  <div className="text-sm text-muted-foreground">Tempo Total de Análise</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">{results.performance.scriptCount}</div>
                  <div className="text-sm text-muted-foreground">Scripts de Tracking</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-medium">{results.performance.trackingImpact}</div>
                  <div className="text-sm text-muted-foreground">Impacto no Performance</div>
                </div>
              </div>

              <div className="mt-6">
                <h4 className="font-medium mb-3">Cookies Detectados:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium text-green-600 mb-2">Essenciais ({results.cookies.essential.length}):</h5>
                    {results.cookies.essential.map((cookie, index) => (
                      <div key={index} className="text-sm bg-green-50 p-2 rounded mb-1">
                        <strong>{cookie.name}</strong> - {cookie.domain}
                      </div>
                    ))}
                  </div>
                  
                  <div>
                    <h5 className="font-medium text-blue-600 mb-2">Analytics ({results.cookies.analytics.length}):</h5>
                    {results.cookies.analytics.map((cookie, index) => (
                      <div key={index} className="text-sm bg-blue-50 p-2 rounded mb-1">
                        <strong>{cookie.name}</strong> - {cookie.domain}
                      </div>
                    ))}
                  </div>
                  
                  <div>
                    <h5 className="font-medium text-purple-600 mb-2">Marketing ({results.cookies.marketing.length}):</h5>
                    {results.cookies.marketing.map((cookie, index) => (
                      <div key={index} className="text-sm bg-purple-50 p-2 rounded mb-1">
                        <strong>{cookie.name}</strong> - {cookie.domain}
                      </div>
                    ))}
                  </div>
                  
                  <div>
                    <h5 className="font-medium text-gray-600 mb-2">Não Categorizados ({results.cookies.uncategorized.length}):</h5>
                    {results.cookies.uncategorized.map((cookie, index) => (
                      <div key={index} className="text-sm bg-gray-50 p-2 rounded mb-1">
                        <strong>{cookie.name}</strong> - {cookie.domain}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OmnibugRealTimeDisplay;
