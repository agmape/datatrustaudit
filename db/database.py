import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import inspect, text
from dotenv import load_dotenv

load_dotenv()

# Database storage.
# Vercel's deployed function bundle is read-only. When DATABASE_URL is not yet
# configured, use /tmp as an ephemeral emergency fallback so the API can boot.
# Production persistence should always use a PostgreSQL DATABASE_URL.
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IS_VERCEL = bool(os.getenv("VERCEL"))

if IS_VERCEL:
    DB_FILE = "/tmp/gtmaudit.db"
else:
    DB_DIR = os.path.join(BASE_DIR, "db")
    os.makedirs(DB_DIR, exist_ok=True)
    DB_FILE = os.path.join(DB_DIR, "gtmaudit.db")

_DATABASE_URL_FROM_ENV = os.getenv("DATABASE_URL")
DATABASE_URL = _DATABASE_URL_FROM_ENV or f"sqlite:///{DB_FILE}"
IS_EPHEMERAL_SERVERLESS_DB = bool(IS_VERCEL and not _DATABASE_URL_FROM_ENV)
PERSISTENT_DATABASE_CONFIGURED = bool(
    (not IS_VERCEL) or (_DATABASE_URL_FROM_ENV and not _DATABASE_URL_FROM_ENV.startswith("sqlite"))
)

if IS_EPHEMERAL_SERVERLESS_DB:
    print("[WARN] DATABASE_URL not configured on Vercel; /tmp SQLite is ephemeral and must not be used for production entitlements/history.")

# Create SQLAlchemy engine — SQLite needs check_same_thread=False
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

# Dependency for FastAPI routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def sync_sqlite_schema():
    """Apply safe additive schema fixes for local SQLite databases."""
    if not DATABASE_URL.startswith("sqlite"):
        return

    inspector = inspect(engine)
    tables = inspector.get_table_names()

    if "users" not in tables:
        return

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    statements = []

    if "phone" not in user_columns:
        statements.append("ALTER TABLE users ADD COLUMN phone VARCHAR")
    if "is_admin" not in user_columns:
        statements.append("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0")
    if "subscription_status" not in user_columns:
        statements.append("ALTER TABLE users ADD COLUMN subscription_status VARCHAR DEFAULT 'inactive'")
    if "updated_at" not in user_columns:
        statements.append("ALTER TABLE users ADD COLUMN updated_at DATETIME")
    if "name" not in user_columns:
        statements.append("ALTER TABLE users ADD COLUMN name VARCHAR")

    # Scans table
    if "scans" in tables:
        scan_columns = {column["name"] for column in inspector.get_columns("scans")}
        if "scan_credit_consumed" not in scan_columns:
            statements.append("ALTER TABLE scans ADD COLUMN scan_credit_consumed BOOLEAN DEFAULT 0")

    # Subscriptions table
    if "subscriptions" in tables:
        sub_columns = {column["name"] for column in inspector.get_columns("subscriptions")}
        if "weekly_scan_count" not in sub_columns:
            statements.append("ALTER TABLE subscriptions ADD COLUMN weekly_scan_count INTEGER DEFAULT 0")
        if "weekly_scan_reset_at" not in sub_columns:
            statements.append("ALTER TABLE subscriptions ADD COLUMN weekly_scan_reset_at DATETIME")

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            try:
                conn.execute(text(statement))
            except Exception:
                pass  # Column may already exist

