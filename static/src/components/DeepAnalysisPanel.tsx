import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, Fingerprint, Globe, ShieldCheck } from 'lucide-react';

interface DeepAnalysisPanelProps {
  url: string;
  detectedTags: any[];
  hasConsentTool: boolean;
  pages?: any[];
  ga4PropertyId?: string;
}

/**
 * Production-safe advanced evidence panel.
 *
 * Previous versions rendered several client-side "scanner" widgets that inferred
 * cookies, Consent Mode, security findings and performance values from tag names.
 * Those widgets could present simulated/heuristic values as observations. This
 * panel now renders only evidence returned by the backend audit.
 */
const DeepAnalysisPanel = ({ url, detectedTags, hasConsentTool, pages }: DeepAnalysisPanelProps) => {
  const runtimeEvidence = (detectedTags || []).filter(
    (tag) => tag.detectionMethod === 'network_request' || tag.detection_method === 'network_request'
  );
  const preConsent = (detectedTags || []).filter(
    (tag) => Boolean(tag.isBeforeConsent ?? tag.is_before_consent)
  );

  return (
    <div className="space-y-6">
      <Alert className="border-amber-500/30 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <AlertDescription className="text-sm">
          Esta seção mostra somente evidências retornadas pelo scanner. Ela não inventa cookies,
          estados de Consent Mode, tempo de carregamento, vulnerabilidades ou conclusões jurídicas
          que não tenham sido observados tecnicamente.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Fingerprint className="h-4 w-4" />
              Evidências de runtime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{runtimeEvidence.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Tags confirmadas por requisições de rede observadas.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Mecanismo de consentimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={hasConsentTool ? 'default' : 'secondary'}>
              {hasConsentTool ? 'Sinal técnico observado' : 'Não observado'}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">
              “Não observado” não significa, por si só, não conformidade legal.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Antes do consentimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{preConsent.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Evidências ou heurísticas marcadas pelo backend, com confiança por finding.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidências técnicas detectadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(detectedTags || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma tag foi observada neste scan. Isso pode ocorrer por bloqueio a bots,
              consentimento, carregamento tardio, login ou tracking server-side.
            </p>
          ) : (
            (detectedTags || []).map((tag, index) => (
              <div key={tag.id || tag.name || index} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{tag.name || tag.vendor || 'Tag'}</strong>
                  <Badge variant="outline">{tag.type || 'unknown'}</Badge>
                  <Badge variant="outline">
                    confiança: {tag.confidence || 'não informada'}
                  </Badge>
                  <Badge variant="outline">
                    fonte: {tag.detectionMethod || tag.detection_method || 'não informada'}
                  </Badge>
                  {(tag.isBeforeConsent ?? tag.is_before_consent) && (
                    <Badge variant="destructive">antes de sinal observável de consentimento</Badge>
                  )}
                </div>
                {tag.matchedPattern && (
                  <p className="mt-2 text-xs text-muted-foreground break-all">
                    Evidência: {tag.matchedPattern}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {pages && pages.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Páginas fornecidas pelo backend
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pages.map((page, index) => (
              <div key={page.url || index} className="rounded-lg border p-3 text-sm">
                <div className="font-medium break-all">{page.url}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Este item é exibido somente quando o backend fornece um relatório de página real.
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Deep Scan multi-página não está habilitado no runtime atual. Para uma implementação
            confiável ele deve rodar em um worker dedicado com Chromium, fila e persistência.
            Nenhum resultado multi-página é simulado nesta tela.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        URL auditada: {url}. A análise externa não consegue confirmar contratos, base legal,
        retenção interna, tratamento server-side ou conformidade jurídica integral.
      </p>
    </div>
  );
};

export default DeepAnalysisPanel;
