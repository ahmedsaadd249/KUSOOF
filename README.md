# KUSOOF · كسوف

Luxury black eyewear store for Egypt — bilingual (English / العربية, RTL),
with a cinematic scroll landing page, passwordless accounts, cash-on-delivery
checkout and a full admin dashboard.

| Layer | Technology |
|---|---|
| Frontend | Plain HTML, CSS and native ES modules — no framework, no npm dependencies |
| Animation | GSAP 3 + ScrollTrigger, Lenis (CDN) |
| Backend | Supabase — Postgres + Row Level Security, Auth (email one-time codes), Storage, Edge Functions |
| Email | Brevo (sign-in codes via Supabase SMTP, order emails via the `email-dispatch` function) |
| Maps | Google Maps JavaScript API + Places API (New) + Geocoding API (optional) |
| Hosting | Cloudflare Pages (static), deployed automatically from GitHub |

## Project structure

```
index.html … order-confirmation.html   customer pages (EN/AR)
admin/index.html                       admin dashboard (hash routes)
css/  js/  frames/  products/  logo/   website assets
js/lib/supabase.js                     Supabase client (public anon key only)
js/services/                           data access (RLS-protected tables + RPCs)
supabase/migrations/                   database schema, RLS, functions, seed
supabase/functions/                    Edge Functions (admin-request-code, email-dispatch)
scripts/                               build + setup scripts (Node, no dependencies)
docs/SETUP.md                          backend setup: Supabase, Brevo, Google Maps, admin
```

## Run locally

Requirements: Node.js 18+ (only for the scripts) and any static file server.

```bash
cp .env.example .env          # then fill in the values (see below)
node scripts/write-env.mjs    # writes js/env.public.js (public values only)
python -m http.server 5173    # or any static server, then open http://localhost:5173
```

ES modules need `http://` — opening the files directly (`file://`) won't work.

## Environment variables

Only **public** values reach the browser. `.env` is git-ignored; `.env.example`
lists every name with empty values.

| Variable | Used by | Public? |
|---|---|---|
| `SUPABASE_URL` | browser | yes |
| `SUPABASE_ANON_KEY` | browser (RLS protects the data) | yes |
| `APP_URL` | browser + email links | yes |
| `GOOGLE_MAPS_API_KEY` | browser — restrict it by HTTP referrer and API | yes (restricted) |
| `GOOGLE_MAPS_MAP_ID` | browser | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | local scripts only — never in the site | **secret** |
| `SUPABASE_ACCESS_TOKEN` | `scripts/configure-supabase.mjs` only | **secret** |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | Supabase Edge Function secrets | **secret** |
| `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY` | Supabase Auth SMTP settings | **secret** |
| `ADMIN_EMAIL` | your note of the admin email (`public.admin_users`) | — |

Secrets live only in `.env` on your computer and in Supabase (Auth SMTP
settings and Edge Function secrets). They are never committed and never
deployed to Cloudflare.

## Build

```bash
node scripts/build.mjs        # → dist/
```

Copies only the website files into `dist/`, generates `dist/js/env.public.js`
from the environment (or `.env`), and adds Cloudflare `_headers`. The build
fails if a secret key is supplied as a public value.

## Deployment (Cloudflare Pages)

Live: **https://kusoof.pages.dev**

The repository is connected to the Cloudflare Pages project ; every
push to  builds and deploys automatically. Only  is published —
never the docs, scripts, database files or .

| Setting (Pages › kusoof › Settings › Build) | Value |
|---|---|
| Git repository / production branch |  ·  |
| Framework preset | None |
| Build command | ✓ Built dist/ — 299 files, 12.9 MB
  Supabase:    https://qelbprljqgsrmicvdqet.supabase.co
  App URL:     http://localhost:5173
  Google Maps: not set — the map shows its setup message |
| Build output directory |  |
| Environment variables | , , ,  (+ ,  when you have them) |

Only public values go in the environment variables. Never add Brevo keys, the
service role key or access tokens.

- **Logs:** Cloudflare dashboard › Workers & Pages ›  › Deployments › a deployment › *View details*.
- **Roll back:** Deployments › the previous good deployment › ⋯ › *Rollback to this deployment*.
- **Preview deployments:** pushes to other branches get their own preview URL.

When the production URL changes (e.g. a custom domain), also update the
Supabase Auth Site URL / redirect URLs, the `APP_URL` Edge Function secret and
the Google Maps key's allowed referrers — see `docs/SETUP.md`.

## Backend

The backend is hosted on Supabase (project `kusoof`). Schema, Row Level
Security, order and status functions, storage, email queue and the admin
allowlist are in `supabase/`. Full setup and operations guide:
[`docs/SETUP.md`](docs/SETUP.md).
