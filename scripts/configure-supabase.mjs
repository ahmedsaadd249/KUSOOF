#!/usr/bin/env node
/* ==========================================================================
   configure-supabase — applies the email setup from .env to the Supabase
   project through the Management API (same settings as docs/SETUP.md §2–3):

     Auth:    custom SMTP = Brevo, 6-digit codes valid 10 minutes, 60 s between
              code emails, the bilingual code email template, site/redirect URL
     Secrets: BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, APP_URL
              (used by the email-dispatch Edge Function)

     node scripts/configure-supabase.mjs

   Needs SUPABASE_ACCESS_TOKEN in .env (a personal access token from
   https://supabase.com/dashboard/account/tokens). Secrets are read from .env
   and sent only to api.supabase.com — this script never prints them.
   Revoke the token afterwards if you don't need it any more.
   ========================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
if (!existsSync(envPath)) {
  console.error('✗ .env not found');
  process.exit(1);
}
const env = {};
for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  let v = line.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[line.slice(0, i).trim()] = v;
}

const required = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_URL', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SMTP_LOGIN', 'BREVO_SMTP_KEY', 'APP_URL'];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  console.error(`✗ Missing in .env: ${missing.join(', ')}`);
  process.exit(1);
}
const ref = (env.SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
if (!ref) {
  console.error('✗ SUPABASE_URL must look like https://<ref>.supabase.co');
  process.exit(1);
}
// APP_URL can be overridden for one run (e.g. the live URL) without editing .env
const appUrl = (process.env.APP_URL || env.APP_URL).replace(/\/$/, '');
const senderName = env.BREVO_SENDER_NAME || 'KUSOOF';

// The code email (docs/supabase-otp-email.html, without its explanatory comment)
const template = readFileSync(join(root, 'docs', 'supabase-otp-email.html'), 'utf8').replace(/^\s*<!--[\s\S]*?-->\s*/, '');
const subject = 'KUSOOF · {{ .Token }} is your sign-in code';

const api = async (method, path, body) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === 'object' && data ? data.message || JSON.stringify(data) : String(data);
    throw new Error(`${method} ${path} → HTTP ${res.status}: ${String(msg).slice(0, 300)}`);
  }
  return data;
};

const mask = (s) => String(s || '').replace(/^(.{2}).*(@.*)$/, '$1•••$2');

// Flags: --secrets-only (skip Auth) · --auth-only (skip secrets) · --verify (read back only)
const only = (flag) => process.argv.includes(flag);
const doAuth = !only('--secrets-only') && !only('--verify');
const doSecrets = !only('--auth-only') && !only('--verify');
let failed = false;

async function step(label, fn) {
  try {
    await fn();
    console.log(`✓ ${label}`);
  } catch (e) {
    failed = true;
    console.error(`✗ ${label}: ${e.message}`);
  }
}

if (doAuth) await step('Auth settings updated', () => api('PATCH', '/config/auth', {
    external_email_enabled: true,
    mailer_autoconfirm: false,
    mailer_otp_length: 6,
    mailer_otp_exp: 600,
    smtp_admin_email: env.BREVO_SENDER_EMAIL,
    smtp_sender_name: senderName,
    smtp_host: 'smtp-relay.brevo.com',
    smtp_port: '587',
    smtp_user: env.BREVO_SMTP_LOGIN,
    smtp_pass: env.BREVO_SMTP_KEY,
    smtp_max_frequency: 60,
    site_url: appUrl,
    // the live site plus local development
    uri_allow_list: [...new Set([appUrl, 'http://localhost:5173'])].join(','),
    mailer_subjects_confirmation: subject,
    mailer_templates_confirmation_content: template,
    mailer_subjects_magic_link: subject,
    mailer_templates_magic_link_content: template,
    rate_limit_email_sent: 100,
  }));

// Edge Function secrets (needs the token permission "Edge Function Secrets: Read-write")
if (doSecrets)
  await step('Edge Function secrets set', () =>
    api('POST', '/secrets', [
      { name: 'BREVO_API_KEY', value: env.BREVO_API_KEY },
      { name: 'BREVO_SENDER_EMAIL', value: env.BREVO_SENDER_EMAIL },
      { name: 'BREVO_SENDER_NAME', value: senderName },
      { name: 'APP_URL', value: appUrl },
    ])
  );

// Read back (non-secret fields only)
try {
  const auth = await api('GET', '/config/auth');
  console.log('\nAuth now:');
  console.log(`  SMTP           ${auth.smtp_host}:${auth.smtp_port} · user ${mask(auth.smtp_user)} · sender ${mask(auth.smtp_admin_email)} (${auth.smtp_sender_name})`);
  console.log(`  Codes          ${auth.mailer_otp_length} digits · valid ${auth.mailer_otp_exp} s · min ${auth.smtp_max_frequency} s between emails`);
  console.log(`  Template       subject "${auth.mailer_subjects_magic_link}" · ${String(auth.mailer_templates_magic_link_content || '').includes('{{ .Token }}') ? 'shows the code' : '✗ no {{ .Token }}'}`);
  console.log(`  Site URL       ${auth.site_url} · redirects ${auth.uri_allow_list}`);
  console.log(`  Emails / hour  ${auth.rate_limit_email_sent}`);
} catch (e) {
  console.error(`✗ Could not read Auth settings back: ${e.message}`);
}
try {
  const secrets = await api('GET', '/secrets');
  const names = (secrets || []).map((s) => s.name).filter((n) => /^(BREVO_|APP_URL)/.test(n));
  console.log(`\nFunction secrets: ${names.length ? names.join(', ') : 'none of BREVO_* / APP_URL yet'}`);
} catch (e) {
  console.error(`\n✗ Could not list function secrets: ${e.message}`);
}
if (failed) process.exit(1);
