import { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock, Copy, Fingerprint, Network } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface TagFinding {
  id?: string;
  name: string;
  vendor?: string;
  type: string;
  position?: number;
  lineNumber?: number | null;
  isBeforeConsent: boolean;
  lgpdRisk?: string;
  confidence?: string;
  detectionMethod?: string;
  dataCollected?: string[];
  dataCollectionBasis?: string;
  dataCollectionObserved?: boolean;
  sourceBlock?: string | null;
  matchedPattern?: string | null;
  tagId?: string | null;
}

interface PersonalFinding {
  category?: string;
  type?: string;
  redactedValue?: string;
  evidence?: string;
  confidence?: string;
  source?: string;
  destinationDomain?: string;
}

interface SensitiveFinding {
  sensitiveCategory?: string;
  category?: string;
  type?: string;
  evidence?: string;
  confidence?: string;
  source?: string;
  destinationDomain?: string;
}

interface ForensicEvidencePanelProps {
  tags: TagFinding[];
  hasConsentTool: boolean;
  scanTimestamp: string;
  personalDataFindings?: PersonalFinding[];
  sensitiveDataFindings?: SensitiveFinding[];
  url: string;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR');
}

function evidenceForTag(tag: TagFinding): string {
  if (tag.sourceBlock?.trim()) return tag.sourceBlock.trim();
  if (tag.matchedPattern?.trim()) return tag.matchedPattern.trim();
  return 'Nenhum trecho bruto foi disponibilizado para esta tag.';
}

/**
 * Forensic panel that only renders evidence already returned by the backend.
 * It does not synthesize network payloads, infer PII from vendor capability
 * lists, or present HTML order as legal proof.
 */
export default function ForensicEvidencePanel({
  tags = [],
  hasConsentTool,
  scanTimestamp,
  personalDataFindings = [],
  sensitiveDataFindings = [],
  url,
}: ForensicEvidencePanelProps) {
  const orderedTags = useMemo(
    () => [...tags].sort((a, b) => Number(Boolean(b.isBeforeConsent)) - Number(Boolean(a.isBeforeConsent))),
    [tags]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = orderedTags[selectedIndex] || orderedTags[0];

  const runtimeConfirmed = tags.filter((tag) => tag.detectionMethod === 'network_request');
  const preConsent = tags.filter((tag) => tag.isBeforeConsent && tag.type !== 'consent');

  const copyEvidence = () => {
    if (!selected) return;
    navigator.clipboard.writeText(evidenceForTag(selected));
    toast({ title: 'Evidência copiada', description: 'O trecho técnico foi copiado.' });
  };

  return (
    <div className="space-y-5">
      <Alert className="border-cyan-500/30 bg-cyan-500/5">
        <Fingerprint className="h-4 w-4 text-cyan-400" />
        <AlertDescription>
          “Forense” aqui significa evidência técnica observável pelo scanner. Não é perícia
          judicial, prova de infração ou reconstrução de payload que não tenha sido capturado.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tags observadas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{tags.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex gap-2"><Network className="h-4 w-4"/>Runtime confirmado</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{runtimeConfirmed.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Sinais pré-consentimento</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{preConsent.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex gap-2"><Clock className="h-4 w-4"/>Captura</CardTitle></CardHeader>
          <CardContent><div className="text-xs">{formatTimestamp(scanTimestamp)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidência por tag</CardTitle>
        </CardHeader>
        <CardContent>
          {orderedTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma evidência de tag disponível.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-[240px_1fr]">
              <div className="space-y-2">
                {orderedTags.slice(0, 30).map((tag, index) => (
                  <button
                    type="button"
                    key={tag.id || `${tag.name}-${index}`}
                    onClick={() => setSelectedIndex(index)}
                    className={`w-full rounded-lg border p-3 text-left text-sm ${selectedIndex === index ? 'border-cyan-500 bg-cyan-500/5' : ''}`}
                  >
                    <div className="font-medium truncate">{tag.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline">{tag.detectionMethod || 'fonte não informada'}</Badge>
                      {tag.confidence && <Badge variant="outline">{tag.confidence}</Badge>}
                      {tag.isBeforeConsent && <Badge variant="secondary">pré-consentimento</Badge>}
                    </div>
                  </button>
                ))}
              </div>

              {selected && (
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <strong>{selected.name}</strong>
                    {selected.tagId && <Badge variant="outline">{selected.tagId}</Badge>}
                    <button type="button" onClick={copyEvidence} className="ml-auto inline-flex items-center gap-1 text-xs">
                      <Copy className="h-3 w-3"/> Copiar evidência
                    </button>
                  </div>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-4 text-xs text-slate-200">
                    {evidenceForTag(selected)}
                  </pre>
                  {selected.dataCollected && selected.dataCollected.length > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Categorias associadas ao fornecedor: {selected.dataCollected.join(', ')}.
                      {' '}Essas categorias vêm do catálogo de capacidades do fornecedor e não significam
                      que cada valor foi observado nesta captura.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sinais de dados pessoais observados</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[...personalDataFindings, ...sensitiveDataFindings].length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum sinal estruturado de dado pessoal/sensível foi retornado pelo motor nesta captura.
            </p>
          ) : (
            [...personalDataFindings, ...sensitiveDataFindings].map((finding: any, index) => (
              <div key={index} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{finding.category || finding.sensitiveCategory || finding.type || 'dado'}</Badge>
                  {finding.confidence && <Badge variant="outline">confiança: {finding.confidence}</Badge>}
                  {finding.source && <Badge variant="outline">fonte: {finding.source}</Badge>}
                </div>
                {finding.evidence && <p className="mt-2 text-xs break-all">{finding.evidence}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {!hasConsentTool && (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertDescription>
            Nenhum mecanismo conhecido de consentimento foi observado. Isso exige revisão, mas não
            prova ausência de base legal ou não conformidade.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">URL analisada: {url}</p>
    </div>
  );
}
