# KUSOOF — backend setup (Supabase · Brevo · Google Maps)

The backend is already created and deployed. This guide lists **what you
still need to do** (credentials only you can create) and how everything fits
together.

| | Status |
|---|---|
| Supabase project `kusoof` (ref `qelbprljqgsrmicvdqet`, Frankfurt) | ✅ created |
| Database: 9 tables, RLS on every table, order/status functions, seed (2 products, 32 delivery zones) | ✅ applied (`supabase/migrations/`) |
| Storage bucket `product-images` (public read, admin write, 5 MB, JPG/PNG/WebP/AVIF) | ✅ created |
| Edge Functions `admin-request-code`, `email-dispatch` | ✅ deployed |
| Email queue: database trigger + `pg_cron` (every minute) → `email-dispatch` | ✅ running |
| **Supabase Auth email settings + Brevo SMTP** | ⏳ you — step 2 |
| **Brevo secrets for order emails** | ⏳ you — step 3 |
| **Your admin email** | ⏳ you — step 4 |
| **Google Maps key + Map ID** | ⏳ you — step 5 |

---

## 1. Run the site locally

```powershell
node scripts/write-env.mjs
```
This copies the **public** values from `.env` into `js/env.public.js` (the
browser can't read `.env`; there is no build step). It refuses to copy a
secret. Then start the dev server (`.claude/launch.json`, port 5173) or any
static server and open <http://localhost:5173>.

`.env` is git-ignored. `.env.example` lists every variable with empty values.

| Variable | Where it's used | Secret? |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | browser (`js/env.public.js`) | no — public; RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | nowhere yet (keep for local admin scripts) | **yes — never in `js/`** |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | Edge Function secrets (step 3) | **yes** |
| `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY` | Supabase Auth SMTP settings (step 2) | **yes** |
| `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_MAP_ID` | browser | public by nature — restrict it (step 5) |
| `APP_URL` | browser + Edge Function secret | no |
| `ADMIN_EMAIL` | your note of the admin email (step 4) | no |

---

## 2. Supabase Auth — email codes through Brevo

Supabase dashboard → project **kusoof** → **Authentication**:

1. **Sign In / Providers → Email**: Email enabled, *Confirm email* on.
   - **Email OTP Length: 6**
   - **Email OTP Expiration: 600** seconds (10 minutes — the site says so)
2. **Emails → SMTP Settings** → *Enable custom SMTP*:
   - Host `smtp-relay.brevo.com` · Port `587`
   - Username = your Brevo **SMTP login** · Password = your Brevo **SMTP key**
   - Sender email = your verified Brevo sender · Sender name `KUSOOF`
   - Minimum interval between emails: **60 s** (the site's resend timer)
3. **Emails → Templates**: paste `docs/supabase-otp-email.html` into
   **Confirm signup** *and* **Magic Link** (subject:
   `KUSOOF · {{ .Token }} is your sign-in code`). It shows the 6-digit code
   in English or Arabic (the language chosen when the account was created).
4. **URL Configuration**: Site URL = your `APP_URL`; add
   `http://localhost:5173` and your live domain to Redirect URLs.
5. **Rate Limits**: raise "emails per hour" to suit (custom SMTP allows it).

> Until step 2 is done Supabase uses its built-in mailer, which only sends to
> members of your Supabase organisation and only a few emails per hour.

---

## 3. Brevo — order emails

Brevo → **SMTP & API**: create an **API key** (and the SMTP key for step 2).
Brevo → **Senders, domains**: verify your sender / domain (SPF + DKIM).

Supabase dashboard → **Edge Functions → Secrets** → add:

| Name | Value |
|---|---|
| `BREVO_API_KEY` | your Brevo API key |
| `BREVO_SENDER_EMAIL` | the verified sender, e.g. `orders@yourdomain.com` |
| `BREVO_SENDER_NAME` | `KUSOOF` |
| `APP_URL` | your public `https://` site URL (used for links + the logo in emails) |

How it works: placing an order or changing its status writes one row to
`email_notifications` (one per order and type — a database unique key, so
never two). The database immediately calls `email-dispatch`, which renders
the email (same template code as the admin preview), sends it with Brevo and
stores `sent` + Brevo's message id, or the error. Temporary failures retry
after 1 / 5 / 15 / 60 min (5 attempts), then `failed` — the admin can press
**Retry**. Until the secrets exist, emails simply wait as **Queued**; nothing
is lost and no order is affected.

Known edge: if the function crashes *after* Brevo accepted an email but
*before* it saved "sent", that one email can be sent again after 10 minutes
(Brevo has no idempotency key). Everything else is exactly-once.

---

## 4. The admin (no public registration, no password)

There is exactly one admin, set on the server. Supabase dashboard → **SQL
Editor**:

```sql
insert into public.admin_users (email) values ('you@yourdomain.com');
```

Then open `/admin/`, enter that email and the 6-digit code you receive. The
first sign-in creates/links your login automatically (Edge Function
`admin-request-code`). Any other email is refused before a code is sent.

To change the admin email: `delete from public.admin_users where email = 'old@…';`
then insert the new one. Admin rights are checked by the database
(`is_admin()` in every admin policy and function), never only by the browser.

---

## 5. Google Maps

Google Cloud console (a project with billing):

1. **APIs & Services → Library**: enable **Maps JavaScript API**,
   **Places API (New)** and **Geocoding API**.
2. **Credentials → Create API key**, then *Edit*:
   - Application restriction: **Websites** → `http://localhost:5173/*` and
     `https://your-domain/*`
   - API restriction: the three APIs above only.
3. **Google Maps Platform → Map management → Create Map ID** (JavaScript,
   Vector). The draggable pin needs it.
4. Put both in `.env` (`GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_MAP_ID`) and run
   `node scripts/write-env.mjs`.

Without a key the checkout shows a clear "Map not set up yet" message and
customers type their address (the pin is optional only in that case). With
the key: search (Egypt only), click/drag the pin, my-location, and the
governorate/area are matched to your delivery zones — the customer always
confirms the area, and the fee is always the zone's fee from the database.

---

## 6. Going live

- Host the static files anywhere (Netlify, Vercel, Cloudflare Pages, S3…).
  Run `node scripts/write-env.mjs` with production values first; **never
  upload `.env`**.
- Add the live domain to Supabase Redirect URLs (step 2.4) and the Maps key
  referrers (step 5.2); set the `APP_URL` secret (step 3).
- Changing email templates: edit `js/data/email-templates.js`, run
  `node scripts/sync-functions.mjs`, then redeploy `email-dispatch`
  (`supabase functions deploy email-dispatch`).

## 7. Recreating the backend elsewhere

Apply `supabase/migrations/*.sql` in order, deploy both functions, then set
the dispatch config once (private table, not readable by clients):

```sql
insert into private.app_config (key, value) values
  ('dispatch_url', 'https://<project-ref>.supabase.co/functions/v1/email-dispatch'),
  ('anon_key', '<public anon key>'),
  ('dispatch_secret', encode(extensions.gen_random_bytes(32), 'hex'));
```
