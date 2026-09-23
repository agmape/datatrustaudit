import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { FileAnalysisService } from '@/services/fileAnalysisService';
import AuditForm from '@/components/AuditForm';
import NewAuditResults from '@/components/NewAuditResults';
import FileAnalysisResults from '@/components/FileAnalysisResults';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart3 } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

interface Tag {
    id: string;
    name: string;
    type: string;
    position: number;
    lineNumber: number;
    matchedPattern: string;
    tagId: string | null;
    dataCollected: string[];
    lgpdRisk: string;
    context: string;
    isBeforeConsent: boolean;
}

interface NewAuditResult {
    url: string;
    timestamp: string;
    tags: Tag[];
    tagCount: number;
    typeCounts: Record<string, number>;
    duplicates: any[];
    loadingOrder: any[];
    privacy: {
        jurisdiction: string;
        framework: string;
        confidenceLevel: string;
        consentRisks: string[];
        disclosureGaps: string[];
        violations: any[];
        total_violations: number;
        estimatedRiskExposure: string;
        has_consent_tool: boolean;
        has_universal_analytics: boolean;
        compliance_score: number;
    };
    score: number;
    scoreAvailable?: boolean;
    scores?: {
        auditScore: number;
        trackingQualityScore: number;
        eventArchitectureScore: number;
        datalayerQualityScore: number;
        consentIntegrityScore: number;
        privacyRiskScore: number;
        tagDuplicationRisk?: number;
        estimatedBusinessImpact?: string;
    };
    gtmQuality?: any;
    events?: any;
    consentAudit?: any;
    recommendations?: any[];
    dataQualityNotes?: any[];
    summary: {
        totalTags: number;
        consentDetected: boolean;
        consentModeV2?: boolean;
        hasUniversalAnalytics: boolean;
        violationsCount: number;
        estimatedFine: string;
        piiExposureCount?: number;
        securityIssuesCount?: number;
        eventsDetected?: number;
        duplicatesDetected?: number;
    };
    pageReports?: any[];
}
interface AuditContainerProps {
  onStateChange?: (isActive: boolean) => void;
}

const normalizeAuditResult = (raw: any): NewAuditResult => {
  const safeRaw = raw || {};
  const rawEvents = Array.isArray(safeRaw.events) ? { events: safeRaw.events, totalEvents: safeRaw.events.length } : (safeRaw.events || {});
  const rawViolations = safeRaw.violations || safeRaw.privacy?.violations || [];

  // Extract tags safely
  const tags = (Array.isArray(safeRaw.tags) ? safeRaw.tags : []).map((t: any) => ({
    id: t.id || '',
    name: t.name || t.vendor || '',
    type: t.type || 'custom',
    position: t.position || 0,
    lineNumber: t.lineNumber || t.line_number || 0,
    matchedPattern: t.matchedPattern || t.matched_pattern || '',
    tagId: t.tagId || t.tag_id || null,
    dataCollected: t.dataCollected || t.data_collected || [],
    lgpdRisk: t.lgpdRisk || t.privacy_risk || t.lgpd_risk || 'medium',
    context: t.context || t.source_block || '',
    isBeforeConsent: t.isBeforeConsent || t.is_before_consent || false,
  }));

  // Calculate typeCounts
  const typeCounts: Record<string, number> = {};
  tags.forEach((t: any) => {
    const type = t.type || 'custom';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  // Calculate score & scores
  const score = safeRaw.score ?? safeRaw.scores?.overall ?? safeRaw.scores?.auditScore ?? null;
  const scores = {
    auditScore: safeRaw.scores?.auditScore ?? safeRaw.scores?.overall ?? score ?? 0,
    trackingQualityScore: safeRaw.scores?.trackingQualityScore ?? safeRaw.scores?.tracking_quality ?? 0,
    eventArchitectureScore: safeRaw.scores?.eventArchitectureScore ?? safeRaw.scores?.event_architecture ?? 0,
    datalayerQualityScore: safeRaw.scores?.datalayerQualityScore ?? safeRaw.scores?.datalayer_quality ?? 0,
    consentIntegrityScore: safeRaw.scores?.consentIntegrityScore ?? safeRaw.scores?.consent_integrity ?? 0,
    privacyRiskScore: safeRaw.scores?.privacyRiskScore ?? safeRaw.scores?.privacy_risk ?? 0,
  };

  // Privacy info
  const privacy = {
    jurisdiction: safeRaw.privacy?.jurisdiction || 'Unknown',
    framework: safeRaw.privacy?.framework || safeRaw.privacy?.law_full || 'General Privacy',
    confidenceLevel: safeRaw.privacy?.confidenceLevel || safeRaw.privacy?.confidence_level || '',
    consentRisks: safeRaw.privacy?.consentRisks || safeRaw.privacy?.consent_risks || [],
    disclosureGaps: safeRaw.privacy?.disclosureGaps || safeRaw.privacy?.disclosure_gaps || [],
    violations: rawViolations.map((v: any) => ({
      tag: v.tag || '',
      violation: v.violation || '',
      article: v.article || '',
      description: v.description || '',
      severity: v.severity || 'medium',
      confidence: v.confidence || 'medium',
      dataCollected: v.dataCollected || v.data_collected || [],
      tagId: v.tagId || v.tag_id || null,
    })),
    total_violations: safeRaw.privacy?.totalViolations ?? safeRaw.privacy?.total_violations ?? safeRaw.summary?.totalViolations ?? rawViolations.length ?? 0,
    estimatedRiskExposure: safeRaw.privacy?.estimatedRiskExposure || safeRaw.privacy?.estimated_risk_exposure || safeRaw.summary?.estimatedFine || 'Unavailable in static scan',
    has_consent_tool: safeRaw.privacy?.hasConsentTool ?? safeRaw.privacy?.has_consent_tool ?? safeRaw.privacy?.cmpDetected ?? safeRaw.consent?.cmpDetected ?? safeRaw.summary?.consentDetected ?? false,
    has_universal_analytics: safeRaw.privacy?.hasUniversalAnalytics ?? safeRaw.privacy?.has_universal_analytics ?? false,
    compliance_score: safeRaw.privacy?.complianceScore ?? safeRaw.privacy?.compliance_score ?? score ?? 0,
  };

  // Summary
  const summary = {
    totalTags: safeRaw.summary?.totalTags ?? tags.length,
    consentDetected: privacy.has_consent_tool,
    consentModeV2: safeRaw.consent?.consentModeV2 || safeRaw.consent?.consent_mode_v2 || false,
    hasUniversalAnalytics: privacy.has_universal_analytics || tags.some((t: any) => t.id === 'ua' || t.name === 'Universal Analytics'),
    violationsCount: privacy.total_violations,
    estimatedFine: privacy.estimatedRiskExposure,
    piiExposureCount: (safeRaw.datalayer_findings || []).filter((f: any) => f.type === 'pii_exposure').length,
    securityIssuesCount: 0,
    eventsDetected: safeRaw.summary?.totalEvents ?? rawEvents.totalEvents ?? rawEvents.total_events ?? 0,
    duplicatesDetected: safeRaw.summary?.duplicatesDetected ?? (safeRaw.duplicates || []).length,
  };

  // Safe Events mapping
  const events = {
    events: (rawEvents.events || []).map((e: any) => ({
      name: e.name || '',
      source: e.source || 'dataLayer',
      validity: e.validity || 'no_parameters',
      confidence: e.confidence || 'medium',
      detectionMethod: e.detectionMethod || e.detection_method || '',
      parametersFound: (e.parametersFound || e.parameters_found || []).map((p: any) => ({
        name: p.name || '',
        value: p.value !== undefined ? p.value : null,
        expectedType: p.expectedType || p.expected_type || null,
        actualType: p.actualType || p.actual_type || null,
        isValid: p.isValid !== undefined ? p.isValid : true,
        issue: p.issue || null,
      })),
      parameterCount: e.parameterCount || e.parameter_count || 0,
      missingRequiredParams: e.missingRequiredParams || e.missing_required_params || [],
      missingRecommendedParams: e.missingRecommendedParams || e.missing_recommended_params || [],
      occurrenceCount: e.occurrenceCount || e.occurrence_count || 1,
      lineNumber: e.lineNumber || e.line_number || null,
      sourceSnippet: e.sourceSnippet || e.source_snippet || null,
      isDuplicate: e.isDuplicate || e.is_duplicate || false,
    })),
    totalEvents: rawEvents.totalEvents || rawEvents.total_events || 0,
    uniqueEventNames: rawEvents.uniqueEventNames || rawEvents.unique_event_names || 0,
    duplicatedEventNames: rawEvents.duplicatedEventNames || rawEvents.duplicated_event_names || 0,
    eventsWithIssues: rawEvents.eventsWithIssues || rawEvents.events_with_issues || 0,
    ecommerceEventsDetected: rawEvents.ecommerceEventsDetected || rawEvents.ecommerce_events_detected || [],
  };

  // Safe GTM Quality mapping
  const rawGtmQuality = safeRaw.gtm_quality || safeRaw.gtmQuality || {};
  const gtmQuality = {
    containers: rawGtmQuality.containers || [],
    containerCount: rawGtmQuality.containerCount || rawGtmQuality.container_count || 0,
    hasNoscript: rawGtmQuality.hasNoscript || rawGtmQuality.has_noscript || false,
    datalayerInitBeforeGtm: rawGtmQuality.datalayerInitBeforeGtm || rawGtmQuality.datalayer_init_before_gtm || false,
    datalayerOverwritten: rawGtmQuality.datalayerOverwritten || rawGtmQuality.datalayer_overwritten || false,
    gtmInHead: rawGtmQuality.gtmInHead || rawGtmQuality.gtm_in_head || false,
    gtmLoadedMultipleTimes: rawGtmQuality.gtmLoadedMultipleTimes || rawGtmQuality.gtm_loaded_multiple_times || false,
    findings: (rawGtmQuality.findings || []).map((f: any) => ({
      check: f.check || '',
      label: f.label || '',
      status: f.status || 'warning',
      description: f.description || '',
      evidence: f.evidence || null,
      recommendation: f.recommendation || null,
      confidence: f.confidence || 'medium',
    })),
    score: rawGtmQuality.score || 0,
  };

  return {
    url: safeRaw.url || '',
    timestamp: safeRaw.timestamp || new Date().toISOString(),
    tags,
    tagCount: tags.length,
    typeCounts,
    duplicates: safeRaw.duplicates || [],
    loadingOrder: safeRaw.loadingOrder || [],
    privacy,
    score: score ?? 0,
    scoreAvailable: safeRaw.scoreAvailable ?? score !== null,
    scores,
    gtmQuality,
    events,
    consentAudit: safeRaw.consent || { findings: [], cmpDetected: false },
    recommendations: safeRaw.recommendations || [],
    dataQualityNotes: (safeRaw.data_quality_notes || safeRaw.dataQualityNotes || []).map((n: any) => ({
      limitation: n.limitation || '',
      reason: n.reason || '',
      affectedAreas: n.affected_areas || n.affectedAreas || [],
    })),
    pageReports: safeRaw.pageReports || [],
    // New privacy engine fields
    personalDataFindings: safeRaw.personalDataFindings || [],
    sensitiveDataFindings: safeRaw.sensitiveDataFindings || [],
    regulatoryExposure: safeRaw.regulatoryExposure || null,
    scanMethod: safeRaw.scanMethod || safeRaw.scan_method || 'html_source',
    summary: {
      totalTags: safeRaw.summary?.totalTags ?? tags.length,
      consentDetected: privacy.has_consent_tool,
      consentModeV2: safeRaw.consent?.consentModeV2 || safeRaw.consent?.consent_mode_v2 || false,
      hasUniversalAnalytics: privacy.has_universal_analytics || tags.some((t: any) => t.id === 'ua' || t.name === 'Universal Analytics'),
      violationsCount: privacy.total_violations,
      estimatedFine: privacy.estimatedRiskExposure,
      piiExposureCount: safeRaw.summary?.piiExposureCount ?? (safeRaw.personalDataFindings || []).length,
      sensitiveDataCount: safeRaw.summary?.sensitiveDataCount ?? (safeRaw.sensitiveDataFindings || []).length,
      securityIssuesCount: 0,
      eventsDetected: safeRaw.summary?.totalEvents ?? rawEvents.totalEvents ?? rawEvents.total_events ?? 0,
      duplicatesDetected: safeRaw.summary?.duplicatesDetected ?? (safeRaw.duplicates || []).length,
    },
  };
};

const AuditContainer = ({ onStateChange }: AuditContainerProps = {}) => {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<NewAuditResult | null>(null);
  const [fileAnalysisResult, setFileAnalysisResult] = useState<any>(null);
  const [useViewSource, setUseViewSource] = useState(false);
  const [currentAuditUrl, setCurrentAuditUrl] = useState('');
  const [analysisType, setAnalysisType] = useState<'url' | 'file' | 'navigation'>('url');
  const [navigationResult, setNavigationResult] = useState<any>(null);
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditPhase, setAuditPhase] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scanUrl = params.get('scanUrl') || localStorage.getItem('datatrust-pending-scan-url');
    if (scanUrl && !url) {
      setUrl(scanUrl);
      localStorage.removeItem('datatrust-pending-scan-url');
    }
  }, [url]);

  const clearAuditData = () => {
    setAuditResult(null);
    setFileAnalysisResult(null);
    setNavigationResult(null);
    setCurrentScanId(null);
    setAuditError(null);
    setAuditPhase('');
    setCurrentAuditUrl('');
    onStateChange?.(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // handleAudit — ponto de entrada único para disparar a auditoria
  // REGRA: nunca lê uiMockState para lógica de negócio. Apenas a URL e o
  //        token real do usuário chegam ao fetch.
  // ─────────────────────────────────────────────────────────────────────────
  // Public audit entrypoint: no login, token, subscription, quota or plan state.
  // ─────────────────────────────────────────────────────────────────────────
  const handleAudit = async () => {
    const inputUrl = url.trim();

    if (!inputUrl) {
      toast({ title: t('common.error'), description: t('audit.invalid_url_message'), variant: 'destructive' });
      return;
    }

    const targetUrl = /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`;

    try {
      const parsedUrl = new URL(targetUrl);
      if (!parsedUrl.hostname.includes('.')) throw new Error('hostname inválido');
    } catch (parseErr) {
      console.warn('⚠️ URL inválida:', targetUrl, parseErr);
      toast({ title: t('audit.invalid_url'), description: t('audit.invalid_url_message'), variant: 'destructive' });
      return;
    }

    if (currentAuditUrl !== targetUrl) clearAuditData();

    setLoading(true);
    setAuditError(null);
    setAuditPhase(t('audit.phase_validating'));
    setCurrentAuditUrl(targetUrl);
    setAnalysisType('url');
    onStateChange?.(true);

    const requestBody = {
      url: targetUrl,
      view_source: true,
    };

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 110_000);

    try {
      setAuditPhase(t('audit.phase_reading'));

      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (!response.ok) {
        let errData: any = null;
        try { errData = await response.json(); } catch { /* non-JSON body */ }
        const apiMsg = errData?.message || errData?.detail || errData?.error || null;
        const codeLabel =
          response.status === 400 ? 'URL inválida ou bloqueada por segurança.' :
          response.status === 422 ? 'Dados da auditoria inválidos.' :
          response.status >= 500 ? `Erro do servidor (${response.status}).` :
          `Erro da API (${response.status}).`;
        throw new Error(apiMsg || codeLabel);
      }

      const data = await response.json();
      if (data.success === false) {
        throw new Error(
          data.errorCode === 'INVALID_URL'
            ? t('audit.invalid_url_message')
            : data.message || t('audit.error_generic')
        );
      }

      const scanId = data.scan_id ?? null;
      setCurrentScanId(scanId);
      setAuditPhase(data.status === 'partial' ? t('audit.phase_partial') : t('audit.phase_completed'));
      setAuditResult(normalizeAuditResult(data));

      const violationCount =
        data.summary?.totalViolations ??
        data.privacy?.totalViolations ??
        data.privacy?.total_violations ??
        0;
      const score = data.score;

      toast({
        title: data.status === 'partial' ? t('audit.partial_results') : t('audit.completed'),
        description: score == null
          ? `${violationCount} ${t('dashboard.privacy_risks')}`
          : `${t('dashboard.compliance_score')}: ${score}% — ${violationCount} ${t('dashboard.privacy_risks')}`,
      });
      setLoading(false);
    } catch (error) {
      window.clearTimeout(timeoutId);

      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      const isNetErr = error instanceof TypeError &&
        (error.message.toLowerCase().includes('fetch') || error.message.toLowerCase().includes('network'));

      const userMessage = isAbort
        ? 'A auditoria excedeu o tempo máximo. Tente novamente; sites com proteção anti-bot podem demorar mais.'
        : isNetErr
          ? 'Erro de rede — não foi possível alcançar o servidor de auditoria.'
          : error instanceof Error
            ? error.message
            : t('audit.error_init');

      console.error('🚨 Falha na auditoria pública:', error);
      setAuditResult(null);
      setAuditError(userMessage);
      setAuditPhase(t('audit.phase_failed'));
      setLoading(false);
      onStateChange?.(false);
      toast({
        title: `❌ ${t('audit.error_title')}`,
        description: userMessage,
        variant: 'destructive',
      });
    }
  };


  const handleFileAnalysis = async (files: any[]) => {
    if (!files || files.length === 0) {
      toast({
        title: t('common.error'),
        description: t('audit.no_files'),
        variant: "destructive"
      });
      return;
    }

    clearAuditData();
    setLoading(true);
    setAnalysisType('file');
    onStateChange?.(true);

    try {
      const fileAnalysisService = FileAnalysisService.getInstance();
      const result = await fileAnalysisService.analyzeFiles(files);

      setFileAnalysisResult(result);
      setCurrentAuditUrl(`${t('home.tab_upload')}: ${files.length} ${t('common.files')}`);

      toast({
        title: t('audit.file_completed'),
        description: `${result.summary.totalScripts} ${t('common.scripts')}, ${result.summary.totalEvents} ${t('common.events')}`
      });

    } catch (error) {
      console.error('❌ File analysis error:', error);
      clearAuditData();
      toast({
        title: t('audit.error_title'),
        description: t('audit.file_error'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNavigationComplete = async (results: any) => {
    clearAuditData();
    setLoading(true);
    setAnalysisType('navigation');
    onStateChange?.(true);

    try {
      setNavigationResult(results);
      setCurrentAuditUrl(`${t('home.tab_deep')}: ${results.pages.length} ${t('common.pages')}`);

      toast({
        title: t('audit.navigation_completed'),
        description: `${results.pages.length} ${t('common.pages')}, ${results.totalEvents} ${t('common.events')}`
      });

    } catch (error) {
      console.error('❌ Navigation error:', error);
      clearAuditData();
      toast({
        title: t('audit.error_title'),
        description: t('audit.navigation_error'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
  };

  return (
    <>
      <AuditForm
        url={url}
        setUrl={handleUrlChange}
        useViewSource={useViewSource}
        setUseViewSource={setUseViewSource}
        loading={loading}
        onAudit={handleAudit}
        onFileAnalysis={handleFileAnalysis}
        onNavigationComplete={handleNavigationComplete}
      />

      {loading && analysisType === 'url' && (
        <Card className="mb-6 border-blue-500/20 bg-blue-950/30 text-white">
          <CardContent className="py-5">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-200/30 border-t-blue-300" />
              <div>
                <p className="font-semibold">{auditPhase || t('audit.phase_reading')}</p>
                <p className="text-sm text-blue-100/70">{t('audit.safe_scan_note')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {auditError && !loading && analysisType === 'url' && !auditResult && (
        <Alert className="mb-6 border-red-500/30 bg-red-950/30 text-red-100">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{auditError}</span>
            <button
              type="button"
              onClick={handleAudit}
              className="rounded-lg bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-100 hover:bg-red-500/30"
            >
              {t('common.retry')}
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Audit Result by URL */}
      {analysisType === 'url' && auditResult && (
        <NewAuditResults result={auditResult} scanId={currentScanId || undefined} />
      )}

      {/* File analysis result */}
      {analysisType === 'file' && fileAnalysisResult && (
        <>
          <div className="mb-4 p-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
            <div className="flex items-center gap-3 text-sm text-white/60">
              <span className="font-bold uppercase tracking-widest text-[10px] text-blue-400">{t('common.analysis')}:</span>
              <span className="font-mono bg-white/5 px-2 py-1 rounded border border-white/5 text-white/80">
                {currentAuditUrl}
              </span>
            </div>
          </div>
          <FileAnalysisResults analysisResult={fileAnalysisResult} />
        </>
      )}

      {/* Navigation Result (Deep Scan) */}
      {analysisType === 'navigation' && navigationResult && (
        <NewAuditResults 
          result={{
            url: url,
            timestamp: new Date().toISOString(),
            tags: navigationResult.allTags || [],
            tagCount: navigationResult.allTags?.length || 0,
            typeCounts: (() => {
              const counts: Record<string, number> = {};
              (navigationResult.allTags || []).forEach((t: any) => {
                const type = t.type || 'custom';
                counts[type] = (counts[type] || 0) + 1;
              });
              return counts;
            })(), 
            duplicates: [],
            loadingOrder: [],
            privacy: {
              violations: navigationResult.violationsFound || [],
              total_violations: navigationResult.violationsFound?.length || 0,
              estimatedRiskExposure: navigationResult.summary?.estimatedFine || "R$ 0",
              has_consent_tool: navigationResult.summary?.consentDetected || false,
              has_universal_analytics: false,
              compliance_score: navigationResult.summary?.complianceScore || 0,
              jurisdiction: 'Unknown',
              framework: 'General Privacy',
              confidenceLevel: 'low',
              consentRisks: [],
              disclosureGaps: [],
              violationsCount: navigationResult.violations?.length || 0,
            } as any,
            score: navigationResult.summary?.complianceScore || 0,
            summary: {
              totalTags: navigationResult.allTags?.length || 0,
              consentDetected: Boolean(navigationResult.consentDetected),
              hasUniversalAnalytics: false,
              violationsCount: navigationResult.violationsFound?.length || 0,
              estimatedFine: navigationResult.summary?.estimatedFine || "R$ 0",
              piiExposureCount: navigationResult.piiExposureCount || 0,
              securityIssuesCount: navigationResult.securityIssuesCount || 0
            },
            pageReports: navigationResult.pageReports || navigationResult.pages,
          }} 
        />
      )}
    </>
  );
};

export default AuditContainer;
