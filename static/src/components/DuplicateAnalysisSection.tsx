
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Copy, AlertTriangle, CheckCircle, Eye, Code, FileText } from 'lucide-react';
import { useState } from 'react';

interface DuplicateAnalysisSectionProps {
  duplicates: Array<{
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
  }>;
}

const DuplicateAnalysisSection = ({ duplicates }: DuplicateAnalysisSectionProps) => {
  const [expandedDuplicates, setExpandedDuplicates] = useState<Set<number>>(new Set());

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedDuplicates);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedDuplicates(newExpanded);
  };

  const getSeverityColor = (severity: string) => {
    return severity === 'error' 
      ? 'bg-red-100 text-red-800 border-red-300'
      : 'bg-orange-100 text-orange-800 border-orange-300';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'script': return <Code className="h-4 w-4" />;
      case 'event': return <Eye className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  if (duplicates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Análise de Duplicatas
          </CardTitle>
          <CardDescription>
            Verificação de scripts, eventos ou tags duplicadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-semibold text-green-700 mb-2">
              Nenhuma duplicata encontrada!
            </h3>
            <p className="text-gray-600">
              Todos os scripts e eventos estão implementados corretamente sem duplicações.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const errorDuplicates = duplicates.filter(d => d.severity === 'error');
  const warningDuplicates = duplicates.filter(d => d.severity === 'warning');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Copy className="h-5 w-5" />
          Análise de Duplicatas ({duplicates.length})
        </CardTitle>
        <CardDescription>
          Scripts, eventos ou tags implementadas multiple vezes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{errorDuplicates.length}</div>
            <div className="text-sm text-red-800">Erros Críticos</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">{warningDuplicates.length}</div>
            <div className="text-sm text-orange-800">Avisos</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {duplicates.reduce((sum, d) => sum + d.count, 0)}
            </div>
            <div className="text-sm text-blue-800">Total de Ocorrências</div>
          </div>
        </div>

        {/* Lista de Duplicatas */}
        <div className="space-y-4">
          {duplicates.map((duplicate, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getTypeIcon(duplicate.type)}
                  <div>
                    <h4 className="font-semibold">{duplicate.name}</h4>
                    <p className="text-sm text-gray-600">
                      {duplicate.count} ocorrências • {duplicate.type}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge className={getSeverityColor(duplicate.severity)}>
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {duplicate.severity === 'error' ? 'Crítico' : 'Aviso'}
                  </Badge>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleExpanded(index)}
                  >
                    {expandedDuplicates.has(index) ? 'Ocultar' : 'Ver Detalhes'}
                  </Button>
                </div>
              </div>

              {/* Recomendação */}
              <Alert className="mb-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Recomendação:</strong> {duplicate.recommendation}
                </AlertDescription>
              </Alert>

              {/* Detalhes expandidos */}
              {expandedDuplicates.has(index) && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h5 className="font-medium mb-3">Localizações das Duplicatas:</h5>
                  <div className="space-y-3">
                    {duplicate.locations.map((location, locIndex) => (
                      <div key={locIndex} className="bg-white border rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{location.file}</span>
                          <Badge variant="outline" className="text-xs">
                            Linha {location.lineNumber}
                          </Badge>
                        </div>
                        <div className="bg-gray-100 p-2 rounded font-mono text-sm overflow-x-auto">
                          <code>{location.code}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Resumo de Impacto */}
        <Alert className="mt-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Impacto das Duplicatas:</strong>
            <ul className="mt-2 space-y-1 text-sm">
              <li>• <strong>Performance:</strong> Carregamento desnecessário de recursos</li>
              <li>• <strong>Dados:</strong> Coleta duplicada pode distorcer métricas</li>
              <li>• <strong>LGPD:</strong> Múltiplas coletas sem consentimento adequado</li>
              <li>• <strong>Custo:</strong> Possível cobrança dupla por ferramentas pagas</li>
            </ul>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default DuplicateAnalysisSection;
