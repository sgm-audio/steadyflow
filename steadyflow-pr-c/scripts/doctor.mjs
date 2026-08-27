#!/usr/bin/env node
/**
 * pnpm doctor — verify tools needed for daily SteadyFlow development.
 * Exit 0 when ready; exit 1 when something blocking is missing.
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import {
  envExamplePath,
  envLocalPath,
  fail,
  hasBin,
  hasEnvLocal,
  isSupabaseRunning,
  log,
  ok,
  run,
  warn,
} from './lib.mjs';

const checks = [];

function check(name, pass, fix) {
  checks.push({ name, pass, fix });
  if (pass) ok(name);
  else fail(`${name}${fix ? ` — ${fix}` : ''}`);
}

log('=== SteadyFlow doctor ===\n');

check(
  'Node.js >= 20.11',
  (() => {
    const [maj, min] = process.versions.node.split('.').map(Number);
    return maj > 20 || (maj === 20 && min >= 11);
  })(),
  'Install Node 20 LTS from https://nodejs.org',
);

check(
  'pnpm on PATH',
  hasBin('pnpm'),
  'corepack enable && corepack prepare pnpm@9.12.0 --activate',
);

check(
  'Docker on PATH',
  hasBin('docker'),
  'Install Docker Desktop and ensure it is running',
);

check(
  'Docker daemon reachable',
  (() => {
    if (!hasBin('docker')) return false;
    return run('docker', ['info']).ok;
  })(),
  'Start Docker Desktop, then re-run pnpm doctor',
);

check(
  'Supabase CLI on PATH',
  hasBin('supabase'),
  'Windows: npm install -g supabase   |  macOS: brew install supabase/tap/supabase',
);

const nodeModules = existsSync(new URL('../node_modules', import.meta.url));
check('Dependencies installed (node_modules)', nodeModules, 'Run: pnpm install');

if (!hasEnvLocal()) {
  if (existsSync(envExamplePath())) {
    warn('.env.local missing — copying from .env.local.example');
    copyFileSync(envExamplePath(), envLocalPath());
    ok('.env.local created from example (fill server secrets if you deploy)');
  } else {
    check('.env.local present', false, 'Copy .env.local.example to .env.local');
  }
} else {
  ok('.env.local present');
  const raw = readFileSync(envLocalPath(), 'utf8');
  if (!/NEXT_PUBLIC_SUPABASE_URL=/.test(raw)) {
    warn('.env.local missing NEXT_PUBLIC_SUPABASE_URL — local web app may not boot');
  }
}

if (hasBin('supabase') && hasBin('docker') && run('docker', ['info']).ok) {
  if (isSupabaseRunning()) ok('Local Supabase already running');
  else warn('Local Supabase not running yet — pnpm dev will start it');
}

log('');
const failed = checks.filter((c) => !c.pass);
if (failed.length === 0) {
  log('Ready for daily use. Start with: pnpm dev');
  process.exit(0);
}

log(`${failed.length} issue(s) to fix before pnpm dev.`);
process.exit(1);
