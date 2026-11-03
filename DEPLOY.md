# Deploy

O DataTrust Audit tem duas partes que rodam em lugares diferentes:

| Parte | Onde | Por quê |
|---|---|---|
| **Frontend** (`static/`, React/Vite) | **Vercel** | site estático, CDN, preview por branch |
| **Backend** (`main.py`, FastAPI + Playwright/Chromium) | **contêiner** (Render, Railway, Fly.io ou Cloud Run) | o scanner abre um Chromium real por auditoria (3 contextos, 30 a 120 s). Funções serverless da Vercel não comportam o Chromium do Playwright para Python (limite de tamanho) e derrubariam varreduras longas. |

## 1. Backend (contêiner)

Use o `Dockerfile` da raiz. Sugestão de recursos: 1 vCPU e 2 GB de RAM por varredura simultânea (`DATATRUST_MAX_CONCURRENT_SCANS`).

Variáveis de ambiente (veja `.env.example` e `AUTH_AND_ADMIN.md`):

```
DATABASE_URL=postgresql+psycopg://...          # Supabase/PostgreSQL (SQLite só para dev)
SUPABASE_URL=https://<projeto>.supabase.co
SUPABASE_JWT_SECRET=...                        # nunca em variável VITE_*
ADMIN_BOOTSTRAP_EMAILS=datatrustaudit@gmail.com
GOOGLE_API_KEY=...                             # opcional (assistente em modo LLM)
GEMINI_MODEL=gemini-3.1-flash-lite
DATATRUST_CORS_ORIGINS=https://datatrustaudit.vercel.app,https://seu-dominio.com.br
DATATRUST_TRUST_PROXY=1
DATATRUST_MAX_CONCURRENT_SCANS=2
```

Confira em `https://<backend>/health`.

Segurança: o host precisa bloquear saída para redes privadas/metadados de nuvem (ver *SSRF residual risk* em `ACCURACY_AND_LIMITATIONS.md`).

## 2. Frontend (Vercel)

1. Vercel → **Add New → Project** → importar `agmape/datatrustaudit`.
2. **Root Directory:** `static` (o `static/vercel.json` já define build, saída e rotas do SPA).
3. Variáveis de ambiente (Production e Preview):

```
VITE_API_URL=https://<url-do-backend>          # sem barra no final
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave anon pública>
```

4. Deploy. Depois, adicione a URL da Vercel em `DATATRUST_CORS_ORIGINS` no backend e em *Redirect URLs* no Supabase Auth (`https://<dominio>/auth/callback`).

## Desenvolvimento local

Igual ao `README.md`. Com `VITE_API_URL` vazio, o Vite usa o proxy `/api → :8000`.
