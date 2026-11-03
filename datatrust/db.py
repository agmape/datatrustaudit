"""
Database access: engine/session factory and a tiny versioned migration runner.

* Development: SQLite (default ``sqlite:///var/datatrust.db``).
* Production: PostgreSQL (Supabase). Install a driver (``psycopg[binary]``) and set DATABASE_URL.
  A privileged connection bypasses Supabase RLS, so every route performs explicit ownership checks
  (see api/audits.py); the SQL migrations also enable RLS-friendly structure (user_id columns).

Migrations are plain SQL files in ``datatrust/migrations`` named ``NNNN_name.sql`` and applied once,
in order, recorded in ``schema_migrations``.
"""
from __future__ import annotations

import logging
import os
import re
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

log = logging.getLogger("datatrust.db")
MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
BASE_DIR = Path(__file__).resolve().parent.parent

_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker] = None


def database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        url = "sqlite:///var/datatrust.db"
    return url


def _prepare_sqlite_path(url: str) -> str:
    m = re.match(r"^sqlite:///(?!/)(.+)$", url)
    if m and m.group(1) != ":memory:":
        p = Path(m.group(1))
        if not p.is_absolute():
            p = BASE_DIR / p
        p.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{p.as_posix()}"
    return url


def make_engine(url: Optional[str] = None) -> Engine:
    url = _prepare_sqlite_path(url or database_url())
    kwargs = {"future": True, "pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
        if ":memory:" in url or url.endswith("sqlite://"):
            from sqlalchemy.pool import StaticPool
            kwargs["poolclass"] = StaticPool
    eng = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(eng, "connect")
        def _pragma(dbapi_conn, _rec):  # pragma: no cover - trivial
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    return eng


def get_engine() -> Engine:
    global _engine, _SessionLocal
    if _engine is None:
        _engine = make_engine()
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False, future=True)
    return _engine


def configure_engine(engine: Engine) -> None:
    """Replace the global engine (used by tests)."""
    global _engine, _SessionLocal
    _engine = engine
    _SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


@contextmanager
def session_scope() -> Iterator[Session]:
    get_engine()
    assert _SessionLocal is not None
    s = _SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    get_engine()
    assert _SessionLocal is not None
    s = _SessionLocal()
    try:
        yield s
    finally:
        s.close()


def _split_sql(sql: str):
    # strip comments, split on ';' (our migrations contain no procedural bodies)
    sql = re.sub(r"--[^\n]*", "", sql)
    return [stmt.strip() for stmt in sql.split(";") if stmt.strip()]


def run_migrations(engine: Optional[Engine] = None) -> list:
    """Apply pending migrations. Returns the list of versions applied now."""
    eng = engine or get_engine()
    applied_now = []
    with eng.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS schema_migrations "
                          "(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"))
        done = {r[0] for r in conn.execute(text("SELECT version FROM schema_migrations"))}
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        version = path.stem
        if version in done:
            continue
        stmts = _split_sql(path.read_text(encoding="utf-8"))
        with eng.begin() as conn:
            for stmt in stmts:
                conn.exec_driver_sql(stmt)
            conn.execute(text("INSERT INTO schema_migrations (version, applied_at) VALUES (:v, :t)"),
                         {"v": version, "t": datetime.now(timezone.utc).isoformat()})
        applied_now.append(version)
        log.info("migration applied: %s", version)
    return applied_now


def check_database() -> dict:
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
            versions = [r[0] for r in conn.execute(text("SELECT version FROM schema_migrations ORDER BY version"))]
        return {"ok": True, "dialect": get_engine().dialect.name, "migrations": versions}
    except Exception as exc:
        return {"ok": False, "error": exc.__class__.__name__}
