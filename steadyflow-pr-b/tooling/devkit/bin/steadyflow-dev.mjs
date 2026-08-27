#!/usr/bin/env node
/**
 * Steadyflow developer toolkit CLI.
 *
 *   pnpm --filter @steadyflow/devkit scaffold <kind> <dest> [--name=slug]
 *
 * Kinds: shopify-theme | shopify-app | wordpress-plugin | wordpress-theme
 */

import { pathToFileURL } from 'node:url';
import { scaffold } from '../src/scaffold.js';

const args = process.argv.slice(2);
const cmd = args[0];

function usage() {
  console.error(`Usage:
  steadyflow-dev scaffold <kind> <dest> [--name=slug]

Kinds:
  shopify-theme      Online Store 2.0 theme starter (Liquid + Shopify CLI hints)
  shopify-app        Remix Shopify app skeleton (Admin GraphQL ready)
  wordpress-plugin   Plugin scaffold with Steadyflow commerce hooks
  wordpress-theme    Block-theme starter for WooCommerce storefronts
`);
}

if (cmd !== 'scaffold') {
  usage();
  process.exit(1);
}

const kind = args[1];
const dest = args[2];
const nameArg = args.find((a) => a.startsWith('--name='));
const name = nameArg ? nameArg.slice('--name='.length) : undefined;

if (!kind || !dest) {
  usage();
  process.exit(1);
}

try {
  const result = await scaffold({ kind, dest, name });
  console.log(`Scaffolded ${result.kind} → ${result.dest}`);
  for (const tip of result.nextSteps) {
    console.log(`  • ${tip}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

// Allow importing this file in tests without executing when not main.
void pathToFileURL;
