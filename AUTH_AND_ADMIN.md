# Authentication, sessions and administration

## How it works

* **Identity**: Supabase Auth (e-mail/password). The browser holds the session; only the *public* anon/publishable key is exposed (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). No secret may use a `VITE_*` variable.
* **Every API request** carries `Authorization: Bearer <access_token>`. The server verifies, on every call: signature, expiry, **issuer** (`<SUPABASE_URL>/auth/v1`), **audience** (`authenticated`), `role == authenticated` (anon/service tokens are rejected) and a UUID `sub`.
  * `HS256` → legacy shared secret `SUPABASE_JWT_SECRET`.
  * `ES256` / `RS256` → project JWKS (`/auth/v1/.well-known/jwks.json`, cached 10 min, one forced refresh on unknown `kid`). Algorithms are pinned per family (no alg-confusion, no `none`).
  * An invalid or expired token is **401** — never silently downgraded to anonymous or Free. No token at all means an anonymous visitor (the public scan only).
  * JWKS unreachable → 503 (never accepts a token it cannot verify).
* **Role and plan live in OUR database** (`profiles.role`, `subscriptions`). Token metadata (`user_metadata`, `app_metadata`) never grants anything. A profile is created on the first *verified* request with role `user`; later logins never change the role.
* **No development/synthetic access.** `DEV_ADMIN_MODE` / `VITE_DEV_ADMIN_MODE` in an old `.env` are ignored (a warning is logged and shown in the admin health tab).

## Routes

| Route | Access |
|---|---|
| `/` | public scanner |
| `/auth` (`?mode=signin\|signup\|recover`), `/auth/callback` | public; callback handles e-mail confirmation and password recovery |
| `/app`, `/auditorias/:id`, `/configuracoes` | session required; a direct URL or refresh waits for the session, then renders or redirects to `/auth` and returns to the requested page after login |
| `/admin` | administrator (UI shows 403; every `/api/admin/*` route enforces it on the server) |
| `/audit/:id`, `/settings` | redirect to the new URLs |

## Granting the administrative account (no password anywhere)

1. Sign in once with `datatrustaudit@gmail.com` (this creates its profile from a verified token).
2. On the server run: `python scripts/grant_admin.py --email datatrustaudit@gmail.com` (or `--user-id <uuid>`).
   * Idempotent; prints `PENDING` if the profile does not exist yet; logged to `admin_audit_log` with actor `cli:<os-user>`.
   * `--revoke` sets the role back to `user`.
3. From then on administrators can manage roles in **/admin → Usuários** (logged; cannot remove their own role).

## What still needs credentials / configuration (not verifiable from this environment)

| Item | Status |
|---|---|
| `SUPABASE_URL` host resolves | **No** — `dngg…supabase.co` did not resolve via the system resolver nor 8.8.8.8 on 2026-10-27 (project paused/deleted or wrong URL). Real sign-in could not be exercised. |
| `SUPABASE_JWT_SECRET` / JWKS | Secret is present in `.env`; JWKS could not be fetched for the same reason. |
| `VITE_SUPABASE_ANON_KEY` | Present (publishable-key format); not validated against a live project. |
| E-mail confirmation / SMTP, redirect URLs (`<app>/auth/callback`) | Must be configured in the Supabase dashboard (Authentication → URL configuration). |
| Production database | Set `DATABASE_URL` to PostgreSQL and install a driver (`psycopg[binary]`); migrations run on startup. |
| Row Level Security | Tables are keyed by `user_id`; the API uses a privileged connection and checks ownership explicitly. Enable RLS policies only if the Supabase data API is also exposed. |

## Security properties verified by tests

`tests/test_auth.py` (15) and `tests/test_accounts_api.py`: expired/forged/wrong-issuer/wrong-audience/anon/service tokens, `alg=none`, algorithm confusion, JWKS rotation and outage, metadata cannot grant admin, `DEV_ADMIN_MODE` ignored, non-admins get 403 on every admin route, simulation header ignored for non-admins, cross-user audit access returns 404.


## Google sign-in and owner bootstrap (2026-10-27)

* **Google**: `/auth` has "Entrar com Google" (`supabase.auth.signInWithOAuth({provider:'google'})`,
  return to `/auth/callback`). The Google provider must be enabled in Supabase (it is, as of
  2026-10-27) and `http(s)://<your-host>/auth/callback` must be listed under
  *Authentication → URL Configuration → Redirect URLs* (e.g. `http://localhost:8080/auth/callback`).
* **Owner bootstrap**: e-mails in `ADMIN_BOOTSTRAP_EMAILS` (default `datatrustaudit@gmail.com`;
  empty string disables) become `admin` on their first login with a Supabase-signed JWT whose
  e-mail is not explicitly unverified. Promote-only, idempotent, recorded in the admin log as
  `role.bootstrap_admin` by `system:bootstrap`. No password exists anywhere; identity is proven
  by Supabase (Google or confirmed e-mail). `scripts/grant_admin.py` remains for other admins.


## Test context replaces "view as" (2026-10-28)

The `X-DT-Simulate-Plan` header was removed. `/admin` → **Testar planos** offers *Administrador*,
*Testar Free 30%*, *Testar Pro 70%*, *Testar Premium 100%* (labels filled from the plan config). The
choice is stored server-side (`admin_test_contexts`), applies to every API call (scan, reopen, exports
built from the payload), meters the admin exactly like the plan against a separate resettable test
balance, and can simulate exhausted quota, expired subscription or payment failure. Every switch is
logged. See [PLANS.md](PLANS.md).
