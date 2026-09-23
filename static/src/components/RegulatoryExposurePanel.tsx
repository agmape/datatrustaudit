import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Shield, AlertTriangle, Info, CheckCircle, XCircle,
  Eye, Lock, ChevronDown, ChevronUp, Zap, FileWarning,
} from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

/* ─── Interfaces ─── */
interface TechnicalSignal {
  signal: string;
  severity: string;
  technical_basis: string;
}

interface RegulatoryContext {
  type: 'informational' | 'disclaimer';
  title: string;
  content: string;
}

interface RegulatoryExposure {
  jurisdiction: string;
  law: string;
  law_full: string;
  exposure_level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  exposure_label: string;
  personal_data_signals: number;
  sensitive_data_signals: number;
  compliance_signals: number;
  has_consent_mechanism: boolean;
  regulatory_context: RegulatoryContext[];
  technical_signals: TechnicalSignal[];
  disclaimer: string;
}

interface PersonalDataFinding {
  findingId: string;
  category: string;
  categoryLabel: string;
  classification: string;
  confidence: string;
  fieldName: string;
  redactedValue: string;
  source: string;
  destinationDomain: string;
  firstOrThirdParty: string;
  riskLevel: string;
  recommendation: string;
}

interface SensitiveDataFinding {
  findingId: string;
  sensitiveCategory: string;
  categoryLabel: string;
  lgpdArticle: string;
  fieldName: string;
  redactedValue: string;
  source: string;
  destinationDomain: string;
  firstOrThirdParty: string;
  consentState: string;
  riskLevel: string;
}

interface TagBrief {
  name: string;
  type: string;
  isBeforeConsent: boolean;
  lgpdRisk: string;
}

interface RegulatoryExposurePanelProps {
  regulatoryExposure: RegulatoryExposure | null;
  personalDataFindings?: PersonalDataFinding[];
  sensitiveDataFindings?: SensitiveDataFinding[];
  tags?: TagBrief[];
  estimatedRiskExposure?: string;
  score?: number;
}

/* ─── Config ─── */
const EXPOSURE_CONFIG = {
  LOW:      { color: 'text-emerald-400', bg: 'bg-emerald-900/20', border: 'border-emerald-700/50', badgeClass: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/60', icon: CheckCircle, iconColor: 'text-emerald-400', barWidth: '20%', barColor: 'bg-emerald-500' },
  MODERATE: { color: 'text-yellow-400',  bg: 'bg-yellow-900/20',  border: 'border-yellow-700/50',  badgeClass: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/60',   icon: AlertTriangle, iconColor: 'text-yellow-400', barWidth: '50%', barColor: 'bg-yellow-500' },
  HIGH:     { color: 'text-orange-400',  bg: 'bg-orange-900/20',  border: 'border-orange-700/50',  badgeClass: 'bg-orange-900/40 text-orange-300 border-orange-700/60',   icon: AlertTriangle, iconColor: 'text-orange-400', barWidth: '75%', barColor: 'bg-orange-500' },
  CRITICAL: { color: 'text-red-400',     bg: 'bg-red-900/20',     border: 'border-red-700/50',     badgeClass: 'bg-red-900/40 text-red-300 border-red-700/60',            icon: XCircle,       iconColor: 'text-red-400',     barWidth: '100%', barColor: 'bg-red-600' },
};

const SEVERITY_DARK: Record<string, string> = {
  critical: 'bg-red-900/50 text-red-300 border-red-700/60',
  high:     'bg-orange-900/50 text-orange-300 border-orange-700/60',
  medium:   'bg-yellow-900/50 text-yellow-300 border-yellow-700/60',
  low:      'bg-emerald-900/50 text-emerald-300 border-emerald-700/60',
};

const SOURCE_ICON: Record<string, string> = {
  network: '🌐', network_post: '📤', datalayer: '📊',
  url_param: '🔗', cookie: '🍪', local_storage: '💾',
  session_storage: '🗂', form: '📝',
};

/* ─── Corrective actions derived from findings ─── */
const buildCorrectiveActions = (
  personalData: PersonalDataFinding[],
  sensitiveData: SensitiveDataFinding[],
  tagsBeforeConsent: TagBrief[],
): Array<{ priority: 'critical' | 'high' | 'medium'; action: string; reference: string }> => {
  const actions: Array<{ priority: 'critical' | 'high' | 'medium'; action: string; reference: string }> = [];
  if (sensitiveData.length > 0)
    actions.push({ priority: 'critical', action: `Bloquear transmissão de ${sensitiveData.length} dado(s) sensível(eis) detectado(s)`, reference: 'LGPD Art. 5 X / Art. 11' });
  if (tagsBeforeConsent.length > 0)
    actions.push({ priority: 'critical', action: `Atrasar ${tagsBeforeConsent.length} tag(s) até obtenção do consentimento explícito no GTM`, reference: 'LGPD Art. 7 I / Art. 8' });
  const thirdParty = personalData.filter(f => f.firstOrThirdParty === 'third_party');
  if (thirdParty.length > 0)
    actions.push({ priority: 'high', action: `Revisar compartilhamento com ${new Set(thirdParty.map(f => f.destinationDomain)).size} domínio(s) terceiros`, reference: 'LGPD Art. 7 V / Art. 49' });
  if (personalData.length > 0)
    actions.push({ priority: 'high', action: `Implementar redação/hasheamento dos ${personalData.length} campo(s) de dados pessoais identificados`, reference: 'LGPD Art. 46' });
  if (actions.length === 0)
    actions.push({ priority: 'medium', action: 'Revisar política de privacidade e implementar CMP/banner de cookies', reference: 'LGPD Art. 8 / ANPD Resolução CD/ANPD Nº 4' });
  return actions;
};

/* ─── Component ─── */
const RegulatoryExposurePanel = ({
  regulatoryExposure,
  personalDataFindings = [],
  sensitiveDataFindings = [],
  tags = [],
  estimatedRiskExposure,
  score,
}: RegulatoryExposurePanelProps) => {
  const { t } = useI18n();
  const [piiExpanded, setPiiExpanded] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(true);

  const tagsBeforeConsent = tags.filter(tag => tag.isBeforeConsent);
  const actions = buildCorrectiveActions(personalDataFindings, sensitiveDataFindings, tagsBeforeConsent);

  if (!regulatoryExposure) {
    return (
      <Card className="shadow-md border border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-200">
            <Shield className="w-5 h-5 text-blue-400" />
            {t('regulatory.title')}
          </CardTitle>
          <CardDescription className="text-slate-400">{t('regulatory.no_data')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const level = regulatoryExposure.exposure_level;
  const config = EXPOSURE_CONFIG[level] || EXPOSURE_CONFIG.LOW;
  const ExposureIcon = config.icon;
  const allPii = [...personalDataFindings, ...sensitiveDataFindings];

  return (
    <div className="space-y-4">
      {/* ── Main Card ── */}
      <Card className="shadow-md border border-slate-800 bg-slate-900">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Shield className="w-5 h-5 text-blue-400" />
            {t('regulatory.title')}
            <Badge className={`ml-auto text-xs ${config.badgeClass}`}>{level}</Badge>
          </CardTitle>
          <CardDescription className="text-slate-400">
            Indicadores técnicos de conformidade e contexto regulatório aplicável.{' '}
            <strong className="text-blue-400">{t('regulatory.not_legal_advice')}</strong>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Exposure banner */}
          <div className={`flex items-start gap-3 p-4 rounded-xl border ${config.bg} ${config.border}`}>
            <ExposureIcon className={`w-6 h-6 mt-0.5 shrink-0 ${config.iconColor}`} />
            <div className="flex-1">
              <div className={`font-bold text-lg ${config.color}`}>{regulatoryExposure.exposure_label}</div>
              <div className="text-sm text-slate-400 mt-1">
                {t('regulatory.jurisdiction_label')}: <strong className="text-slate-200">{regulatoryExposure.jurisdiction}</strong> — {regulatoryExposure.law_full}
              </div>
              {/* Severity bar */}
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Baixo</span>
                  <span>Moderado</span>
                  <span>Alto</span>
                  <span>Crítico</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${config.barColor}`}
                    style={{ width: config.barWidth }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Financial impact */}
          {estimatedRiskExposure && (
            <div className="p-4 rounded-xl border border-red-700/40 bg-red-900/20">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-red-400" />
                <span className="font-semibold text-red-300 text-sm">Estimativa de Exposição Financeira (LGPD)</span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-red-300">{estimatedRiskExposure}</span>
                <span className="text-xs text-slate-400">(até 2% faturamento anual, limite R$ 50M/infração)</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  { level: '🔴 Crítico', desc: 'Exposição ativa de PII', active: level === 'CRITICAL' },
                  { level: '🟠 Alto',    desc: 'Disparo sem consentimento', active: level === 'HIGH' },
                  { level: '🟡 Médio',   desc: 'Ausência de CMP/política', active: level === 'MODERATE' },
                ].map(({ level: l, desc, active }) => (
                  <div key={l} className={`p-2 rounded-lg border text-center text-xs ${active ? 'border-red-500/60 bg-red-800/30' : 'border-slate-700 bg-slate-800/30 opacity-50'}`}>
                    <div className="font-bold text-slate-200">{l}</div>
                    <div className="text-slate-400 mt-0.5">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-3 rounded-xl bg-slate-800 border border-slate-700">
              <div className="text-xl font-bold text-slate-100">{regulatoryExposure.personal_data_signals}</div>
              <div className="text-xs text-slate-400">{t('regulatory.personal_signals')}</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-red-900/30 border border-red-700/50">
              <div className="text-xl font-bold text-red-300">{regulatoryExposure.sensitive_data_signals}</div>
              <div className="text-xs text-red-400">{t('regulatory.sensitive_signals')}</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-orange-900/30 border border-orange-700/50">
              <div className="text-xl font-bold text-orange-300">{tagsBeforeConsent.length}</div>
              <div className="text-xs text-orange-400">Tags sem consentimento</div>
            </div>
            <div className={`text-center p-3 rounded-xl border ${regulatoryExposure.has_consent_mechanism ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-red-900/30 border-red-700/50'}`}>
              <div className={`text-xl font-bold ${regulatoryExposure.has_consent_mechanism ? 'text-emerald-300' : 'text-red-300'}`}>
                {regulatoryExposure.has_consent_mechanism ? '✓' : '✗'}
              </div>
              <div className={`text-xs ${regulatoryExposure.has_consent_mechanism ? 'text-emerald-400' : 'text-red-400'}`}>
                {regulatoryExposure.has_consent_mechanism ? t('regulatory.consent_mechanism') : t('regulatory.no_consent_mechanism')}
              </div>
            </div>
          </div>

          {/* Tags before consent */}
          {tagsBeforeConsent.length > 0 && (
            <div>
              <h3 className="font-semibold text-red-300 mb-2 flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Tags disparadas ANTES do consentimento ({tagsBeforeConsent.length}) — LGPD Art. 7º e 8º
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800">
                    <tr className="text-slate-400 text-left">
                      <th className="px-3 py-2">Tag</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Risco LGPD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tagsBeforeConsent.map((tag, i) => (
                      <tr key={i} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-900/50' : 'bg-slate-800/30'}`}>
                        <td className="px-3 py-2 font-medium text-orange-200">{tag.name}</td>
                        <td className="px-3 py-2 text-slate-400">{tag.type}</td>
                        <td className="px-3 py-2">
                          <Badge className={SEVERITY_DARK[tag.lgpdRisk?.toLowerCase()] || 'bg-slate-800 text-slate-300 border-slate-600'}>
                            {tag.lgpdRisk || 'médio'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── PII Exposure Table ── */}
      {allPii.length > 0 && (
        <Card className="shadow-md border border-slate-800 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle
              className="flex items-center gap-2 text-slate-100 cursor-pointer text-base"
              onClick={() => setPiiExpanded(v => !v)}
            >
              <Eye className="w-4 h-4 text-red-400" />
              Dados Pessoais / PII Detectados
              <Badge className="bg-red-900/40 text-red-300 border-red-700/60 text-xs ml-1">{allPii.length}</Badge>
              <span className="ml-auto">{piiExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
            </CardTitle>
            {!piiExpanded && (
              <CardDescription className="text-slate-500 text-xs mt-1">
                Campos identificados em parâmetros de URL, dataLayer, cookies e requisições de rede. Clique para expandir.
              </CardDescription>
            )}
          </CardHeader>
          {piiExpanded && (
            <CardContent>
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800">
                    <tr className="text-slate-400 text-left">
                      <th className="px-3 py-2">Campo</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Fonte</th>
                      <th className="px-3 py-2">Destino</th>
                      <th className="px-3 py-2">Risco</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPii.map((f, i) => {
                      const isPersonal = 'riskLevel' in f;
                      const finding = f as PersonalDataFinding | SensitiveDataFinding;
                      const riskLevel = isPersonal ? (f as PersonalDataFinding).riskLevel : (f as SensitiveDataFinding).riskLevel;
                      const label = isPersonal ? (f as PersonalDataFinding).categoryLabel : (f as SensitiveDataFinding).categoryLabel;
                      return (
                        <tr key={i} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-900/50' : 'bg-slate-800/30'}`}>
                          <td className="px-3 py-2">
                            <code className="bg-slate-700/60 text-orange-200 px-1 rounded">{finding.fieldName}</code>
                          </td>
                          <td className="px-3 py-2 text-slate-300">{label}</td>
                          <td className="px-3 py-2 text-slate-400">{SOURCE_ICON[finding.source] || '?'} {finding.source}</td>
                          <td className="px-3 py-2">
                            <span className={finding.firstOrThirdParty === 'third_party' ? 'text-red-300 font-semibold' : 'text-slate-400'}>
                              {finding.destinationDomain || 'próprio site'}
                              {finding.firstOrThirdParty === 'third_party' && ' ⚠️'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <Badge className={`text-[10px] ${SEVERITY_DARK[riskLevel?.toLowerCase()] || 'bg-slate-800 text-slate-300 border-slate-600'}`}>
                              {riskLevel}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Corrective Actions ── */}
      <Card className="shadow-md border border-slate-800 bg-slate-900">
        <CardHeader className="pb-2">
          <CardTitle
            className="flex items-center gap-2 text-slate-100 cursor-pointer text-base"
            onClick={() => setActionsExpanded(v => !v)}
          >
            <FileWarning className="w-4 h-4 text-yellow-400" />
            Ações Corretivas Recomendadas
            <Badge className="bg-yellow-900/40 text-yellow-300 border-yellow-700/60 text-xs ml-1">{actions.length}</Badge>
            <span className="ml-auto">{actionsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
          </CardTitle>
        </CardHeader>
        {actionsExpanded && (
          <CardContent>
            <div className="space-y-2">
              {actions.map((action, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-700 bg-slate-800/50">
                  <Badge className={`text-[10px] shrink-0 mt-0.5 ${SEVERITY_DARK[action.priority]}`}>{action.priority}</Badge>
                  <div className="flex-1">
                    <p className="text-sm text-slate-200">{action.action}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{action.reference}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Technical Signals ── */}
      {regulatoryExposure.technical_signals.length > 0 && (
        <Card className="shadow-md border border-slate-800 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-slate-100 text-base">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              {t('regulatory.technical_signals_title')} ({regulatoryExposure.technical_signals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {regulatoryExposure.technical_signals.map((signal, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-700 bg-slate-800/50">
                  <Badge className={`text-xs shrink-0 mt-0.5 ${SEVERITY_DARK[signal.severity] || 'bg-slate-800 text-slate-300 border-slate-600'}`}>
                    {signal.severity}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{signal.signal}</p>
                    {signal.technical_basis && (
                      <p className="text-xs text-slate-500 mt-1">{signal.technical_basis}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Regulatory Context ── */}
      {regulatoryExposure.regulatory_context.length > 0 && (
        <Card className="shadow-md border border-slate-800 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-blue-400 text-base">
              <Info className="w-4 h-4" />
              {t('regulatory.regulatory_context_title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {regulatoryExposure.regulatory_context.map((ctx, i) => (
              <div
                key={i}
                className={`p-4 rounded-xl border ${
                  ctx.type === 'disclaimer'
                    ? 'bg-amber-900/20 border-amber-700/50'
                    : 'bg-blue-900/20 border-blue-700/50'
                }`}
              >
                <p className={`font-semibold text-sm mb-2 ${ctx.type === 'disclaimer' ? 'text-amber-300' : 'text-blue-300'}`}>
                  {ctx.title}
                </p>
                <p className={`text-sm leading-relaxed ${ctx.type === 'disclaimer' ? 'text-amber-400' : 'text-blue-400'}`}>
                  {ctx.content}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Disclaimer ── */}
      <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl flex items-start gap-2">
        <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          <strong className="text-slate-400">⚠️ {t('regulatory.important')}:</strong> {regulatoryExposure.disclaimer}
        </p>
      </div>
    </div>
  );
};

export default RegulatoryExposurePanel;
