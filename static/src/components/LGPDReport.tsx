import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Info, Scale, ShieldCheck } from 'lucide-react';

interface TechnicalFinding {
  tag?: string;
  violation?: string;
  article?: string;
  description?: string;
  severity?: string;
  confidence?: string;
  dataCollected?: string[];
  tagId?: string | null;
}

interface PrivacyAnalysis {
  jurisdiction?: string;
  framework?: string;
  confidenceLevel?: string;
  violations?: TechnicalFinding[];
  totalViolations?: number;
  estimatedRiskExposure?: string;
  hasConsentTool?: boolean;
  hasUniversalAnalytics?: boolean;
  complianceScore?: number;
  scoreBasis?: string;
  scoreDeductions?: Array<{
    reason?: string;
    points?: number;
    confidence?: string;
    evidence_type?: string;
  }>;
}

interface LGPDReportProps {
  lgpdAnalysis: PrivacyAnalysis;
  url: string;
}

const severityVariant = (severity?: string) => {
  if (severity === 'critical' || severity === 'high') return 'destructive' as const;
  return 'secondary' as const;
};

/**
 * Technical privacy-risk report.
 *
 * The backend keeps the legacy key "violations" for compatibility, but entries
 * are technical risk indicators. This UI deliberately avoids presenting them
 * as adjudicated LGPD violations or monetary fine estimates.
 */
const LGPDReport = ({ lgpdAnalysis, url }: LGPDReportProps) => {
  const findings = Array.isArray(lgpdAnalysis?.violations) ? lgpdAnalysis.violations : [];
  const technicalScore = Number.isFinite(lgpdAnalysis?.complianceScore)
    ? Number(lgpdAnalysis.complianceScore)
    : null;

  return (
    <div className="space-y-6">
      <Alert className="border-blue-500/30 bg-blue-500/5">
        <Info className="h-4 w-4 text-blue-400" />
        <AlertDescription>
          Este relatório é uma auditoria técnica baseada em sinais publicamente observáveis.
          Não é parecer jurídico, certificação de conformidade ou decisão sobre infração à LGPD.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Score técnico de privacidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {technicalScore === null ? 'N/D' : `${technicalScore}%`}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Heurística de priorização técnica; não é percentual de conformidade legal.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Indicadores técnicos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{findings.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Sinais que merecem revisão técnica ou jurídica adicional.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Scale className="h-4 w-4" />
              Contexto provável
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-semibold">{lgpdAnalysis?.framework || 'Não determinado'}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Jurisdição aplicável não pode ser confirmada apenas pela URL/site.
            </p>
          </CardContent>
        </Card>
      </div>

      {lgpdAnalysis?.scoreBasis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Como o score foi calculado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">{lgpdAnalysis.scoreBasis}</p>
            {(lgpdAnalysis.scoreDeductions || []).length > 0 && (
              <div className="space-y-2">
                {(lgpdAnalysis.scoreDeductions || []).map((item, index) => (
                  <div key={index} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{item.reason || 'Dedução técnica'}</span>
                      {typeof item.points === 'number' && (
                        <Badge variant="outline">{item.points} pts</Badge>
                      )}
                      {item.confidence && (
                        <Badge variant="outline">confiança: {item.confidence}</Badge>
                      )}
                      {item.evidence_type && (
                        <Badge variant="outline">fonte: {item.evidence_type}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Indicadores técnicos observados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {findings.length === 0 ? (
            <div className="rounded-lg border p-4">
              <p className="font-medium">Nenhum indicador técnico relevante foi observado neste scan.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Isso não prova conformidade. Eventos server-side, páginas não visitadas, fluxos autenticados,
                bases legais, contratos e processos internos não são observáveis externamente.
              </p>
            </div>
          ) : (
            findings.map((finding, index) => (
              <div key={`${finding.tag || 'finding'}-${index}`} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <strong>{finding.tag || 'Site'}</strong>
                  <Badge variant={severityVariant(finding.severity)}>
                    {finding.severity || 'informativo'}
                  </Badge>
                  {finding.confidence && (
                    <Badge variant="outline">confiança: {finding.confidence}</Badge>
                  )}
                </div>
                <p className="text-sm">{finding.violation || 'Indicador técnico detectado.'}</p>
                {finding.description && (
                  <p className="text-sm text-muted-foreground mt-2">{finding.description}</p>
                )}
                {finding.article && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Contexto regulatório: {finding.article}
                  </p>
                )}
                {finding.dataCollected && finding.dataCollected.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Categorias associadas ao fornecedor: {finding.dataCollected.join(', ')}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Alert className="border-amber-500/30 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <AlertDescription>
          <strong>Exposição monetária:</strong>{' '}
          {lgpdAnalysis?.estimatedRiskExposure ||
            'Não é possível estimar sanções monetárias a partir de um scan técnico externo.'}
        </AlertDescription>
      </Alert>

      <p className="text-xs text-muted-foreground">
        URL analisada: {url}. {lgpdAnalysis?.confidenceLevel || ''}
      </p>
    </div>
  );
};

export default LGPDReport;
