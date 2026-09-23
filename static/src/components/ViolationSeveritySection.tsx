
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, Eye, CheckCircle } from 'lucide-react';
import { ViolationRisk, LegalSummary } from '@/types/audit';

interface ViolationSeveritySectionProps {
  violationRisks: ViolationRisk[];
  legalSummary: LegalSummary;
}

const ViolationSeveritySection = ({ violationRisks, legalSummary }: ViolationSeveritySectionProps) => {
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'high':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'medium':
        return <Eye className="h-4 w-4 text-yellow-600" />;
      case 'ok':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      default:
        return <Shield className="h-4 w-4 text-gray-600" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'ok':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '❌ Crítico';
      case 'high':
        return '⚠️ Alto';
      case 'medium':
        return '🕵️ Médio';
      case 'ok':
        return '✅ OK';
      default:
        return '—';
    }
  };

  return (
    <div className="mb-8 space-y-6">
      {/* Legal Summary */}
      <Card className="shadow-lg border-0 bg-gradient-to-r from-red-50 to-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            ⚖️ Resumo Legal da Auditoria
          </CardTitle>
          <CardDescription>
            Avaliação geral do risco jurídico e potencial de indenização
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded-lg border">
              <h4 className="font-semibold text-gray-800 mb-2">🔍 Gravidade da Coleta</h4>
              <Badge className={getSeverityColor(legalSummary.dataCollectionSeverity)}>
                {getSeverityLabel(legalSummary.dataCollectionSeverity)}
              </Badge>
              <p className="text-sm text-gray-600 mt-1">
                {legalSummary.dataCollectionSeverity === 'critical' ? 'Dados sensíveis coletados sem consentimento' :
                 legalSummary.dataCollectionSeverity === 'high' ? 'Dados pessoais coletados antes do consentimento' :
                 legalSummary.dataCollectionSeverity === 'medium' ? 'Tracking desorganizado ou sem transparência' :
                 'Coleta de dados em conformidade'}
              </p>
            </div>
            
            <div className="p-4 bg-white rounded-lg border">
              <h4 className="font-semibold text-gray-800 mb-2">📄 Prova de Dano</h4>
              <Badge className={
                legalSummary.proofOfDamage === 'material' ? 'bg-red-100 text-red-800 border-red-300' :
                legalSummary.proofOfDamage === 'proven' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                legalSummary.proofOfDamage === 'presumed' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                'bg-green-100 text-green-800 border-green-300'
              }>
                {legalSummary.proofOfDamage === 'material' ? '🔴 Dano Material' :
                 legalSummary.proofOfDamage === 'proven' ? '🟠 Dano Comprovado' :
                 legalSummary.proofOfDamage === 'presumed' ? '🟡 Dano Presumido' :
                 '🟢 Sem Dano'}
              </Badge>
              <p className="text-sm text-gray-600 mt-1">
                {legalSummary.proofOfDamage === 'material' ? 'Vazamento ou fraude comprovada' :
                 legalSummary.proofOfDamage === 'proven' ? 'Evidências de ansiedade/SPAM' :
                 legalSummary.proofOfDamage === 'presumed' ? 'Rastreamento sem consentimento' :
                 'Nenhum dano identificado'}
              </p>
            </div>
            
            <div className="p-4 bg-white rounded-lg border">
              <h4 className="font-semibold text-gray-800 mb-2">🏢 Porte da Empresa</h4>
              <Badge className={
                legalSummary.companySize === 'large' ? 'bg-red-100 text-red-800 border-red-300' :
                legalSummary.companySize === 'medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                'bg-green-100 text-green-800 border-green-300'
              }>
                {legalSummary.companySize === 'large' ? '🏢 Grande Porte' :
                 legalSummary.companySize === 'medium' ? '🏬 Médio Porte' :
                 '🏪 Pequeno Porte'}
              </Badge>
              <p className="text-sm text-gray-600 mt-1">
                {legalSummary.companySize === 'large' ? 'Penalização mais severa' :
                 legalSummary.companySize === 'medium' ? 'Penalização moderada' :
                 'Possível advertência ou multa menor'}
              </p>
            </div>
            
            <div className="p-4 bg-white rounded-lg border">
              <h4 className="font-semibold text-gray-800 mb-2">💰 Risco Total Estimado</h4>
              <Badge className={getSeverityColor(legalSummary.totalRiskLevel)}>
                {getSeverityLabel(legalSummary.totalRiskLevel)}
              </Badge>
              <p className="text-sm font-semibold text-gray-800 mt-1">
                {legalSummary.estimatedTotalFine}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Violation Risks Table */}
      <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            🧨 Gravidade da Violação e Potencial de Risco
          </CardTitle>
          <CardDescription>
            Avaliação legal do risco por evento detectado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-4 font-semibold">Evento/Tag</th>
                  <th className="text-left p-4 font-semibold">Tipo de Dado</th>
                  <th className="text-left p-4 font-semibold">Consentimento</th>
                  <th className="text-left p-4 font-semibold">Gravidade</th>
                  <th className="text-left p-4 font-semibold">Risco Legal</th>
                  <th className="text-left p-4 font-semibold">Indenização Estimada</th>
                </tr>
              </thead>
              <tbody>
                {violationRisks.map((risk, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4 font-medium">{risk.eventName}</td>
                    <td className="p-4">
                      <Badge className={
                        risk.dataType.includes('sensível') ? 'bg-red-100 text-red-800 border-red-300' :
                        risk.dataType.includes('pessoal') ? 'bg-orange-100 text-orange-800 border-orange-300' :
                        'bg-blue-100 text-blue-800 border-blue-300'
                      }>
                        {risk.dataType}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <span className={risk.hasConsent ? 'text-green-600' : 'text-red-600'}>
                        {risk.hasConsent ? '✅ Sim' : '❌ Não'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {getSeverityIcon(risk.severity)}
                        <Badge className={getSeverityColor(risk.severity)}>
                          {getSeverityLabel(risk.severity)}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm">
                        <span className="font-medium">{risk.legalRisk}</span>
                        <p className="text-gray-600 text-xs mt-1">{risk.description}</p>
                      </div>
                    </td>
                    <td className="p-4 font-semibold">
                      <span className={
                        risk.severity === 'critical' ? 'text-red-600' :
                        risk.severity === 'high' ? 'text-orange-600' :
                        risk.severity === 'medium' ? 'text-yellow-600' :
                        'text-green-600'
                      }>
                        {risk.potentialFine}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ViolationSeveritySection;
