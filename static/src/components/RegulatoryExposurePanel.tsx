import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, FileSearch, Scale, Shield } from 'lucide-react';

interface RegulatoryExposurePanelProps {
  regulatoryExposure?: any;
  personalDataFindings?: any[];
  sensitiveDataFindings?: any[];
  tags?: any[];
  estimatedRiskExposure?: string;
  score?: number;
}

const RegulatoryExposurePanel = ({
  regulatoryExposure,
  personalDataFindings = [],
  sensitiveDataFindings = [],
  tags = [],
  estimatedRiskExposure,
}: RegulatoryExposurePanelProps) => {
  const technicalSignals = regulatoryExposure?.technical_signals || [];
  const contexts = regulatoryExposure?.regulatory_context || [];

  return (
    <div className="space-y-6">
      <Alert className="border-blue-500/30 bg-blue-500/5">
        <Scale className="h-4 w-4 text-blue-400" />
        <AlertDescription>
          O DataTrust identifica sinais técnicos e oferece contexto regulatório geral. A aplicação
          da LGPD/GDPR/CCPA, a base legal e qualquer sanção dependem de fatos que um scanner externo
          não consegue observar.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSearch className="h-4 w-4" />
              Dados pessoais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{personalDataFindings.length}</div>
            <p className="text-xs text-muted-foreground">sinais técnicos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Dados sensíveis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{sensitiveDataFindings.length}</div>
            <p className="text-xs text-muted-foreground">sinais classificados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tags observadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{tags.length}</div>
            <p className="text-xs text-muted-foreground">fornecedores/scripts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Nível técnico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">
              {regulatoryExposure?.exposure_label || regulatoryExposure?.exposure_level || 'Não determinado'}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">
              Priorização técnica, não classificação de infração.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidências e sinais técnicos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {technicalSignals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum sinal regulatório estruturado foi retornado pelo backend.
            </p>
          ) : (
            technicalSignals.map((signal: any, index: number) => (
              <div key={index} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{signal.signal || 'Sinal técnico'}</strong>
                  <Badge variant="outline">{signal.severity || 'informativo'}</Badge>
                </div>
                {signal.technical_basis && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Base técnica: {signal.technical_basis}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {contexts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contexto regulatório geral</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {contexts.map((item: any, index: number) => (
              <div key={index} className="rounded-lg border p-3">
                <div className="font-medium text-sm">{item.title || 'Contexto'}</div>
                <p className="text-sm text-muted-foreground mt-1">{item.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Alert className="border-amber-500/30 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <AlertDescription>
          <strong>Sanções monetárias:</strong>{' '}
          {estimatedRiskExposure ||
            'não podem ser estimadas com confiabilidade por uma auditoria técnica externa.'}
          {' '}Não são exibidos cálculos de multa baseados em quantidade de findings.
        </AlertDescription>
      </Alert>

      <p className="text-xs text-muted-foreground">
        {regulatoryExposure?.disclaimer ||
          'Requer verificação manual e, quando necessário, avaliação por profissional de privacidade/jurídico.'}
      </p>
    </div>
  );
};

export default RegulatoryExposurePanel;
