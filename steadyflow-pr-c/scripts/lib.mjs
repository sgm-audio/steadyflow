/**
 * Shared helpers for SteadyFlow local-dev scripts (Windows + macOS + Linux).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const isWin = process.platform === 'win32';

export function log(msg) {
  console.log(msg);
}

export function ok(msg) {
  console.log(`[ok] ${msg}`);
}

export function warn(msg) {
  console.warn(`[warn] ${msg}`);
}

export function fail(msg) {
  console.error(`[fail] ${msg}`);
}

/** Run a command; return { ok, status, stdout, stderr }. */
export function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    shell: opts.shell ?? isWin,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: opts.stdio ?? 'pipe',
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    error: result.error,
  };
}

/** True if binary is on PATH. */
export function hasBin(name) {
  const probe = isWin ? 'where' : 'which';
  const r = run(probe, [name]);
  return r.ok;
}

export function envLocalPath() {
  return join(ROOT, '.env.local');
}

export function envExamplePath() {
  return join(ROOT, '.env.local.example');
}

export function hasEnvLocal() {
  return existsSync(envLocalPath());
}

/** Detect local Supabase DB container for this project. */
export function isSupabaseRunning() {
  if (!hasBin('docker')) return false;
  const r = run('docker', ['ps', '--format', '{{.Names}}']);
  if (!r.ok) return false;
  return r.stdout.split(/\r?\n/).some((n) => n.includes('supabase_db_steadyflow'));
}

/** Spawn a long-running process; inherit stdio. Returns ChildProcess. */
export function spawnInherit(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    shell: opts.shell ?? isWin,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: 'inherit',
  });
}

export function printDailyBanner() {
  log('');
  log('=== SteadyFlow — daily loop ===');
  log('  Studio:   http://127.0.0.1:54323');
  log('  API:      http://127.0.0.1:54321');
  log('  Web:      http://127.0.0.1:3000');
  log('  Login:    dev@steadyflow.local / admin');
  log('');
  log('  Ctrl+C stops web + workers (Supabase keeps running).');
  log('  End of day: pnpm stop');
  log('');
}
