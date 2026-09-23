
import { Card, CardContent } from '@/components/ui/card';
import { Code, CheckCircle, AlertTriangle, Activity, Shield } from 'lucide-react';
import { AuditResult } from '@/types/audit';

interface SummaryCardsProps {
  summary: AuditResult['summary'];
}

const SummaryCards = ({ summary }: SummaryCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
      <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100">Total de Códigos</p>
              <p className="text-3xl font-bold">{summary.totalCodes}</p>
            </div>
            <Code className="h-8 w-8 text-blue-200" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100">Antes do GTM</p>
              <p className="text-3xl font-bold">{summary.codesBeforeGTM}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-200" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100">Violações Críticas</p>
              <p className="text-3xl font-bold">{summary.criticalViolations}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-200" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100">Violações Altas</p>
              <p className="text-3xl font-bold">{summary.highViolations}</p>
            </div>
            <Shield className="h-8 w-8 text-orange-200" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100">Total de Eventos</p>
              <p className="text-3xl font-bold">{summary.totalEvents}</p>
            </div>
            <Activity className="h-8 w-8 text-purple-200" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SummaryCards;
