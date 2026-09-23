
import { AuditResult } from '@/types/audit';
import SummaryCards from '@/components/SummaryCards';
import ViolationSeveritySection from '@/components/ViolationSeveritySection';
import DetailedEmbedCodesTable from '@/components/DetailedEmbedCodesTable';
import DetailedEventsTable from '@/components/DetailedEventsTable';
import UniversalAnalyticsAlert from '@/components/UniversalAnalyticsAlert';
import ImprovementsSection from '@/components/ImprovementsSection';
import ExportButtons from '@/components/ExportButtons';

interface AuditResultsDisplayProps {
  auditResult: AuditResult;
  currentAuditUrl: string;
  url: string;
}

const AuditResultsDisplay = ({ auditResult, currentAuditUrl, url }: AuditResultsDisplayProps) => {
  if (!auditResult) {
    return null;
  }

  const summary = auditResult.summary || {
    totalCodes: 0,
    codesBeforeGTM: 0,
    codesAfterGTM: 0,
    totalEvents: 0,
    uaDetected: false,
    criticalViolations: 0,
    highViolations: 0,
    mediumViolations: 0
  };
  
  const embedCodes = Array.isArray(auditResult.embedCodes) ? auditResult.embedCodes : [];
  const events = Array.isArray(auditResult.events) ? auditResult.events : [];
  const universalAnalytics = Array.isArray(auditResult.universalAnalytics) ? auditResult.universalAnalytics : [];
  const violationRisks = Array.isArray(auditResult.violationRisks) ? auditResult.violationRisks : [];
  const legalSummary = auditResult.legalSummary;
  const improvements = Array.isArray(auditResult.improvements) ? auditResult.improvements : [];
  const gtmPosition = auditResult.gtmPosition || 1;

  return (
    <>
      <SummaryCards summary={summary} />
      
      {legalSummary && (
        <ViolationSeveritySection 
          violationRisks={violationRisks}
          legalSummary={legalSummary}
        />
      )}
      
      <DetailedEmbedCodesTable 
        embedCodes={embedCodes}
        gtmPosition={gtmPosition}
        useViewSource={false}
      />
      
      <DetailedEventsTable events={events} />
      
      <UniversalAnalyticsAlert universalAnalytics={universalAnalytics} />
      
      <ImprovementsSection improvements={improvements} />

      <ExportButtons 
        auditResult={auditResult}
        currentAuditUrl={currentAuditUrl}
        url={url}
      />
    </>
  );
};

export default AuditResultsDisplay;
