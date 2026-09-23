import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SiteNavigationService, NavigationPage, NavigationSummary } from '@/services/siteNavigationService';
import { Globe, Search, ShoppingCart, CheckCircle, AlertTriangle, Timer, BarChart3 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface SiteNavigationAnalysisProps {
  url: string;
  onComplete?: (results: any) => void;
}

const SiteNavigationAnalysis = ({ url, onComplete }: SiteNavigationAnalysisProps) => {
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState('');
  const [pages, setPages] = useState<NavigationPage[]>([]);
  const [summary, setSummary] = useState<NavigationSummary | null>(null);
  const [ga4PropertyId, setGa4PropertyId] = useState('');

  const startNavigation = async () => {
    if (!url) {
      toast({
        title: "URL necessária",
        description: "Por favor, insira uma URL válida para iniciar a navegação",
        variant: "destructive"
      });
      return;
    }

    setIsNavigating(true);
    setProgress(0);
    setPages([]);
    setSummary(null);

    try {
      const navigationService = SiteNavigationService.getInstance();

      // Monitorar progresso
      const progressInterval = setInterval(() => {
        const progressData = navigationService.getCurrentProgress();
        setProgress((progressData.current / progressData.total) * 100);
        setCurrentPage(progressData.currentPage || '');
      }, 500);

      const results = await navigationService.startFullNavigation(url);

      clearInterval(progressInterval);
      setProgress(100);
      setPages(results.pages);
      setSummary(results.summary);
      setGa4PropertyId(results.ga4PropertyId);

      toast({
        title: "Navegação Completa!",
        description: `${results.pages.length} páginas analisadas, ${results.totalEvents} eventos capturados`
      });

      if (onComplete) {
        onComplete(results);
      }

    } catch (error) {
      console.error('Erro na navegação:', error);
      toast({
        title: "Erro na Navegação",
        description: "Ocorreu um erro durante a navegação automática",
        variant: "destructive"
      });
    } finally {
      setIsNavigating(false);
    }
  };

  const getPageIcon = (type: string) => {
    switch (type) {
      case 'home': return <Globe className="h-4 w-4" />;
      case 'category':
      case 'product': return <Search className="h-4 w-4" />;
      case 'cart':
      case 'checkout': return <ShoppingCart className="h-4 w-4" />;
      default: return <Globe className="h-4 w-4" />;
    }
  };

  const getSeverityBadge = (beforeConsent: boolean) => {
    return beforeConsent ? (
      <Badge variant="destructive" className="text-xs">
        Sem Consentimento
      </Badge>
    ) : (
      <Badge variant="secondary" className="text-xs">
        Com Consentimento
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Controle de Navegação */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Navegação Completa do Site
          </CardTitle>
          <CardDescription>
            Navegar automaticamente por todo o site e capturar todos os eventos e scripts em tempo real
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Button
              onClick={startNavigation}
              disabled={isNavigating}
              className="w-full bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              {isNavigating ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Navegando...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Iniciar Navegação Completa
                </div>
              )}
            </Button>

            {isNavigating && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Progresso: {Math.round(progress)}%</span>
                  <span>{currentPage}</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resumo da Navegação */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Resumo da Navegação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{summary.totalPages}</div>
                <div className="text-sm text-blue-800">Páginas Visitadas</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{summary.totalEvents}</div>
                <div className="text-sm text-green-800">Eventos Capturados</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{summary.violationsFound}</div>
                <div className="text-sm text-orange-800">Violações LGPD</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{summary.complianceScore}%</div>
                <div className="text-sm text-purple-800">Score Compliance</div>
              </div>
            </div>

            {ga4PropertyId && (
              <Alert className="mt-4">
                <BarChart3 className="h-4 w-4" />
                <AlertDescription>
                  <strong>GA4 Property ID detectado:</strong> <code className="bg-gray-100 px-2 py-1 rounded">{ga4PropertyId}</code>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Análise Detalhada por Página */}
      {pages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Análise Detalhada por Página</CardTitle>
            <CardDescription>
              Eventos e scripts capturados em cada página visitada
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                <TabsTrigger value="events">Eventos Detalhados</TabsTrigger>
                <TabsTrigger value="scripts">Scripts Detectados</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {pages.map((page, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getPageIcon(page.type)}
                            <span className="font-medium">{page.name}</span>
                            {page.visited && <CheckCircle className="h-4 w-4 text-green-500" />}
                          </div>
                          <Badge variant="outline">{page.type}</Badge>
                        </div>
                        <div className="text-sm text-gray-600 mb-2">{page.url}</div>
                        <div className="flex gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            {page.events.length} eventos
                          </span>
                          <span className="flex items-center gap-1">
                            <BarChart3 className="h-3 w-3" />
                            {page.scripts.length} scripts
                          </span>
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 text-orange-500" />
                            {page.events.filter(e => e.beforeConsent).length + page.scripts.filter(s => s.beforeConsent).length} violações
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="events" className="space-y-4">
                <ScrollArea className="h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Página</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Parâmetros</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Timestamp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pages.flatMap(page =>
                        page.events.map((event, eventIndex) => (
                          <TableRow key={`${page.name}-${eventIndex}`}>
                            <TableCell className="font-medium">{page.name}</TableCell>
                            <TableCell>
                              <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                                {event.name}
                              </code>
                            </TableCell>
                            <TableCell>
                              <div className="text-xs max-w-xs">
                                {Object.keys(event.params).slice(0, 3).join(', ')}
                                {Object.keys(event.params).length > 3 && '...'}
                              </div>
                            </TableCell>
                            <TableCell>{getSeverityBadge(event.beforeConsent)}</TableCell>
                            <TableCell className="text-xs">
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="scripts" className="space-y-4">
                <ScrollArea className="h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Página</TableHead>
                        <TableHead>Script</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Dados Coletados</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pages.flatMap(page =>
                        page.scripts.map((script, scriptIndex) => (
                          <TableRow key={`${page.name}-${scriptIndex}`}>
                            <TableCell className="font-medium">{page.name}</TableCell>
                            <TableCell>{script.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {script.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-xs max-w-xs">
                                {script.dataCollected.slice(0, 2).join(', ')}
                                {script.dataCollected.length > 2 && '...'}
                              </div>
                            </TableCell>
                            <TableCell>{getSeverityBadge(script.beforeConsent)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SiteNavigationAnalysis;
