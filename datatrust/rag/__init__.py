"""
RAG explanation layer.

* It NEVER participates in detection. It only receives findings already
  produced by the deterministic pipeline.
* Retrieval is lexical (BM25) over a small, versioned corpus of OFFICIAL
  sources (datatrust/rag/corpus.json, built by scripts/build_rag_corpus.py).
* Every explanation returns citations (source_url, publisher, section,
  retrieved_at, content_hash, verbatim excerpt). When no source passes the
  relevance threshold, no explanation is produced ("insufficient_sources").
* If the corpus is missing, the API answers {available: false}; the audit is
  unaffected.
"""
from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

CORPUS_PATH = Path(__file__).resolve().parent / "corpus.json"
MIN_SCORE = 2.5

_STOP = set("""a o e de da do das dos em no na nos nas um uma para por com sem que se ao aos as os ou the of and to in
for on is are be by with as or an at it this that from not which may can its their than""".split())


def _tok(text: str) -> List[str]:
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return [w for w in re.findall(r"[a-z0-9_]{2,}", t) if w not in _STOP]


class BM25:
    def __init__(self, docs: List[Dict[str, Any]], k1: float = 1.4, b: float = 0.75):
        self.docs = docs
        self.k1, self.b = k1, b
        self.toks = [_tok(d["document_title"] + " " + d["section"] + " " + d["text"]) for d in docs]
        self.tf = [Counter(t) for t in self.toks]
        self.len = [len(t) for t in self.toks]
        self.avg = (sum(self.len) / len(self.len)) if self.len else 1.0
        df = Counter()
        for t in self.toks:
            df.update(set(t))
        n = len(docs)
        self.idf = {w: math.log(1 + (n - c + 0.5) / (c + 0.5)) for w, c in df.items()}

    def search(self, query: str, k: int = 3, filt=None) -> List[tuple]:
        q = _tok(query)
        out = []
        for i, d in enumerate(self.docs):
            if filt and not filt(d):
                continue
            s = 0.0
            for w in q:
                f = self.tf[i].get(w)
                if not f:
                    continue
                s += self.idf.get(w, 0) * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * self.len[i] / self.avg))
            if s > 0:
                out.append((s, d))
        out.sort(key=lambda x: -x[0])
        return out[:k]


@lru_cache(maxsize=1)
def _load():
    data = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    return data, BM25(data["chunks"])


# rule -> (queries, preferred doc ids, guidance)
# Guidance texts are product methodology (how to verify / fix), shown ONLY together with citations.
RULES: Dict[str, Dict[str, Any]] = {
    "TRACKING_BEFORE_CONSENT_INTERACTION": {
        "queries": ["consentimento cookies coleta antes consentimento titular livre informado inequívoco",
                    "consent mode default denied before tags fire",
                    "storing of information or gaining access to information stored in terminal equipment consent"],
        "docs": ["anpd_cookies", "lgpd", "eprivacy", "edpb_consent", "google_consent_setup"],
        "verify": "Abra o site em janela anônima, não interaja com o banner e filtre a aba Network pelos endpoints listados nas evidências.",
        "fix": "Configure o CMP/GTM para bloquear tags não essenciais até o consentimento (gatilhos de consentimento, Consent Mode com default 'denied')."},
    "TRACKING_AFTER_REJECT": {
        "queries": ["revogação consentimento recusa cookies não necessários", "withdraw consent as easy as to give",
                    "consent mode update denied"],
        "docs": ["anpd_cookies", "lgpd", "edpb_consent", "gdpr", "google_consent_setup"],
        "verify": "Clique em 'Rejeitar todos' numa sessão limpa e verifique se as requisições listadas continuam a ocorrer.",
        "fix": "Garanta que a recusa atualize o estado de consentimento e que as tags respeitem esse estado."},
    "TRACKING_COOKIES_SET_AFTER_REJECT": {
        "queries": ["cookies não necessários consentimento recusa", "storing information terminal equipment consent cookies"],
        "docs": ["anpd_cookies", "eprivacy", "edpb_art53"],
        "verify": "Após rejeitar, inspecione Application > Cookies e compare com a lista antes do clique.",
        "fix": "Impeça que scripts de terceiros gravem cookies quando o consentimento for recusado."},
    "TRACKING_WITHOUT_OBSERVED_CMP": {
        "queries": ["hipóteses de tratamento bases legais consentimento legítimo interesse", "cookies bases legais guia",
                    "lawfulness of processing consent legitimate interests"],
        "docs": ["lgpd", "anpd_cookies", "gdpr"],
        "verify": "Confirme com o controlador qual base legal sustenta cada finalidade de rastreamento e se há banner em outras regiões.",
        "fix": "Documente a base legal por finalidade; se for consentimento, implemente um mecanismo de gestão de consentimento."},
    "CMP_NOT_OBSERVED": {
        "queries": ["banner de cookies gestão consentimento informação clara", "cookie banner consent management"],
        "docs": ["anpd_cookies", "edpb_consent"],
        "verify": "Verifique o site a partir da região dos seus usuários e em navegação anônima.",
        "fix": "Avalie a necessidade de um CMP conforme as bases legais adotadas."},
    "CONSENT_MODE_DEFAULT_AFTER_TAG": {
        "queries": ["consent default command before any tag fires order", "set default consent state before measurement"],
        "docs": ["google_consent_setup", "google_consent_mode"],
        "verify": "No DevTools, rode `dataLayer` e confirme que o comando consent/default aparece antes de config/event.",
        "fix": "Mova gtag('consent','default',…) para antes do snippet do Google tag/GTM."},
    "CONSENT_MODE_V2_SIGNALS_MISSING": {
        "queries": ["ad_user_data ad_personalization consent mode parameters"],
        "docs": ["google_consent_mode", "google_consent_setup"],
        "verify": "Inspecione o comando consent default no dataLayer.",
        "fix": "Inclua ad_user_data e ad_personalization nos comandos default/update."},
    "CONSENT_MODE_NOT_OBSERVED": {
        "queries": ["consent mode overview how consent mode works tags behavior"],
        "docs": ["google_consent_mode", "google_consent_setup"],
        "verify": "Procure por gtag('consent', …) no dataLayer e pelo parâmetro gcs nas requisições /g/collect.",
        "fix": "Se usar tags Google com consentimento, implemente o Consent Mode via CMP ou GTM."},
    "CONSENT_MODE_DENIED_PINGS": {
        "queries": ["advanced consent mode cookieless pings denied", "basic vs advanced consent mode"],
        "docs": ["google_consent_mode"],
        "verify": "Verifique o parâmetro gcs=G100 nas requisições GA4 antes do consentimento.",
        "fix": "Decida entre modo básico e avançado com base na análise jurídica aplicável."},
    "CONSENT_MODE_GRANTED_AFTER_REJECT": {
        "queries": ["consent update denied analytics_storage ad_storage", "consent mode update command"],
        "docs": ["google_consent_setup", "google_consent_mode"],
        "verify": "Após rejeitar, confira o valor de gcs nas requisições GA4.",
        "fix": "Envie gtag('consent','update', {...: 'denied'}) quando o usuário recusar."},
    "EVENT_MISSING_REQUIRED_PARAMS": {
        "queries": ["purchase transaction_id currency value items required parameters", "recommended events parameters required"],
        "docs": ["ga4_events_ref", "ga4_ecommerce"],
        "verify": "Use o DebugView do GA4 e confira os parâmetros do evento citado.",
        "fix": "Envie os parâmetros obrigatórios conforme a referência oficial do evento."},
    "GA4_DUPLICATE_PURCHASE": {
        "queries": ["transaction_id duplicate purchases deduplicate"],
        "docs": ["ga4_events_ref", "ga4_ecommerce"],
        "verify": "Recarregue a página de confirmação e veja se um novo purchase é enviado.",
        "fix": "Dispare purchase uma única vez por transaction_id."},
    "GA4_DUPLICATE_PAGE_VIEW": {
        "queries": ["page_view event automatically sent google tag config duplicate measurement"],
        "docs": ["ga4_events_ref", "gtm_install"],
        "verify": "Filtre /g/collect com en=page_view e conte por carregamento.",
        "fix": "Remova instalações duplicadas do Google tag ou o page_view manual redundante."},
    "GTM_CONTAINER_LOADED_MULTIPLE_TIMES": {
        "queries": ["install google tag manager container snippet once head body"],
        "docs": ["gtm_install", "gtm_datalayer"],
        "verify": "Conte elementos <script src*='gtm.js?id='> no DOM.",
        "fix": "Mantenha um único snippet por contêiner."},
    "DATALAYER_REASSIGNED_AFTER_GTM": {
        "queries": ["window.dataLayer = window.dataLayer || [] do not overwrite data layer"],
        "docs": ["gtm_datalayer"],
        "verify": "Procure `dataLayer = [` após o snippet do GTM.",
        "fix": "Use `window.dataLayer = window.dataLayer || [];`."},
    "UNIVERSAL_ANALYTICS_LEGACY": {
        "queries": ["universal analytics stopped processing data replaced google analytics 4"],
        "docs": ["ua_sunset"],
        "verify": "Procure analytics.js ou ga('create').", "fix": "Remova o código do Universal Analytics."},
    "PII_VALUE_SENT_TO_THIRD_PARTY": {
        "queries": ["do not send personally identifiable information pii google analytics email",
                    "compartilhamento uso compartilhado de dados pessoais terceiros", "transferência internacional de dados"],
        "docs": ["ga_pii", "lgpd", "gdpr"],
        "verify": "Inspecione as requisições citadas (valores redigidos no relatório) reproduzindo o fluxo.",
        "fix": "Remova dados pessoais de URLs/payloads enviados a ferramentas de analytics/ads."},
    "PII_VALUE_IN_DATALAYER": {
        "queries": ["pii data layer avoid sending personally identifiable information", "dados pessoais segurança"],
        "docs": ["ga_pii", "gtm_datalayer", "lgpd"],
        "verify": "Inspecione `dataLayer` no console.", "fix": "Não envie dados pessoais em claro ao dataLayer."},
    "PII_VALUE_IN_BROWSER_STORAGE": {
        "queries": ["segurança dos dados pessoais medidas técnicas", "security of processing appropriate technical measures"],
        "docs": ["lgpd", "gdpr"],
        "verify": "Inspecione localStorage/sessionStorage/cookies.", "fix": "Evite armazenar dados pessoais em claro no navegador."},
    "HASHED_IDENTIFIER_SENT": {
        "queries": ["advanced matching hashed customer information", "dado pseudonimizado"],
        "docs": ["meta_advanced_matching", "lgpd"],
        "verify": "Verifique parâmetros ud[...] nas requisições do pixel.",
        "fix": "Use correspondência avançada apenas com base legal adequada."},
    "PII_KEY_PATTERN": {
        "queries": ["avoid sending personally identifiable information parameter names"],
        "docs": ["ga_pii"],
        "verify": "Reproduza o fluxo e verifique os valores reais dessas chaves.",
        "fix": "Garanta que essas chaves não carreguem dados pessoais em claro."},
    "POLICY_LINK_NOT_OBSERVED": {
        "queries": ["informações claras adequadas ostensivas sobre o tratamento direito de acesso", "política de cookies transparência"],
        "docs": ["lgpd", "anpd_cookies"],
        "verify": "Procure o link no rodapé/menus.", "fix": "Disponibilize link visível para a política de privacidade/cookies."},
}


def _citation(d: Dict[str, Any], score: float) -> Dict[str, Any]:
    excerpt = d["text"][:420] + ("…" if len(d["text"]) > 420 else "")
    return {"chunk_id": d["chunk_id"], "source_url": d["source_url"], "publisher": d["publisher"],
            "jurisdiction": d["jurisdiction"], "document_title": d["document_title"], "version": d.get("version"),
            "section": d["section"], "retrieved_at": d["retrieved_at"], "content_hash": d["content_hash"],
            "excerpt": excerpt, "relevance": round(score, 2)}


def explain_findings(findings: List[Dict[str, Any]], language: str = "pt-BR") -> Dict[str, Any]:
    try:
        data, index = _load()
    except FileNotFoundError:
        return {"available": False, "reason": "RAG corpus not built (run scripts/build_rag_corpus.py).", "explanations": {}}
    out: Dict[str, Any] = {}
    for f in findings:
        rid = f.get("rule_id")
        if not rid or rid in out:
            continue
        spec = RULES.get(rid)
        if not spec:
            out[rid] = {"status": "insufficient_sources", "reason": "No curated retrieval mapping for this rule."}
            continue
        allowed = set(spec["docs"])
        seen, cites = set(), []
        for q in spec["queries"] + [f.get("title") or ""]:
            for score, d in index.search(q, k=3, filt=lambda d: d["doc_id"] in allowed):
                if score < MIN_SCORE or d["chunk_id"] in seen:
                    continue
                seen.add(d["chunk_id"])
                cites.append(_citation(d, score))
        cites.sort(key=lambda c: -c["relevance"])
        cites = cites[:4]
        if not cites:
            out[rid] = {"status": "insufficient_sources",
                        "reason": "No official source in the corpus passed the relevance threshold; no explanation is generated."}
            continue
        out[rid] = {
            "status": "ok",
            "finding_status": f.get("status"),
            "how_to_verify": spec["verify"],
            "how_to_fix": spec["fix"],
            "limitations": ("This explanation is general documentation context retrieved from official sources. "
                            "It is not a legal conclusion about the site."),
            "citations": cites,
        }
    return {"available": True, "corpus_built_at": data.get("built_at"),
            "failed_sources": data.get("failed_sources", []), "explanations": out}


def retrieve(query: str, k: int = 4) -> List[Dict[str, Any]]:
    """Generic retrieval (used by the grounded assistant)."""
    try:
        _data, index = _load()
    except FileNotFoundError:
        return []
    return [_citation(d, s) for s, d in index.search(query, k=k) if s >= MIN_SCORE]
