#!/usr/bin/env node
/* Copies the shared email templates into the email-dispatch Edge Function so
   the admin preview and the real emails always render the same HTML.
     node scripts/sync-functions.mjs   (run before deploying functions) */
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
copyFileSync(join(root, 'js', 'data', 'email-templates.js'), join(root, 'supabase', 'functions', 'email-dispatch', 'email-templates.js'));
console.log('✓ Copied js/data/email-templates.js → supabase/functions/email-dispatch/email-templates.js');
