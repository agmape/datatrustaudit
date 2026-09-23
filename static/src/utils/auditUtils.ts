import { AuditResult } from '@/types/audit';

/**
 * Deprecated legacy entry point.
 *
 * Historical implementations mixed browser-side proxy fetching, heuristics
 * and synthetic fallbacks. Production audits must use POST /api/audit.
 */
export const simulateAudit = async (
  _url: string,
  _useViewSource: boolean = false,
): Promise<AuditResult> => {
  throw new Error(
    'Legacy frontend audit is disabled because it cannot guarantee real evidence. Use POST /api/audit.',
  );
};
