"""
Single source of truth for plans, prices, quotas, visibility and feature entitlements.

The server enforces these rules; the frontend only renders what ``/api/me`` and ``/api/plans``
return. The active configuration is VERSIONED: the defaults below are version 1 and the admin can
publish new versions (``plan_config_versions``). Publishing a version never re-prices existing
subscriptions (they keep a ``price_cents`` / ``plan_config_version`` snapshot).

Commercial direction (owner, 28/10/2026):
  * Free  R$ 0   — 30% of report details, 3 analyses/month, 1 domain, 1 seat, 1 run/day,
                   verified account required. Calendar month in America/Sao_Paulo.
  * Pro   R$ 97  — 70%, 30 analyses/month, 5 domains, 1 seat.
  * Premium R$ 247 — 100%, 150 analyses/month, 30 domains, up to 3 seats when operational.
  * Administrator is an internal ROLE, not a plan for sale: full details, no commercial quota
    (safety limits — concurrency, timeouts — still apply).
Billing is disabled (``billing.enabled = false``): selecting a plan never grants paid features.
"""
from __future__ import annotations

import copy
import json
import math
import threading
from typing import Any, Dict, List, Optional

PLAN_IDS = ("free", "pro", "premium")
ANON = "anonymous"
ADMIN = "admin"          # role-based entitlement (internal), never sold

DEFAULT_CONFIG: Dict[str, Any] = {
    "version": 1,
    "currency": "BRL",
    "billing": {"enabled": False, "cycles_available": ["monthly"], "gateway": None},
    "plans": {
        "free": {"name": "Free", "price_cents": 0, "cycle": "monthly", "visibility": 0.30,
                 "analyses_per_month": 3, "domains_per_period": 1, "seats": 1, "seats_operational": True,
                 "daily_limit": 1, "requires_verified_account": True,
                 "deep_scan": False, "max_deep_pages": 0, "history_limit": 5,
                 "audience": "Conhecer o diagnóstico"},
        "pro": {"name": "Pro", "price_cents": 9700, "cycle": "monthly", "visibility": 0.70,
                "analyses_per_month": 30, "domains_per_period": 5, "seats": 1, "seats_operational": True,
                "daily_limit": None, "requires_verified_account": True,
                "deep_scan": True, "max_deep_pages": 5, "history_limit": 100,
                "audience": "Gestor e profissional independente"},
        "premium": {"name": "Premium", "price_cents": 24700, "cycle": "monthly", "visibility": 1.00,
                    "analyses_per_month": 150, "domains_per_period": 30, "seats": 3, "seats_operational": False,
                    "daily_limit": None, "requires_verified_account": True,
                    "deep_scan": True, "max_deep_pages": 10, "history_limit": 1000,
                    "audience": "Agência e múltiplos clientes"},
    },
}

# Internal role entitlements (not editable as a commercial plan).
ADMIN_ENTITLEMENTS: Dict[str, Any] = {
    "name": "Administrador", "price_cents": None, "cycle": None, "visibility": 1.00,
    "analyses_per_month": None, "domains_per_period": None, "seats": None, "seats_operational": True,
    "daily_limit": None, "requires_verified_account": True,
    "deep_scan": True, "max_deep_pages": 10, "history_limit": 1000, "audience": "Uso interno",
}
ANON_ENTITLEMENTS: Dict[str, Any] = {
    "name": "Visitante", "price_cents": None, "cycle": None, "visibility": 0.0,
    "analyses_per_month": 0, "domains_per_period": 0, "seats": 0, "seats_operational": True,
    "daily_limit": 0, "requires_verified_account": True,
    "deep_scan": False, "max_deep_pages": 0, "history_limit": 0, "audience": "Criar conta grátis para analisar",
}

# What is actually implemented in this release (the rest is shown as "planned", never sold).
FEATURES = [
    {"id": "scan_basic", "implemented": True},
    {"id": "evidence_full", "implemented": True},
    {"id": "report_views", "implemented": True},
    {"id": "export_json_csv", "implemented": True},
    {"id": "history", "implemented": True},
    {"id": "deep_scan", "implemented": True},
    {"id": "visibility_by_plan", "implemented": True},
    {"id": "export_xlsx_pdf", "implemented": False},
    {"id": "gtm_import", "implemented": False},
    {"id": "comparison", "implemented": False},
    {"id": "integrations", "implemented": False},
    {"id": "team_seats", "implemented": False},
    {"id": "billing", "implemented": False},
]

EDITABLE_FIELDS = {
    "name": str, "price_cents": int, "visibility": float, "analyses_per_month": int,
    "domains_per_period": int, "seats": int, "daily_limit": (int, type(None)),
    "deep_scan": bool, "max_deep_pages": int, "history_limit": int,
}

_lock = threading.Lock()
_active: Dict[str, Any] = copy.deepcopy(DEFAULT_CONFIG)


# ── active configuration ────────────────────────────────────────────────────
def active_config() -> Dict[str, Any]:
    with _lock:
        return copy.deepcopy(_active)


def set_active_config(cfg: Dict[str, Any]) -> None:
    global _active
    with _lock:
        _active = copy.deepcopy(cfg)


def active_version() -> int:
    with _lock:
        return int(_active.get("version", 1))


def validate_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Validate an edited configuration. Raises ValueError with a readable message."""
    out = copy.deepcopy(DEFAULT_CONFIG)
    out["version"] = int(cfg.get("version", 1))
    plans = cfg.get("plans") or {}
    for pid in PLAN_IDS:
        src = plans.get(pid) or {}
        dst = out["plans"][pid]
        for k, typ in EDITABLE_FIELDS.items():
            if k not in src:
                continue
            v = src[k]
            if typ is float:
                if not isinstance(v, (int, float)) or isinstance(v, bool):
                    raise ValueError(f"{pid}.{k}: número inválido")
                v = float(v)
                if not 0.0 < v <= 1.0:
                    raise ValueError(f"{pid}.{k}: deve estar entre 0 e 1 (ex.: 0.30)")
            elif typ is int:
                if not isinstance(v, int) or isinstance(v, bool) or v < 0:
                    raise ValueError(f"{pid}.{k}: inteiro >= 0")
            elif typ is bool:
                if not isinstance(v, bool):
                    raise ValueError(f"{pid}.{k}: verdadeiro/falso")
            elif typ is str:
                if not isinstance(v, str) or not v.strip() or len(v) > 40:
                    raise ValueError(f"{pid}.{k}: texto de 1 a 40 caracteres")
                v = v.strip()
            else:  # optional int
                if v is not None and (not isinstance(v, int) or isinstance(v, bool) or v < 1):
                    raise ValueError(f"{pid}.{k}: vazio ou inteiro >= 1")
            dst[k] = v
        if dst["domains_per_period"] < 1:
            raise ValueError(f"{pid}.domains_per_period: mínimo 1")
        if dst["max_deep_pages"] > 10:
            raise ValueError(f"{pid}.max_deep_pages: máximo 10 (limite de segurança)")
    if out["plans"]["free"]["price_cents"] != 0:
        raise ValueError("free.price_cents: o Free é sempre R$ 0")
    # visibility must stay nested: Free <= Pro <= Premium
    v = [out["plans"][p]["visibility"] for p in PLAN_IDS]
    if not (v[0] <= v[1] <= v[2]):
        raise ValueError("visibilidade deve ser crescente: Free <= Pro <= Premium")
    out["billing"]["enabled"] = False      # cannot be enabled from here: no gateway configured
    return out


def config_json(cfg: Dict[str, Any]) -> str:
    return json.dumps(cfg, ensure_ascii=False, sort_keys=True)


# ── entitlements ────────────────────────────────────────────────────────────
def plan_entry(pid: str) -> Dict[str, Any]:
    if pid == ADMIN:
        return dict(ADMIN_ENTITLEMENTS)
    if pid == ANON:
        return dict(ANON_ENTITLEMENTS)
    cfg = active_config()
    return dict(cfg["plans"].get(pid) or cfg["plans"]["free"])


def entitlements(pid: str) -> Dict[str, Any]:
    e = plan_entry(pid)
    pid = pid if pid in PLAN_IDS or pid in (ADMIN, ANON) else "free"
    return {
        "plan": pid, "plan_name": e["name"], "price_cents": e["price_cents"],
        "currency": DEFAULT_CONFIG["currency"], "cycle": e["cycle"],
        "visibility": e["visibility"], "visibility_percent": int(round(e["visibility"] * 100)),
        "analyses_per_month": e["analyses_per_month"], "domains_per_period": e["domains_per_period"],
        "daily_limit": e["daily_limit"], "seats": e["seats"], "seats_operational": e["seats_operational"],
        "requires_verified_account": e["requires_verified_account"],
        "deep_scan": e["deep_scan"], "max_deep_pages": e["max_deep_pages"], "history_limit": e["history_limit"],
        "audience": e.get("audience"), "config_version": active_version(),
        # planned features: never granted until implemented
        "gtm_import": False, "exports_full": False, "integrations": False, "comparison": False,
    }


def plan_by_id(pid: str) -> Dict[str, Any]:
    return entitlements(pid)


def released_count(n: int, ratio: float) -> int:
    """min(N, max(1, floor(N*p))) for N > 0; 0 for N = 0 (never fabricates)."""
    if n <= 0:
        return 0
    if ratio >= 1.0:
        return n
    return min(n, max(1, math.floor(n * ratio + 1e-9)))


def plan_matrix() -> Dict[str, Any]:
    cfg = active_config()
    return {
        "config_version": cfg.get("version", 1), "currency": cfg["currency"],
        "billing": {"enabled": False, "cycles_available": ["monthly"],
                    "note": "Pagamento desativado: escolher um plano registra interesse e não concede recursos pagos."},
        "plans": [entitlements(pid) for pid in PLAN_IDS],
        "features": FEATURES,
        "analysis_definition": ("Uma análise é uma execução nova para uma URL e um perfil de teste. Reabrir o relatório, "
                                "trocar idioma, alternar a visão, recolher seções ou exportar novamente não consome análise. "
                                "Repetir a varredura consome uma nova análise."),
        "visibility_rule": ("Para N registros e percentual p, são liberados min(N, max(1, floor(N×p))) detalhes; com N = 0, "
                            "zero. Em listas pequenas o arredondamento e a amostra mínima fazem o percentual real diferir do nominal."),
        "note": "Funcionalidades com implemented=false ainda não existem e não são vendidas.",
    }


def admin_matrix_row() -> Dict[str, Any]:
    return entitlements(ADMIN)


def list_plan_ids() -> List[str]:
    return list(PLAN_IDS)


def price_label(cents: Optional[int]) -> Optional[str]:
    if cents is None:
        return None
    return f"R$ {cents // 100:,}".replace(",", ".") + (f",{cents % 100:02d}" if cents % 100 else "")
