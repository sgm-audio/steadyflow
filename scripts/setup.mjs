#!/usr/bin/env node
/**
 * pnpm setup — one-time (or anytime) bootstrap for local SteadyFlow.
 * Installs deps, ensures .env.local, runs doctor.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  envExamplePath,
  envLocalPath,
  fail,
  hasEnvLocal,
  log,
  ok,
  ROOT,
  run,
  warn,
} from './lib.mjs';

log('=== SteadyFlow setup ===\n');

if (!hasEnvLocal()) {
  if (!existsSync(envExamplePath())) {
    fail('Missing .env.local.example — cannot create .env.local');
    process.exit(1);
  }
  copyFileSync(envExamplePath(), envLocalPath());
  ok('Created .env.local from .env.local.example');
  warn('Local defaults are enough for Studio + web. Add remote secrets only when deploying.');
} else {
  ok('.env.local already exists');
}

// `next dev` only auto-loads .env.local from its own package directory
// (apps/web), not the repo root — copy it through so NEXT_PUBLIC_* vars
// actually reach the web app instead of throwing "Missing
// NEXT_PUBLIC_SUPABASE_URL" at middleware startup.
copyFileSync(envLocalPath(), join(ROOT, 'apps/web/.env.local'));
ok('Synced .env.local into apps/web');

log('\n[install] pnpm install…');
const install = run('pnpm', ['install'], { stdio: 'inherit' });
if (!install.ok) {
  fail('pnpm install failed');
  process.exit(install.status);
}

log('\n[doctor] verifying toolchain…');
const doctor = run('node', ['scripts/doctor.mjs'], { stdio: 'inherit' });
if (!doctor.ok) {
  fail('Doctor reported issues — fix them, then re-run: pnpm setup');
  process.exit(doctor.status);
}

log('\nSetup complete. Every day:');
log('  pnpm dev     # start Supabase + workers + web');
log('  pnpm stop    # stop local Supabase when done');
log('  pnpm check   # typecheck + lint + test before a PR');
process.exit(0);
