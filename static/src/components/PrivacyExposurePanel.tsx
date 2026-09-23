import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, ChevronDown, ChevronUp, Info, Eye, EyeOff } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

interface PersonalDataFinding {
  findingId: string;
  category: string;
  categoryLabel: string;
  classification: string;
  confidence: string;
  pageUrl: string;
  source: string;
  fieldName: string;
  redactedValue: string;
  destinationDomain: string;
  firstOrThirdParty: string;
  technicalEvidence: string;
  recommendation: string;
  riskLevel: string;
}

interface SensitiveDataFinding {
  findingId: string;
  sensitiveCategory: string;
  categoryLabel: string;
  lgpdArticle: string;
  description: string;
  confidence: string;
  source: string;
  fieldName: string;
  redactedValue: string;
  consentState: string;
  destinationDomain: string;
  firstOrThirdParty: string;
  technicalEvidence: string;
  legalNote: string;
  highRiskCombination: string | null;
  riskLevel: string;
}

interface PrivacyExposurePanelProps {
  personalDataFindings: PersonalDataFinding[];
  sensitiveDataFindings: SensitiveDataFinding[];
  hasConsentMechanism: boolean;
  scanMethod: string;
}

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-800 border-green-200',
};

const FindingCard = ({
  title,
  badge,
  badgeClass,
  children,
}: {
  title: string;
  badge: string;
  badgeClass: string;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden mb-3 shadow-sm">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{title}</span>
          <Badge className={`text-xs ${badgeClass}`}>{badge}</Badge>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-sm space-y-2">
          {children}
        </div>
      )}
    </div>
  );
};

const PrivacyExposurePanel = ({
  personalDataFindings,
  sensitiveDataFindings,
  hasConsentMechanism,
  scanMethod,
}: PrivacyExposurePanelProps) => {
  const { t } = useI18n();
  const [showTechnical, setShowTechnical] = useState(false);

  const SOURCE_LABELS: Record<string, string> = {
    network: `🌐 ${t('privacy_exposure.source_network')}`,
    network_post: `📤 ${t('privacy_exposure.source_network_post')}`,
    datalayer: `📊 ${t('privacy_exposure.source_datalayer')}`,
    url_param: `🔗 ${t('privacy_exposure.source_url_param')}`,
    cookie: `🍪 ${t('privacy_exposure.source_cookie')}`,
    local_storage: `💾 ${t('privacy_exposure.source_local_storage')}`,
    session_storage: `🗂 ${t('privacy_exposure.source_session_storage')}`,
    form: `📝 ${t('privacy_exposure.source_form')}`,
  };

  const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
    confirmed: { label: t('privacy_exposure.confidence_confirmed'), color: 'bg-red-100 text-red-800' },
    probable: { label: t('privacy_exposure.confidence_probable'), color: 'bg-orange-100 text-orange-800' },
    possible: { label: t('privacy_exposure.confidence_possible'), color: 'bg-yellow-100 text-yellow-800' },
    not_confirmed: { label: t('privacy_exposure.confidence_not_confirmed'), color: 'bg-gray-100 text-gray-600' },
    inconclusive: { label: t('privacy_exposure.confidence_inconclusive'), color: 'bg-gray-100 text-gray-600' },
  };

  const totalSignals = personalDataFindings.length + sensitiveDataFindings.length;
  const criticalSignals = sensitiveDataFindings.length;
  const thirdPartyTransmissions = [
    ...personalDataFindings.filter((f) => f.firstOrThirdParty === 'third_party'),
    ...sensitiveDataFindings.filter((f) => f.firstOrThirdParty === 'third_party'),
  ].length;

  if (totalSignals === 0) {
    return (
      <Card className="shadow-md border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-600" />
            {t('privacy_exposure.title')}
          </CardTitle>
          <CardDescription>{t('privacy_exposure.no_signals_card')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
            <Shield className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-300">{t('privacy_exposure.no_signals_title')}</p>
              <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                {t('privacy_exposure.no_signals_desc')}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4 italic">
            {t('privacy_exposure.scan_method_note').replace('{method}', scanMethod)}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-orange-600" />
          {t('privacy_exposure.title')}
          <Badge className="ml-auto bg-orange-100 text-orange-800 border border-orange-200">
            {totalSignals} {totalSignals !== 1 ? 'sinais' : 'sinal'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Sinais técnicos de dados pessoais detectados em parâmetros, cookies, storage e requisições de rede.{' '}
          <strong className="text-orange-700 dark:text-orange-300">Valores ocultados para proteção dos dados.</strong>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
            <div className="text-2xl font-bold text-orange-700">{totalSignals}</div>
            <div className="text-xs text-orange-600">{t('privacy_exposure.total_signals')}</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="text-2xl font-bold text-red-700">{criticalSignals}</div>
            <div className="text-xs text-red-600">{t('privacy_exposure.sensitive_signals')}</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
            <div className="text-2xl font-bold text-purple-700">{thirdPartyTransmissions}</div>
            <div className="text-xs text-purple-600">{t('privacy_exposure.third_party')}</div>
          </div>
          <div className={`text-center p-3 rounded-xl border ${hasConsentMechanism ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className={`text-2xl font-bold ${hasConsentMechanism ? 'text-green-700' : 'text-red-700'}`}>
              {hasConsentMechanism ? '✓' : '✗'}
            </div>
            <div className={`text-xs ${hasConsentMechanism ? 'text-green-600' : 'text-red-600'}`}>
              {hasConsentMechanism ? t('privacy_exposure.cmp_detected') : t('privacy_exposure.no_cmp')}
            </div>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowTechnical((prev) => !prev)}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            {showTechnical ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showTechnical ? t('privacy_exposure.hide_technical') : t('privacy_exposure.show_technical')}
          </button>
        </div>

        {/* Sensitive Data Findings */}
        <div>
          <h3 className="font-semibold text-red-800 dark:text-red-300 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {t('privacy_exposure.sensitive_section_title')} ({sensitiveDataFindings.length})
          </h3>
          {sensitiveDataFindings.length === 0 ? (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-sm text-green-800 dark:text-green-300 flex items-start gap-2">
              <Shield className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
              {t('privacy_exposure.no_sensitive_data')}
            </div>
          ) : (
            sensitiveDataFindings.map((f) => (
              <FindingCard
                key={f.findingId}
                title={f.categoryLabel}
                badge={f.lgpdArticle.split('—')[0].trim()}
                badgeClass="bg-red-100 text-red-800 border-red-200"
              >
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="font-medium text-gray-600">{t('privacy_exposure.field_label')}:</span>{' '}
                    <code className="bg-gray-100 px-1 rounded">{f.fieldName}</code>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">{t('privacy_exposure.source_label')}:</span>{' '}
                    {SOURCE_LABELS[f.source] || f.source}
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">{t('privacy_exposure.destination_label')}:</span>{' '}
                    <span className={f.firstOrThirdParty === 'third_party' ? 'text-red-700 font-semibold' : ''}>
                      {f.destinationDomain || t('privacy_exposure.own_site')}
                      {f.firstOrThirdParty === 'third_party' ? ` ${t('privacy_exposure.third_party_label')}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">{t('privacy_exposure.confidence_label')}:</span>{' '}
                    <Badge className={`text-xs ${CONFIDENCE_LABELS[f.confidence]?.color || 'bg-gray-100'}`}>
                      {CONFIDENCE_LABELS[f.confidence]?.label || f.confidence}
                    </Badge>
                  </div>
                </div>
                {f.highRiskCombination && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                    ⚠️ {t('privacy_exposure.high_risk_combination')}: {f.highRiskCombination.replace(/_/g, ' ')}
                  </div>
                )}
                {showTechnical && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-xs text-gray-700 font-mono">
                    {f.technicalEvidence}
                  </div>
                )}
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <Info className="w-3 h-3 inline mr-1" />
                  {f.legalNote}
                </div>
              </FindingCard>
            ))
          )}
        </div>

        {/* Personal Data Findings */}
        {personalDataFindings.length > 0 && (
          <div>
            <h3 className="font-semibold text-orange-800 dark:text-orange-300 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              {t('privacy_exposure.personal_section_title')} ({personalDataFindings.length})
            </h3>
            {personalDataFindings.map((f) => (
              <FindingCard
                key={f.findingId}
                title={f.categoryLabel}
                badge={f.riskLevel}
                badgeClass={RISK_COLORS[f.riskLevel] || 'bg-gray-100 text-gray-800'}
              >
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="font-medium text-gray-600">{t('privacy_exposure.field_label')}:</span>{' '}
                    <code className="bg-gray-100 px-1 rounded">{f.fieldName}</code>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">{t('privacy_exposure.source_label')}:</span>{' '}
                    {SOURCE_LABELS[f.source] || f.source}
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">{t('privacy_exposure.value_redacted')}:</span>{' '}
                    <code className="bg-gray-100 px-1 rounded text-gray-500">{f.redactedValue}</code>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">{t('privacy_exposure.destination_label')}:</span>{' '}
                    <span className={f.firstOrThirdParty === 'third_party' ? 'text-orange-700 font-semibold' : ''}>
                      {f.destinationDomain || t('privacy_exposure.own_site')}
                      {f.firstOrThirdParty === 'third_party' ? ` ${t('privacy_exposure.third_party_label')}` : ''}
                    </span>
                  </div>
                </div>
                {showTechnical && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-xs text-gray-700 font-mono">
                    {f.technicalEvidence}
                  </div>
                )}
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  {f.recommendation}
                </div>
              </FindingCard>
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-500">
          <strong>⚠️ {t('privacy_exposure.disclaimer_label')}:</strong> {t('privacy_exposure.disclaimer')}
        </div>
      </CardContent>
    </Card>
  );
};

export default PrivacyExposurePanel;
