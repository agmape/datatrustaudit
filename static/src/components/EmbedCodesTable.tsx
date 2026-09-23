
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Code, TrendingUp, Globe, Activity, CheckCircle, AlertTriangle } from 'lucide-react';
import { EmbedCode } from '@/types/audit';

interface EmbedCodesTableProps {
  embedCodes: EmbedCode[];
  gtmPosition: number;
  useViewSource: boolean;
}

const EmbedCodesTable = ({ embedCodes, gtmPosition, useViewSource }: EmbedCodesTableProps) => {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'analytics':
        return <TrendingUp className="h-4 w-4" />;
      case 'advertising':
        return <Globe className="h-4 w-4" />;
      case 'tag_manager':
        return <Code className="h-4 w-4" />;
      case 'compliance':
        return <CheckCircle className="h-4 w-4" />;
      case 'support':
        return <Activity className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'analytics':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'advertising':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'tag_manager':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'compliance':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'support':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getLgpdComplianceColor = (compliance: string) => {
    switch (compliance) {
      case 'compliant':
        return 'text-green-700';
      case 'warning':
        return 'text-yellow-700';
      case 'violation':
        return 'text-red-700';
      default:
        return 'text-gray-700';
    }
  };

  const getLgpdComplianceIcon = (compliance: string) => {
    switch (compliance) {
      case 'compliant':
        return <CheckCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'violation':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <Card className="mb-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Códigos Embed e Compliance LGPD
        </CardTitle>
        <CardDescription>
          Análise da ordem, validação GTM e compliance com LGPD (Posição GTM: #{gtmPosition})
          {useViewSource && (
            <span className="ml-2 text-orange-600 font-medium">
              • Análise view-source ativa
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-4 font-semibold">Código</th>
                <th className="text-left p-4 font-semibold">Tipo</th>
                <th className="text-left p-4 font-semibold">Posição</th>
                <th className="text-left p-4 font-semibold">Compliance LGPD</th>
              </tr>
            </thead>
            <tbody>
              {embedCodes.map((code, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {getTypeIcon(code.type)}
                      <span className="font-medium">{code.name}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge className={`${getTypeBadgeColor(code.type)} border`}>
                      {code.type === 'consent' ? 'consentimento' : code.type}
                    </Badge>
                  </td>
                  <td className="p-4 font-mono text-sm">#{code.position}</td>
                  <td className="p-4">
                    <div className={`flex items-center gap-2 ${getLgpdComplianceColor(code.lgpdCompliance || 'compliant')}`}>
                      {getLgpdComplianceIcon(code.lgpdCompliance || 'compliant')}
                      <div>
                        <span className="font-medium block">
                          {code.lgpdCompliance === 'compliant' ? '✅ Conforme' : 
                           code.lgpdCompliance === 'warning' ? '⚠️ Atenção' : '❌ Violação LGPD'}
                        </span>
                        <span className="text-xs text-gray-600 block">
                          {code.complianceMessage}
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default EmbedCodesTable;
