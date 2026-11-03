# Backend do DataTrust Audit (FastAPI + Playwright/Chromium).
# Roda em qualquer host de contêiner: Render, Railway, Fly.io, Google Cloud Run.
# O frontend (static/) é publicado separadamente na Vercel.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=8000

WORKDIR /app

COPY req.txt .
RUN pip install --no-cache-dir -r req.txt "psycopg[binary]" \
 && python -m playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

COPY main.py ./
COPY api ./api
COPY datatrust ./datatrust
COPY scripts ./scripts

# usuário sem privilégios para o navegador headless
RUN useradd --create-home app && mkdir -p /app/var && chown -R app /app /ms-playwright
USER app

EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
