# Deploy no Vercel — DataTrust Audit

Este repositório foi preparado para deploy do **FastAPI + Vite/React** no mesmo projeto Vercel.

## Antes de importar o repositório

1. Use um banco PostgreSQL persistente em produção. **Não use SQLite no Vercel.**
2. Tenha as variáveis de ambiente listadas em `.env.example`.
3. Nunca envie o arquivo `.env` real para o GitHub.

## Configuração recomendada no Vercel

Ao importar o repositório:

- **Root Directory:** `./`
- **Framework:** FastAPI (o `vercel.json` também fixa esse preset)
- **Build Command:** já versionado em `vercel.json`
- **Python:** 3.12, definido no `pyproject.toml`
- **Fluid Compute:** habilitado no `vercel.json`

O build executa:

```bash
cd static && npm ci --include=dev && npm run build
```

O Vite gera `static/dist/`. O FastAPI serve esses arquivos e o Vercel pode promovê-los para CDN.

## Variáveis obrigatórias

No Vercel, abra **Project > Settings > Environment Variables** e configure pelo menos:

```text
ENVIRONMENT=production
SECRET_KEY=<segredo longo e aleatório>
DATABASE_URL=<PostgreSQL persistente>
GOOGLE_API_KEY=<chave Gemini, se usar IA>
SUPABASE_URL=<URL do projeto>
SUPABASE_JWT_SECRET=<JWT secret>
VITE_SUPABASE_URL=<URL do projeto>
VITE_SUPABASE_ANON_KEY=<anon/public key>
FRONTEND_URL=https://SEU-PROJETO.vercel.app
VITE_APP_URL=https://SEU-PROJETO.vercel.app
DEV_ADMIN_MODE=false
VITE_DEV_ADMIN_MODE=false
```

As variáveis `VITE_*` são incorporadas ao bundle do frontend. Portanto, coloque nelas somente valores que podem ser públicos no navegador.

## Banco de dados

O backend usa SQLAlchemy e aceita `DATABASE_URL`. Para produção, use PostgreSQL, por exemplo Supabase Postgres, Neon ou outro provedor compatível.

Exemplo:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

O pacote `psycopg2-binary` já está incluído nas dependências.

## Playwright / scans com navegador

O scanner possui fallback estático quando o Chromium/Playwright não está disponível. O primeiro deploy pode funcionar sem navegador completo, mas scans que dependem de execução real de JavaScript podem precisar de configuração adicional do runtime/worker.

Para produção com scans longos ou Chromium pesado, valide o tempo de execução e o empacotamento do browser no plano Vercel escolhido. Se necessário, mova os scans para um worker/queue dedicado e mantenha a API/web no Vercel.

## Verificação depois do deploy

Teste:

```text
GET /health
GET /
POST /api/audit
```

Também valide autenticação, persistência no PostgreSQL e um scan real antes de apontar o domínio definitivo.
