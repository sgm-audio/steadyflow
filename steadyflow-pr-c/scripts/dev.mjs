#!/usr/bin/env node
/**
 * pnpm dev — daily launcher (Windows / macOS / Linux).
 * Starts local Supabase if needed, then workers + Next.js web app.
 */
import {
  fail,
  hasBin,
  hasEnvLocal,
  isSupabaseRunning,
  log,
  ok,
  printDailyBanner,
  run,
  spawnInherit,
  warn,
} from './lib.mjs';

function requireReady() {
  if (!hasBin('pnpm')) {
    fail('pnpm not found — run: corepack enable && corepack prepare pnpm@9.12.0 --activate');
    process.exit(1);
  }
  if (!hasBin('docker')) {
    fail('Docker not found — install Docker Desktop and start it');
    process.exit(1);
  }
  if (!run('docker', ['info']).ok) {
    fail('Docker daemon not reachable — start Docker Desktop');
    process.exit(1);
  }
  if (!hasBin('supabase')) {
    fail(
      'Supabase CLI not found — Windows: npm install -g supabase | macOS: brew install supabase/tap/supabase',
    );
    process.exit(1);
  }
  if (!hasEnvLocal()) {
    warn('.env.local missing — run pnpm setup once');
    process.exit(1);
  }
}

log('=== SteadyFlow Dev Launcher ===\n');
requireReady();

if (isSupabaseRunning()) {
  ok('supabase already running');
} else {
  log('[starting] supabase…');
  const started = run('supabase', ['start'], { stdio: 'inherit' });
  if (!started.ok) {
    fail('supabase start failed');
    process.exit(started.status);
  }
  ok('supabase ready');
}

printDailyBanner();

const children = [];

function shutdown(code = 0) {
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

log('[starting] worker loop…');
const worker = spawnInherit('pnpm', ['--filter', '@steadyflow/edge', 'worker:loop']);
children.push(worker);

log('[starting] web app (foreground)…');
const web = spawnInherit('pnpm', ['--filter', '@steadyflow/web', 'dev']);
children.push(web);

web.on('exit', (code) => {
  shutdown(code ?? 0);
});

worker.on('exit', (code, signal) => {
  if (signal === 'SIGTERM' || signal === 'SIGINT') return;
  if (code !== 0 && code !== null) {
    warn(`worker exited with code ${code}`);
  }
});
