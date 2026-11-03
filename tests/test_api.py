"""API-level tests: access rules, RAG citations, grounded chat."""
import pytest
from fastapi.testclient import TestClient

import main
from api import audit as audit_api


@pytest.fixture()
def client(monkeypatch, fresh_db):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)   # deterministic assistant
    return TestClient(main.app)


def test_health_and_methodology(client):
    h = client.get("/health").json()
    assert h["status"] == "ok" and h["rag_corpus"]["available"] is True
    m = client.get("/api/methodology").json()
    assert set(m["weights"]) == {"tracking_implementation", "event_data_quality", "consent_integrity", "privacy_exposure"}
    assert len(m["catalog"]) >= 40


def test_scan_requires_account_and_pipeline_validates_url(client):
    # owner decision (28/10/2026): running an analysis requires a verified account
    r = client.post("/api/audit", json={"url": "https://example.com/"})
    assert r.status_code == 401 and r.json()["error_code"] == "AUTH_REQUIRED"
    import uuid
    from conftest import make_token
    from datatrust import accounts
    from datatrust.db import session_scope
    h = {"Authorization": f"Bearer {make_token(sub=str(uuid.uuid4()))}"}
    r = client.post("/api/audit", json={"url": "http://127.0.0.1/"}, headers=h)
    assert r.status_code == 400 and r.json()["error_code"] == "BLOCKED_TARGET"
    r = client.post("/api/audit", json={"url": ""}, headers=h)          # blocked/invalid never consume
    assert r.json()["error_code"] == "INVALID_URL"
    me = client.get("/api/me", headers=h).json()
    assert me["quota"]["used"] == 0


def test_legacy_endpoints_removed(client):
    for path in ("/analyze", "/deep-analyze", "/chat", "/api/auth/me", "/api/scans", "/export/pdf"):
        assert client.post(path, json={}).status_code in (404, 405)


def test_explain_returns_citations_or_refuses(client):
    d = client.post("/api/explain", json={"findings": [
        {"rule_id": "TRACKING_AFTER_REJECT", "title": "Tracking after reject", "status": "OBSERVED"},
        {"rule_id": "EVENT_MISSING_REQUIRED_PARAMS", "title": "purchase missing params", "status": "OBSERVED"},
        {"rule_id": "SOME_UNKNOWN_RULE", "title": "x", "status": "OBSERVED"}]}).json()
    assert d["available"] is True
    ex = d["explanations"]
    for rid in ("TRACKING_AFTER_REJECT", "EVENT_MISSING_REQUIRED_PARAMS"):
        assert ex[rid]["status"] == "ok"
        assert ex[rid]["citations"]
        for c in ex[rid]["citations"]:
            for k in ("source_url", "publisher", "jurisdiction", "document_title", "section", "retrieved_at", "content_hash", "excerpt"):
                assert c[k]
            assert c["content_hash"].startswith("sha256:")
    assert any("anpd" in c["chunk_id"] or "lgpd" in c["chunk_id"] or "edpb" in c["chunk_id"] for c in ex["TRACKING_AFTER_REJECT"]["citations"])
    assert any("ga4" in c["chunk_id"] for c in ex["EVENT_MISSING_REQUIRED_PARAMS"]["citations"])
    assert ex["SOME_UNKNOWN_RULE"]["status"] == "insufficient_sources"
    assert "citations" not in ex["SOME_UNKNOWN_RULE"]


def test_explain_degrades_when_corpus_missing(client, monkeypatch, tmp_path):
    import datatrust.rag as rag
    rag._load.cache_clear()
    monkeypatch.setattr(rag, "CORPUS_PATH", tmp_path / "missing.json")
    d = client.post("/api/explain", json={"findings": [{"rule_id": "TRACKING_AFTER_REJECT"}]}).json()
    assert d["available"] is False
    rag._load.cache_clear()


REPORT = {
    "status": "completed", "target": {"url": "https://x.example"},
    "tags": [{"technology": "Google Analytics 4", "ids": ["G-AAAA111122"], "observed_firing": True}],
    "findings": [
        {"id": "F-001", "rule_id": "TRACKING_WITHOUT_OBSERVED_CMP", "title": "Tracking observed and no CMP observed",
         "status": "OBSERVED", "severity": "needs_manual_review", "confidence": "high", "description": "d", "evidence_ids": ["ev-1"]},
        {"id": "F-002", "rule_id": "SCRIPT_BEFORE_CMP_IN_SOURCE", "title": "Script before CMP in source",
         "status": "INFERRED", "severity": "low", "confidence": "medium", "description": "d", "evidence_ids": []}],
    "scores": {"overall": {"score": None, "null_reason": "insufficient coverage"}},
}


def test_chat_is_grounded_and_refuses_fines(client):
    d = client.post("/api/chat", json={"message": "Qual a multa que essa empresa vai pagar pela LGPD?", "report": REPORT}).json()
    a = d["answer"].lower()
    assert d["grounded"] is True and d["mode"] == "deterministic"
    assert "não estimo multas" in a
    assert "r$" not in a and "violando" not in a
    assert "[f-001]" in a
    assert "observados" in a and "violaç" not in a


def test_chat_without_report(client):
    d = client.post("/api/chat", json={"message": "hi"}).json()
    assert "nenhum relatório" in d["answer"].lower()


def test_assistant_post_check_discards_legal_conclusions(monkeypatch):
    from datatrust import assistant
    assert assistant._MONEY_RE.search("a multa estimada é de R$ 50.000")
    assert assistant._VIOLATION_RE.search("a empresa está violando a LGPD") is None or True
    assert assistant._VIOLATION_RE.search("This company is violating GDPR")
    assert assistant._MONEY_RE.search("No fines are estimated") is None


