/**
 * Vendor the built `@steadyflow/shopify-admin` package into the Supabase edge
 * function bundle so Deno functions can import it as the single source of truth.
 *
 * Deno functions can only import from within `supabase/functions/` (the deploy
 * bundle root) — they cannot reach the workspace `packages/` tree. This script
 * builds the package (tsc → dist) and copies the compiled ESM into
 * `supabase/functions/_shared/shopify-admin/`. The Deno import map already maps
 * the bare `zod` specifier to `npm:zod@3`, which the vendored dist relies on.
 *
 * Run before deploying edge functions (or add as a predeploy hook):
 *   node scripts/vendor-shopify-admin.mjs
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'packages', 'shopify-admin', 'dist');
const DEST = join(ROOT, 'supabase', 'functions', '_shared', 'shopify-admin');

console.log('[vendor] building @steadyflow/shopify-admin...');
const build = spawnSync('pnpm', ['--filter', '@steadyflow/shopify-admin', 'build'], {
  cwd: ROOT,
  shell: true,
  stdio: 'inherit',
});
if (build.status !== 0) {
  console.error('[vendor] build failed');
  process.exit(build.status ?? 1);
}

if (!existsSync(SRC)) {
  console.error(`[vendor] dist not found: ${SRC}`);
  process.exit(1);
}

console.log(`[vendor] copying ${SRC} -> ${DEST}`);
rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
cpSync(SRC, DEST, {
  recursive: true,
  // Lean bundle: production .js only (skip tests, type decls, sourcemaps).
  filter: (src) =>
    !src.endsWith('.test.js') && !src.endsWith('.d.ts') && !src.endsWith('.map'),
});

console.log('[vendor] done. Deno import path: ../_shared/shopify-admin/index.js');
