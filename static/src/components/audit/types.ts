// Types mirroring the canonical backend report (datatrust/pipeline.py). See EVIDENCE_MODEL.md.
export type FindingStatus = 'OBSERVED' | 'INFERRED' | 'NOT_OBSERVED' | 'UNVERIFIABLE';
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical' | 'needs_manual_review';
export type ScanStatus = 'completed' | 'partial' | 'blocked' | 'timeout' | 'protocol_error' | 'failed';

export interface Evidence {
  id: string;
  source_type: string;
  phase: 'static' | 'baseline' | 'reject' | 'accept';
  page_url: string;
  timestamp: string;
  t_ms?: number;
  confidence: 'high' | 'medium' | 'low';
  vendor_hint?: string;
  request_url?: string;
  request_method?: string;
  resource_type?: string;
  domain?: string;
  third_party?: boolean;
  after_interaction?: boolean;
  html_line?: number;
  snippet?: string;
  script_url?: string;
  cookie_name?: string;
  cookie_domain?: string;
  cookie_attributes?: Record<string, unknown>;
  storage_key?: string;
  datalayer_event?: unknown;
  gtag_call?: unknown[];
  fbq_call?: unknown[];
  cmp_signal?: Record<string, unknown>;
  consent_state?: Record<string, unknown>;
  parsed?: Record<string, any>;
  redaction?: { redacted: boolean; kinds: string[]; fields: string[]; truncated: boolean };
}

export interface LegalContext { text: string; frameworks: string[]; requires_manual_review: boolean }

export interface Localized {
  title: string; found: string; impact_observed: string; impact_possible: string; ask: string; confirm: string;
  owner: 'marketing' | 'agency' | 'development' | 'privacy'; owner_label: string; status_label: string; status_condition: string;
  priority: string; priority_reason: string; copy_request: string; translation_fallback: boolean;
}

export interface Finding {
  id: string;
  rule_id: string;
  title: string;
  description: string;
  category: string;
  kind: 'technical';
  status: FindingStatus;
  severity: Severity;
  confidence: 'high' | 'medium' | 'low';
  evidence_ids: string[];
  pages: string[];
  vendor?: string;
  recommendation?: string;
  how_to_verify?: string;
  limitations?: string[];
  legal_context?: LegalContext;
  data?: Record<string, any>;
  localized?: Localized;
}

export interface Tag {
  vendor_id: string;
  technology: string;
  vendor: string;
  category: string;
  category_label: string;
  ids: string[];
  placeholder_ids_in_source: string[];
  detection_methods: string[];
  confidence: 'high' | 'medium' | 'low';
  observed_firing: boolean | null;
  observed_firing_note: string;
  collection_request_count: number;
  phases: string[];
  pages: string[];
  evidence_ids: string[];
  docs?: string;
}

export interface ScoreCheck { id: string; label: string; applicable: boolean; passed: boolean | null; evidence_ids: string[]; reason: string }
export interface ScoreAxis {
  score: number | null; null_reason?: string; passed: number; applicable: number; defined_checks: number;
  coverage: number; confidence: string | null; checks: ScoreCheck[]; formula: string;
}
export interface Scores {
  version: string;
  overall: { score: number | null; coverage?: number; confidence?: string | null; null_reason?: string; formula?: string; weights?: Record<string, number> };
  axes: Record<string, ScoreAxis>;
}

export interface EventRow {
  name: string; recommended_ga4_event: boolean; sent_to_ga4: boolean; sources: Record<string, number>;
  measurement_ids: string[]; status: FindingStatus; validation_issues: { evidence_id: string; source: string; missing: string[] }[];
  evidence_ids: string[]; pages: string[]; note?: string | null;
  glossary?: { label: string; explanation: string; caveat: string; custom: boolean };
}

export interface Interaction {
  action: string; status: string; method?: string; adapter?: string; selector?: string; clicked_text?: string;
  verified_by?: string[]; cmp_state_after?: Record<string, unknown>; detail?: string;
}

export interface PageReport {
  url: string; reason: string; status: string; mode?: string; http_status?: number; final_url?: string; error?: string;
  phases?: string[]; evidence_count?: number; finding_ids?: string[]; finding_ids_total?: number; limitations?: string[];
}

/** Lists the server trims to the plan's visibility (records beyond the released share are REMOVED, not masked). */
export type VisibilityListKey = 'findings' | 'tags' | 'cookies' | 'storage' | 'policy_links' | 'events' | 'code_candidates'
  | 'network_domains' | 'pii_key_patterns' | 'observed_pii_values' | 'evidence';
export interface VisibilityList { total: number; released: number; hidden: number }
export interface Visibility {
  plan: string; plan_name: string; ratio: number; percent: number; full: boolean;
  lists: Partial<Record<VisibilityListKey, VisibilityList>>;
  total_details: number; released_details: number; hidden_details: number;
  rule?: string; label?: string; scope_note?: string;
}

export interface AuditReport {
  success: boolean;
  scan_id?: string;
  status: ScanStatus;
  error_code?: string;
  message?: string | null;
  detail?: string | null;
  engine_version?: string;
  scoring_version?: string;
  mode?: 'single' | 'deep';
  target?: { input_url: string; url?: string; final_url?: string; http_status?: number; redirect_chain?: string[] };
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  capabilities?: { runtime_js: boolean; network: boolean; cookies: boolean; storage: boolean; static_html: boolean; consent_interaction: Record<string, string> };
  limitations: string[];
  stages?: { name: string; status: string; duration_ms: number; error?: string }[];
  pages: PageReport[];
  crawl?: { selected: { url: string; reason: string }[]; discovered: number; skipped: Record<string, number> } | null;
  tags: Tag[];
  events: { events: EventRow[]; code_candidates: { name: string; pages: string[]; html_lines: number[]; note: string }[] };
  consent?: {
    cmp_observed: boolean | null; cmp_vendors: string[]; banner_visible_in_baseline: boolean | null;
    phases: Record<string, { status: string; interaction?: Interaction }>;
    consent_mode: { observed: boolean | null; default?: Record<string, string> | null; gcs_values?: Record<string, Record<string, number>>; v2_signals?: boolean | null; note?: string } | null;
    baseline_tracking_requests?: number;
  };
  privacy?: { observed_pii_values: { kind: string; source_type: string; count: number; evidence_ids: string[]; domains: string[] }[]; pii_key_patterns: any[]; note?: string; status?: string };
  policy_links?: { url: string; text: string; page: string; evidence_id: string }[];
  cookies: { name: string; domain: string; third_party: boolean; known_tracking_cookie: boolean; observed_in: string[]; attributes: Record<string, any>; evidence_ids: string[]; pages: string[] }[];
  storage: { type: string; key: string; phases: string[]; evidence_ids: string[]; value_length: number; value_pii_kinds: string[] }[];
  network?: { recorded_requests: number; domains: { domain: string; third_party: boolean; requests: number; vendors: string[]; phases: string[]; collection_requests: number }[]; blocked_by_guard: { host: string; reason: string; resource_type: string }[]; note: string };
  findings: Finding[];
  scores: Scores;
  evidence: Evidence[];
  summary?: Record<string, any>;
  disclaimer?: string;
  audit_id?: string;
  language?: string;
  timezone?: string;
  contract_version?: string;
  persisted?: boolean;
  plan?: string;
  quota?: any;
  test_context?: Record<string, unknown> | null;
  visibility?: Visibility;
  i18n?: { untranslated: string[]; fallback: boolean };
}

export interface Citation {
  chunk_id: string; source_url: string; publisher: string; jurisdiction: string; document_title: string;
  version?: string; section: string; retrieved_at: string; content_hash: string; excerpt: string; relevance: number;
}
export interface Explanation {
  status: 'ok' | 'insufficient_sources'; reason?: string; how_to_verify?: string; how_to_fix?: string;
  limitations?: string; citations?: Citation[];
}
