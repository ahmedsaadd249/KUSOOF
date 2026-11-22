#!/usr/bin/env node
/* ==========================================================================
   check-env — reports which .env values are set and whether they look right,
   WITHOUT printing any secret (only names, formats and lengths).
     node scripts/check-env.mjs            format checks only
     node scripts/check-env.mjs --brevo    also asks Brevo whether the API key
                                           works and the sender is verified
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

const email = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v);
const CHECKS = {
  SUPABASE_URL: (v) => /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(v) || 'expected https://<ref>.supabase.co',
  SUPABASE_ANON_KEY: (v) => v.startsWith('eyJ') || v.startsWith('sb_publishable_') || 'expected a JWT (eyJ…) or sb_publishable_…',
  SUPABASE_SERVICE_ROLE_KEY: (v) => v.startsWith('eyJ') || v.startsWith('sb_secret_') || 'expected a JWT (eyJ…) or sb_secret_…',
  BREVO_API_KEY: (v) => v.startsWith('xkeysib-') || (v.startsWith('xsmtpsib-') ? 'this is an SMTP key — the API key starts with xkeysib-' : 'Brevo API keys start with xkeysib-'),
  BREVO_SENDER_EMAIL: (v) => email(v) || 'expected an email address',
  BREVO_SENDER_NAME: (v) => v.length > 0 || 'empty',
  BREVO_SMTP_LOGIN: (v) => email(v) || 'expected the SMTP login (an email-like value, e.g. …@smtp-brevo.com)',
  BREVO_SMTP_KEY: (v) => v.startsWith('xsmtpsib-') || (v.startsWith('xkeysib-') ? 'this is an API key — the SMTP key starts with xsmtpsib-' : 'Brevo SMTP keys start with xsmtpsib-'),
  GOOGLE_MAPS_API_KEY: (v) => v.startsWith('AIza') || 'Google API keys start with AIza',
  GOOGLE_MAPS_MAP_ID: (v) => /^[0-9a-f]{8,}$/i.test(v) || 'expected a hex Map ID',
  APP_URL: (v) => /^https?:\/\/[^\s/]+/.test(v) || 'expected a URL',
  ADMIN_EMAIL: (v) => email(v) || 'expected an email address',
};
const SECRET = new Set(['SUPABASE_SERVICE_ROLE_KEY', 'BREVO_API_KEY', 'BREVO_SMTP_KEY']);

console.log('Variable                     Status');
for (const [name, check] of Object.entries(CHECKS)) {
  const v = env[name] || '';
  let status;
  if (!v) status = '· not set';
  else {
    const ok = check(v);
    const shape = SECRET.has(name) ? `${v.length} chars` : name.includes('EMAIL') || name.includes('LOGIN') ? v.replace(/^(.{2}).*(@.*)$/, '$1•••$2') : name === 'APP_URL' || name === 'SUPABASE_URL' ? v : `${v.length} chars`;
    status = ok === true ? `✓ set (${shape})` : `✗ ${ok} (${shape})`;
  }
  console.log(`${name.padEnd(28)} ${status}`);
}

if (process.argv.includes('--brevo') && env.BREVO_API_KEY) {
  const res = await fetch('https://api.brevo.com/v3/senders', { headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json' } });
  if (!res.ok) {
    console.log(`\nBrevo API key: ✗ rejected by Brevo (HTTP ${res.status})`);
  } else {
    const { senders = [] } = await res.json();
    console.log(`\nBrevo API key: ✓ accepted by Brevo · ${senders.length} sender(s)`);
    for (const s of senders) console.log(`  ${s.active ? '✓ verified' : '✗ not verified'}  ${s.name} <${s.email}>`);
    if (env.BREVO_SENDER_EMAIL) {
      const match = senders.find((s) => s.email.toLowerCase() === env.BREVO_SENDER_EMAIL.toLowerCase());
      console.log(`BREVO_SENDER_EMAIL: ${match ? (match.active ? '✓ is a verified Brevo sender' : '✗ exists in Brevo but is not verified yet') : '✗ is not one of your Brevo senders'}`);
    }
  }
}
