
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { UniversalAnalyticsCode } from '@/types/audit';

interface UniversalAnalyticsAlertProps {
  universalAnalytics: UniversalAnalyticsCode[];
}

const UniversalAnalyticsAlert = ({ universalAnalytics }: UniversalAnalyticsAlertProps) => {
  const validUA = Array.isArray(universalAnalytics) ? universalAnalytics : [];
  
  if (validUA.length === 0) return null;

  return (
    <Card className="mb-8 shadow-lg border-0 bg-red-50 border-red-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-800">
          <AlertTriangle className="h-5 w-5" />
          ⚠️ Universal Analytics Detectado (Obsoleto)
        </CardTitle>
        <CardDescription className="text-red-700">
          Universal Analytics foi descontinuado em julho de 2023. Migre para GA4 imediatamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {validUA.map((ua, index) => (
            <div key={index} className="p-3 bg-white rounded border border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-red-800">{ua.name || 'Universal Analytics'}</span>
                  <Badge className="ml-2 bg-red-100 text-red-800 border-red-300">
                    Posição #{ua.position || index + 1}
                  </Badge>
                </div>
                <Badge className="bg-red-600 text-white">
                  OBSOLETO
                </Badge>
              </div>
              <div className="text-sm text-gray-600 mt-1 font-mono">
                {ua.code || 'Código não disponível'}
              </div>
              <div className="text-xs text-red-600 mt-1">
                Parâmetros: {Array.isArray(ua.parameters) ? ua.parameters.join(', ') : 'N/A'}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default UniversalAnalyticsAlert;
