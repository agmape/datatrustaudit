# DataTrust Audit

Plataforma de auditoria técnica para Google Tag Manager, analytics e conformidade LGPD, com backend FastAPI e frontend Vite/React.

## Stack

- **Backend:** FastAPI + SQLAlchemy
- **Frontend:** React + TypeScript + Vite
- **Auth:** Supabase + JWT local
- **IA:** Google Gemini (opcional)
- **Scanner:** Playwright com fallback estático
- **Banco local:** SQLite apenas para desenvolvimento
- **Banco de produção:** PostgreSQL via `DATABASE_URL`

## Desenvolvimento local

### 1. Ambiente

```bash
cp .env.example .env
```

Preencha os valores necessários. O `.env` real é ignorado pelo Git e nunca deve ser commitado.

### 2. Backend

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
uvicorn main:app --reload --port 8000
```

### 3. Frontend

Em outro terminal:

```bash
cd static
npm ci
npm run dev
```

Abra `http://localhost:8080`.

O Vite usa `envDir: '..'`, então as variáveis `VITE_*` ficam no `.env` da raiz do projeto.

## Build de produção

```bash
cd static
npm ci --include=dev
npm run build
```

O resultado fica em `static/dist/` e não é commitado.

## Deploy no Vercel

O repositório inclui:

- `app.py` como entrypoint explícito do FastAPI;
- `pyproject.toml` com Python 3.12;
- `requirements.txt` com dependências de produção;
- `vercel.json` com build do frontend e Fluid Compute;
- `.vercelignore` e `.gitignore` para impedir upload de segredos, logs e banco local.

Veja **[DEPLOY_VERCEL.md](DEPLOY_VERCEL.md)** antes de importar o repositório no Vercel.

> **Importante:** não use SQLite como banco persistente no Vercel. Configure `DATABASE_URL` apontando para PostgreSQL.

## Health check

```text
GET /health
```

## Segurança de configuração

- Nunca comite `.env`.
- Nunca exponha `SUPABASE_JWT_SECRET`, `SECRET_KEY`, tokens de pagamento ou chaves privadas no frontend.
- Variáveis `VITE_*` ficam visíveis no navegador após o build.
- Mantenha `DEV_ADMIN_MODE=false` e `VITE_DEV_ADMIN_MODE=false` em produção.

## Estrutura principal

```text
.
├── app.py
├── main.py
├── api/
├── audit_engine/
├── db/
├── worker/
├── static/
│   ├── src/
│   ├── public/
│   └── package.json
├── requirements.txt
├── pyproject.toml
├── vercel.json
└── .env.example
```
