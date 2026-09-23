import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Clock, ArrowDown, Shield, Zap, AlertCircle } from 'lucide-react';

interface Tag {
  name: string;
  type: string;
  lineNumber: number;
  position: number;
  isBeforeConsent: boolean;
  lgpdRisk: string;
  dataCollected: string[];
}

interface LoadingOrderItem {
  position: number;
  tag: string;
  type: string;
  lineNumber: number;
  issues: string[];
  recommendations: string[];
  severity: string;
}

interface ScriptTimelineProps {
  tags: Tag[];
  loadingOrder: LoadingOrderItem[];
  hasConsentTool: boolean;
}

const ScriptTimeline = ({ tags, loadingOrder, hasConsentTool }: ScriptTimelineProps) => {
  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      consent: 'bg-green-500',
      tag_manager: 'bg-blue-500',
      analytics: 'bg-purple-500',
      advertising: 'bg-orange-500',
      heatmap: 'bg-red-500',
      support: 'bg-cyan-500',
      custom: 'bg-gray-500'
    };
    return colors[type] || 'bg-gray-500';
  };

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      consent: 'bg-green-100 text-green-800 border-green-300',
      tag_manager: 'bg-blue-100 text-blue-800 border-blue-300',
      analytics: 'bg-purple-100 text-purple-800 border-purple-300',
      advertising: 'bg-orange-100 text-orange-800 border-orange-300',
      heatmap: 'bg-red-100 text-red-800 border-red-300',
      support: 'bg-cyan-100 text-cyan-800 border-cyan-300',
      custom: 'bg-gray-100 text-gray-800 border-gray-300'
    };
    return colors[type] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getSeverityIcon = (severity: string, isBeforeConsent: boolean) => {
    if (isBeforeConsent) {
      return <AlertTriangle className="w-5 h-5 text-red-500" />;
    }
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'ok':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
  };

  const getRiskLabel = (risk: string) => {
    const labels: Record<string, { text: string; class: string }> = {
      critical: { text: 'Crítico', class: 'bg-red-100 text-red-800 border-red-300' },
      high: { text: 'Alto', class: 'bg-orange-100 text-orange-800 border-orange-300' },
      medium: { text: 'Médio', class: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
      low: { text: 'Baixo', class: 'bg-blue-100 text-blue-800 border-blue-300' },
      none: { text: 'Nenhum', class: 'bg-green-100 text-green-800 border-green-300' }
    };
    return labels[risk] || labels.medium;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      consent: '🔐 Consentimento',
      tag_manager: '📦 Tag Manager',
      analytics: '📊 Analytics',
      advertising: '📢 Publicidade',
      heatmap: '🔥 Heatmap',
      support: '💬 Suporte',
      custom: '🔧 Customizado'
    };
    return labels[type] || type;
  };

  // Ordenar por posição
  const sortedTags = [...tags].sort((a, b) => a.position - b.position);

  // Encontrar índice do consent
  const consentIndex = sortedTags.findIndex(t => t.type === 'consent');

  return (
    <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          ⏱️ Ordem de Carregamento de Scripts
        </CardTitle>
        <CardDescription>
          Visualização da ordem em que os scripts são carregados no site
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasConsentTool && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Shield className="w-6 h-6 text-red-500 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-800">⚠️ CMP Não Detectado</h4>
                <p className="text-sm text-red-700 mt-1">
                  Nenhuma CMP conhecida foi observada neste scan. Isso é um sinal técnico que exige
                  revisão manual; por si só, não prova violação da LGPD nem revela a base legal usada pelo site.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Legenda */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-800 mb-3">Legenda de Tipos:</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries({
              consent: '🔐 Consentimento',
              tag_manager: '📦 Tag Manager',
              analytics: '📊 Analytics',
              advertising: '📢 Publicidade',
              heatmap: '🔥 Heatmap',
              support: '💬 Suporte'
            }).map(([type, label]) => (
              <Badge key={type} className={getTypeBadgeColor(type)}>
                {label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Linha vertical */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

          <div className="space-y-4">
            {sortedTags.map((tag, index) => {
              const isViolation = tag.isBeforeConsent && tag.type !== 'consent';
              const riskInfo = getRiskLabel(tag.lgpdRisk);
              
              return (
                <div key={index} className="relative flex items-start gap-4">
                  {/* Marcador na timeline */}
                  <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center ${getTypeColor(tag.type)} text-white font-bold shadow-lg`}>
                    {index + 1}
                  </div>

                  {/* Conteúdo do item */}
                  <div className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                    isViolation 
                      ? 'bg-red-50 border-red-300 shadow-red-100' 
                      : tag.type === 'consent'
                        ? 'bg-green-50 border-green-300'
                        : 'bg-white border-gray-200'
                  } shadow-sm hover:shadow-md`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getSeverityIcon(tag.lgpdRisk, isViolation)}
                        <h4 className="font-semibold text-gray-900">{tag.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getTypeBadgeColor(tag.type)}>
                          {getTypeLabel(tag.type)}
                        </Badge>
                        {isViolation && (
                          <Badge className="bg-red-100 text-red-800 border-red-300">
                            ❌ Violação LGPD
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Linha no código:</span>
                        <span className="font-mono ml-2">
                          {tag.lineNumber || (
                            <span className="text-xs text-gray-400 italic">não disponível neste scan</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">Risco LGPD:</span>
                        <Badge className={riskInfo.class}>{riskInfo.text}</Badge>
                      </div>
                    </div>

                    {tag.dataCollected && tag.dataCollected.length > 0 && (
                      <div className="mt-3">
                        <span className="text-sm text-gray-500">Dados coletados:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {tag.dataCollected.filter(Boolean).map((data, i) => (
                            <Badge
                              key={i}
                              className="text-xs bg-slate-100 text-gray-800 border border-slate-300 dark:bg-slate-700 dark:text-gray-100 dark:border-slate-600"
                            >
                              {data}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {isViolation && (
                      <div className="mt-3 p-2 bg-red-100 rounded text-sm text-red-800">
                        <strong>⚠️ Sinal técnico:</strong> o scanner observou este script antes de um sinal de consentimento.
                        A conclusão jurídica depende da finalidade, base legal e contexto do tratamento.
                      </div>
                    )}

                    {tag.type === 'consent' && (
                      <div className="mt-3 p-2 bg-green-100 rounded text-sm text-green-800">
                        <strong>✅ CMP Detectado:</strong> Ferramenta de consentimento encontrada. 
                        Tags abaixo deste ponto devem aguardar aprovação do usuário.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resumo de Ordem */}
        {loadingOrder && loadingOrder.length > 0 && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Recomendações de Ordem
            </h4>
            <div className="space-y-2">
              {loadingOrder
                .filter(item => item.issues && item.issues.length > 0)
                .map((item, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    <ArrowDown className="w-4 h-4 text-blue-500 mt-0.5" />
                    <div>
                      <strong>{item.tag}:</strong>{' '}
                      {item.recommendations.join('; ') || item.issues.join('; ')}
                    </div>
                  </div>
                ))}
              {loadingOrder.filter(item => item.issues && item.issues.length > 0).length === 0 && (
                <p className="text-sm text-green-700 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Ordem de carregamento está correta!
                </p>
              )}
            </div>
          </div>
        )}

        {/* Ordem Ideal */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-800 mb-3">📋 Ordem Ideal de Carregamento:</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
            <li>🔐 <strong>CMP (Consentimento)</strong> - Sempre primeiro</li>
            <li>📦 <strong>Google Tag Manager</strong> - Gerencia outras tags</li>
            <li>📊 <strong>Analytics</strong> - Após consentimento</li>
            <li>📢 <strong>Publicidade</strong> - Apenas com consentimento de marketing</li>
            <li>🔥 <strong>Heatmaps</strong> - Requer consentimento específico</li>
            <li>💬 <strong>Chat/Suporte</strong> - Funcional, pode carregar antes</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};

export default ScriptTimeline;
