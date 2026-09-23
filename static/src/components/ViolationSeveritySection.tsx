import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, Eye, CheckCircle } from 'lucide-react';
import { ViolationRisk, LegalSummary } from '@/types/audit';

interface AuditRiskSectionProps {
  violationRisks: ViolationRisk[];
  legalSummary: LegalSummary;
}

const ViolationSeveritySection = ({ violationRisks, legalSummary }: AuditRiskSectionProps) => {
  const icon = (severity: string) => {
    if (severity === 'critical' || severity === 'high') return <AlertTriangle className="h-4 w-4" />;
    if (severity === 'medium') return <Eye className="h-4 w-4" />;
    if (severity === 'ok') return <CheckCircle className="h-4 w-4" />;
    return <Shield className="h-4 w-4" />;
  };

  const label = (severity: string) =>
    severity === 'critical' ? 'Crítico' :
    severity === 'high' ? 'Alto' :
    severity === 'medium' ? 'Médio' :
    severity === 'ok' ? 'Sem indicador' : 'Não determinado';

  return (
    <div className="mb-8 space-y-6">
      <Card className="shadow-lg border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Resumo técnico de privacidade
          </CardTitle>
          <CardDescription>
            Priorização baseada nas evidências observadas. Não é parecer jurídico,
            certificação de conformidade, prova de dano ou cálculo de sanção.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border">
            <div className="text-sm text-muted-foreground">Prioridade técnica</div>
            <Badge variant="outline" className="mt-2">
              {label(legalSummary.totalRiskLevel)}
            </Badge>
          </div>
          <div className="p-4 rounded-lg border">
            <div className="text-sm text-muted-foreground">Porte da organização</div>
            <div className="font-medium mt-2">Não determinável externamente</div>
          </div>
          <div className="p-4 rounded-lg border">
            <div className="text-sm text-muted-foreground">Sanção monetária</div>
            <div className="font-medium mt-2">{legalSummary.estimatedTotalFine}</div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Indicadores técnicos que exigem revisão
          </CardTitle>
          <CardDescription>
            Cada linha abaixo é um sinal técnico. A aplicabilidade da LGPD, base
            legal e eventual infração dependem de contexto não observável pelo scanner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3">Evento/Tag</th>
                  <th className="text-left p-3">Classificação técnica</th>
                  <th className="text-left p-3">Prioridade</th>
                  <th className="text-left p-3">Evidência/Contexto</th>
                  <th className="text-left p-3">Sanção</th>
                </tr>
              </thead>
              <tbody>
                {violationRisks.map((risk, index) => (
                  <tr key={index} className="border-b">
                    <td className="p-3 font-medium">{risk.eventName}</td>
                    <td className="p-3">{risk.dataType}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="inline-flex gap-1 items-center">
                        {icon(risk.severity)}
                        {label(risk.severity)}
                      </Badge>
                    </td>
                    <td className="p-3 text-sm">
                      <div>{risk.legalRisk}</div>
                      <div className="text-muted-foreground mt-1">{risk.description}</div>
                    </td>
                    <td className="p-3 text-sm">{risk.potentialFine}</td>
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
