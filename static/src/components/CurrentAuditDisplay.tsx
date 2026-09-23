
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Search, Eye } from 'lucide-react';
import { AuditResult } from '@/types/audit';

interface CurrentAuditDisplayProps {
  currentAuditUrl: string;
  useViewSource: boolean;
  auditResult: AuditResult;
}

const CurrentAuditDisplay = ({ currentAuditUrl, useViewSource, auditResult }: CurrentAuditDisplayProps) => {
  if (!auditResult || !currentAuditUrl) {
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
  
  const uaDetected = summary.uaDetected;
  const criticalViolations = summary.criticalViolations;

  return (
    <>
      {/* Current Audit URL Display */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-blue-800">
          <Search className="h-4 w-4" />
          <span className="font-medium">Auditoria atual:</span>
          <span className="font-mono bg-white px-2 py-1 rounded border">
            {currentAuditUrl}
          </span>
        </div>
      </div>

      {/* Analysis Type Indicator */}
      <div className="mb-4 flex gap-4">
        <Badge 
          className={`${useViewSource ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-blue-100 text-blue-800 border-blue-300'} text-sm py-2 px-4`}
        >
          {useViewSource ? (
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Análise com view-source: ativada
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Análise padrão
            </div>
          )}
        </Badge>
        
        {uaDetected && (
          <Badge className="bg-red-100 text-red-800 border-red-300 text-sm py-2 px-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Universal Analytics detectado (obsoleto)
            </div>
          </Badge>
        )}

        {criticalViolations > 0 && (
          <Badge className="bg-red-100 text-red-800 border-red-300 text-sm py-2 px-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {criticalViolations} violações críticas
            </div>
          </Badge>
        )}
      </div>
    </>
  );
};

export default CurrentAuditDisplay;
