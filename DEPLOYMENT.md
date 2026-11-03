# Deployment guide — Supabase (database) + Render (backend) + Vercel (frontend) + Resend (email)

Order matters: **database → backend → frontend → point backend at frontend → email → first admin.**

## 0. Before anything else
1. **Rotate every secret that has ever been pasted into a chat, a ticket or git:** `SECRET_KEY`, `DEV_KEY`, the
   Gmail app password, and the database password. Generate a new key with
   `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
2. Make sure `.env` files are **not** in git (`.gitignore` in this repo does that; if they were committed, run
   `git rm --cached backend/.env frontend/app/.env` and rotate the secrets anyway — git history keeps them).
3. `cd backend && python -m pytest` and `cd frontend/app && npm run build` must both pass locally.

## 1. Supabase (PostgreSQL)
1. Create a project; choose the region nearest your users (e.g. Frankfurt for Poland) and use the **same region for Render**.
2. **Connect → Session pooler** and copy the string. It looks like
   `postgresql://postgres.<PROJECT-REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres`
   * Do **not** use the "Direct connection" host (`db.<ref>.supabase.co`): it is IPv6-only unless you buy the IPv4 add-on,
     and Render cannot reach it. The shared pooler works over IPv4 on every plan.
   * Session mode (port 5432) suits this backend (a persistent server with a connection pool). It also works for `alembic`.
   * If the password contains `@ : / # ? %`, URL-encode it (`@` → `%40`).
3. Keep connection counts low: `WORKERS=1`, `DB_POOL_SIZE=3`, `DB_MAX_OVERFLOW=2` (≈5 connections).
4. **Row Level Security:** migration `0012_supabase_rls` enables RLS on every table when it detects Supabase, so the public
   REST API (anon key) cannot read your tables (users, password hashes…). The backend is unaffected — it connects as the table
   owner, which bypasses RLS. After the first deploy check *Supabase → Authentication → Policies* shows RLS enabled.
   You can also disable the Data API in *Project Settings → API* if you never use it.
5. Free Supabase projects may be **paused after a period of inactivity** — check the current policy; a paid plan avoids it.
6. Backups: check what your plan includes; in addition schedule `pg_dump` exports of the production data.

## 2. Render (backend)
1. *New → Web Service* → connect the repo → **Root Directory `backend`**, **Runtime Docker** (or use `render.yaml` as a Blueprint).
2. Health check path: `/health`.
3. Environment variables:

| Key | Value |
|---|---|
| `ENV` | `production` |
| `SECRET_KEY` | new random value (required — the app refuses to start without it) |
| `DATABASE_URL` | the Supabase **session pooler** string from step 1 |
| `ALLOWED_ORIGINS` | `https://<your-vercel-domain>` (comma-separate several; no trailing slash) |
| `FRONTEND_URL` | `https://<your-vercel-domain>` (encoded in printed QR codes) |
| `OPEN_REGISTRATION` | `false` (the very first account of an organisation can still register — it becomes admin) |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `true` (rate limiting by real client IP) |
| `WORKERS` | `1` |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `3` / `2` |
| `SHIFT_TZ` | `Europe/Warsaw` |
| `RESEND_API_KEY`, `FROM_EMAIL` | see step 4 |
| `ALERT_EMAILS` | **real** recipients (the sample value in the old `.env` was `manager@company.com`) |
| `DEV_KEY`, `ENABLE_DEV_ROUTES` | leave unset in production unless you really need the Dev page |

4. The container runs `alembic upgrade head` on every start, then gunicorn. Watch the first deploy log for
   `Running upgrade … 0012_supabase_rls` and `APScheduler started`.
5. **Free instance caveats (as of the Render docs):**
   * It **spins down after 15 minutes without traffic** and takes about a minute to wake. While asleep, **no background jobs
     run** — stuck-tray alerts, the daily summary and Cogiscan polling only fire while the service is awake.
   * **Outbound SMTP ports 25, 465 and 587 are blocked** on free web services (since 26 Sep 2025), so Gmail/SMTP email cannot
     work there — use Resend (HTTPS API). Port 25 stays blocked on paid plans too.
   * For a production plant system use a **paid instance** (always on, SMTP ports 465/587 open).
6. **Network reach:** Render can only call Cogiscan/WATS if they are reachable from the public internet. If they live inside the
   factory LAN, polling from Render will fail — use Cogiscan's push webhook (outbound from the plant) or a VPN/tunnel.

## 3. Vercel (frontend)
1. *Add New Project* → repo → **Root Directory `frontend/app`**, framework Vite (build `npm run build`, output `dist`).
2. Environment variable (Production **and** Preview): `VITE_API_URL=https://<your-service>.onrender.com`
   (Vite bakes this in at build time; changing it requires a redeploy. Vercel does not read your local `.env`.)
3. `vercel.json` already rewrites all routes to `index.html` (needed for `/scan`, `/history` …).
4. Deploy, then go back to Render and set `ALLOWED_ORIGINS` and `FRONTEND_URL` to the final Vercel URL → redeploy backend.
5. **Cookies:** Vercel and Render are different sites, so the session cookie is third-party; browsers that block third-party
   cookies (Safari, some Chrome settings) fall back to the token kept in `localStorage`. For the cleanest setup put both on one
   domain (`app.yourcompany.com` → Vercel, `api.yourcompany.com` → Render custom domain).

## 4. Resend (email)
1. Create an account → **Domains → Add domain** → add the DNS records Resend shows (SPF, DKIM) at your DNS host → wait for *Verified*.
2. **Without a verified domain Resend only delivers to your own account address** (sender `onboarding@resend.dev`) — OTP and
   password-reset mails to real users would silently fail. Gmail/Outlook addresses cannot be used as the sender.
3. *API Keys → Create* → set `RESEND_API_KEY` (shown once). Set `FROM_EMAIL=no-reply@yourdomain.com`.
4. Check current free-plan sending limits on Resend's pricing page.
5. Test: Admin → Email → *Send test email*.
6. No domain? Options: buy a cheap domain; or use a paid Render instance with Gmail SMTP (app password, port 465);
   or another HTTPS email API that allows verifying a single sender address.

## 5. First start
1. Open `https://<backend>/health` → expect `healthy`.
2. Open the Vercel URL → **Register** (first account of the organisation → becomes **admin**). Do this immediately.
3. Admin → Integrations → *Generate webhook secret*; configure Cogiscan with the shown URL and the header `X-Webhook-Secret`.
4. Admin → Pipeline: review stages, projects, stuck limits. Admin → Users: create operators (set their email).

## 6. Smoke test checklist
- [ ] Login / logout, wrong password shows an error
- [ ] Create trays → print labels (incl. Part A/B) → scan each QR with a **phone camera** (opens the scan page, survives login)
- [ ] Scan through stages, split, branch; Dashboard counts update
- [ ] Forgot password → email arrives
- [ ] Operator account cannot open Admin; exports blocked for operators
- [ ] Render logs show `APScheduler started`; no `psycopg`/`SECRET_KEY` errors
- [ ] Supabase shows RLS enabled on all tables

## 7. Updating later
`git push` → Render and Vercel redeploy. Migrations run automatically at backend start. Always take a database backup before a
release that contains a new migration.
