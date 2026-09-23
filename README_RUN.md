# DataTrust Audit — Local Development Guide

## Quick Start (2 terminals)

### Terminal 1 — Backend
```powershell
cd "d:\FISTPOWER\NOVOS PROJETOS ( Andamento )\DATATRUSTAUDIT\DataTrustAudtiClaudeopus"
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 2 — Frontend
```powershell
cd "d:\FISTPOWER\NOVOS PROJETOS ( Andamento )\DATATRUSTAUDIT\DataTrustAudtiClaudeopus\static"
npm run dev
```

Open: **http://localhost:8080**

---

## Health Check

```
GET http://localhost:8000/health
```

Expected response:
```json
{
  "status": "ok",
  "database": "ok",
  "google_api_key": true,
  "supabase_jwt_secret": true,
  "environment": "development"
}
```

---

## Admin Test Mode

`DEV_ADMIN_MODE=true` is enabled in `.env`. This activates a **development-only** bypass that creates a synthetic admin user. **It is automatically disabled in production (`ENVIRONMENT=production`).**

To use admin test mode, you must set `ADMIN_TEST_PASSWORD` in `.env`.

### Plan Testing (Admin Panel)

When logged in as admin, a floating panel appears in the **bottom-left corner** labeled **"Admin Plan Testing"**. Use it to:

| Mode | Description |
|------|-------------|
| Real Admin | Unlimited scans, 100% visibility, all features |
| Preview Free | 10/week, 30% tag visibility |
| Preview Pro | 50/week, 70% tag visibility, R$ 49,90/mês |
| Preview Premium | 200/week, 100% visibility, R$ 149,90/mês |

---

## Authentication

The system supports two auth flows:

### Option A: Local account (works offline)
Register at `/auth` with any email/password. User is created in SQLite.

### Option B: Supabase (requires VITE_SUPABASE_ANON_KEY)
Set `VITE_SUPABASE_ANON_KEY` in `.env` to your Supabase project's `anon` public key.
Users authenticated via Supabase are auto-created in the local SQLite database on first login.

---

## Plan Limits

| Plan | Scans/Week | Tag Visibility | Price |
|------|-----------|----------------|-------|
| Free | 10 | 30% | R$ 0 |
| Pro | 50 | 70% | R$ 49,90/mês |
| Premium | 200 | 100% | R$ 149,90/mês |
| Admin | Unlimited | 100% + all features | — |

---

## Architecture

```
Backend:  FastAPI (uvicorn) — port 8000
Frontend: Vite/React — port 8080 (proxy → 8000 for /api)
Database: SQLite (db/gtmaudit.db)
Auth:     Local JWT + Supabase JWT (both supported)
Scan:     Playwright Chromium (headless) + static fallback
```

## Known Working State

- ✅ Backend starts without Redis/Celery (Celery is optional)
- ✅ Backend starts without MercadoPago SDK (payments fall back gracefully)
- ✅ Playwright Chromium installed and working
- ✅ Browser fetcher fixed (UnicodeDecodeError on gzip POST bodies — resolved)
- ✅ DEV_ADMIN_MODE bypasses payment for plan testing
- ✅ Admin Panel UI at bottom-left corner (admin users only)
- ✅ Frontend proxies all /api requests to backend

## Troubleshooting

### Port 8000 already in use
```powershell
# Find the process
netstat -ano | findstr :8000
# Kill it (replace PID)
taskkill /F /PID <PID>
```

### Port 8080 already in use  
```powershell
netstat -ano | findstr :8080
taskkill /F /PID <PID>
```

### Missing Python deps
```powershell
pip install -r req.txt
python -m playwright install chromium
```

### Missing npm deps
```powershell
cd static
npm install
```
