"""
DataTrust Audit — canonical evidence-first scanning engine.

Pipeline (the ONLY audit pipeline in this project):

    url_guard (validation + DNS/SSRF)
      -> collector (Playwright phases: baseline / reject / accept, or static fallback)
      -> normalize (raw capture -> redacted Evidence objects)
      -> analyzers (tags, consent, events, pii, gtm, policy)
      -> findings (each finding references evidence ids)
      -> scoring (explicit formulas, coverage, confidence; null when not measurable)
      -> report (API response)

Explanations (RAG) are an *optional* enrichment layer that only reads findings;
it never participates in detection.
"""

ENGINE_VERSION = "3.0.0"
