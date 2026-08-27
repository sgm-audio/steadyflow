#!/usr/bin/env node
/**
 * pnpm stop — shut down local Supabase (end of day).
 */
import { fail, isSupabaseRunning, log, ok, run, warn } from './lib.mjs';

log('=== SteadyFlow stop ===\n');

if (!isSupabaseRunning()) {
  ok('Local Supabase is not running');
  process.exit(0);
}

log('[stopping] supabase stop…');
const r = run('supabase', ['stop'], { stdio: 'inherit' });
if (!r.ok) {
  fail('supabase stop failed — is the Supabase CLI installed?');
  process.exit(r.status);
}

ok('Local Supabase stopped');
warn('Web/worker processes already exit on Ctrl+C from pnpm dev');
process.exit(0);
