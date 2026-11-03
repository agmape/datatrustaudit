"""ORM models. Must stay in sync with datatrust/migrations (guarded by tests/test_accounts_db.py)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[Optional[str]] = mapped_column(String)
    role: Mapped[str] = mapped_column(String, nullable=False, default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class Subscription(Base):
    __tablename__ = "subscriptions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    plan: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    source: Mapped[Optional[str]] = mapped_column(String)
    current_period_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    price_cents: Mapped[Optional[int]] = mapped_column(Integer)          # snapshot: config changes never re-price
    currency: Mapped[Optional[str]] = mapped_column(String)
    plan_config_version: Mapped[Optional[int]] = mapped_column(Integer)
    external_id: Mapped[Optional[str]] = mapped_column(String)          # payment gateway id (billing disabled)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class Audit(Base):
    __tablename__ = "audits"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[Optional[str]] = mapped_column(String)
    url: Mapped[str] = mapped_column(String, nullable=False)
    domain: Mapped[Optional[str]] = mapped_column(String)
    mode: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    error_code: Mapped[Optional[str]] = mapped_column(String)
    language: Mapped[Optional[str]] = mapped_column(String)
    engine_version: Mapped[Optional[str]] = mapped_column(String)
    scoring_version: Mapped[Optional[str]] = mapped_column(String)
    plan_at_run: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    runtime_observed: Mapped[Optional[int]] = mapped_column(Integer)
    findings_count: Mapped[Optional[int]] = mapped_column(Integer)
    report_gz_b64: Mapped[Optional[str]] = mapped_column(Text)
    is_test: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class CreditLedger(Base):
    __tablename__ = "credit_ledger"
    __table_args__ = (UniqueConstraint("audit_id", name="uq_credit_audit"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    audit_id: Mapped[str] = mapped_column(String, nullable=False)
    state: Mapped[str] = mapped_column(String, nullable=False)       # reserved | committed | released
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    reason: Mapped[Optional[str]] = mapped_column(String)
    domain: Mapped[Optional[str]] = mapped_column(String)
    plan: Mapped[Optional[str]] = mapped_column(String)
    is_test: Mapped[int] = mapped_column(Integer, nullable=False, default=0)   # admin test-context balance


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_log"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    actor: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    target: Mapped[Optional[str]] = mapped_column(String)
    details: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class PlanConfigVersion(Base):
    __tablename__ = "plan_config_versions"
    __table_args__ = (UniqueConstraint("version", name="uq_plan_config_version"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    config: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String)
    note: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class AdminTestContext(Base):
    __tablename__ = "admin_test_contexts"
    admin_id: Mapped[str] = mapped_column(String, primary_key=True)
    plan: Mapped[str] = mapped_column(String, nullable=False)
    quota_state: Mapped[str] = mapped_column(String, nullable=False, default="available")
    subscription_state: Mapped[str] = mapped_column(String, nullable=False, default="active")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
