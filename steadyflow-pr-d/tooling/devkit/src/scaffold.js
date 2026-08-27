import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = path.join(__dirname, '..', 'templates');

export const SCAFFOLD_KINDS = [
  'shopify-theme',
  'shopify-app',
  'wordpress-plugin',
  'wordpress-theme',
];

/**
 * @param {string} input
 */
export function toSlug(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * @param {string} slug
 */
export function toPhpClass(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('_');
}

/**
 * Recursively copy a template directory, replacing {{NAME}}, {{SLUG}}, {{CLASS}}.
 * @param {string} src
 * @param {string} dest
 * @param {Record<string, string>} vars
 */
function copyTemplate(src, dest, vars) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const toName = entry.name.replace(/__SLUG__/g, vars.SLUG);
    const to = path.join(dest, toName);
    if (entry.isDirectory()) {
      copyTemplate(from, to, vars);
      continue;
    }
    let content = fs.readFileSync(from, 'utf8');
    for (const [key, value] of Object.entries(vars)) {
      content = content.split(`{{${key}}}`).join(value);
    }
    fs.writeFileSync(to, content, 'utf8');
  }
}

/**
 * @param {{ kind: string, dest: string, name?: string }} opts
 */
export function scaffold(opts) {
  const { kind, dest } = opts;
  if (!SCAFFOLD_KINDS.includes(kind)) {
    throw new Error(`Unknown kind '${kind}'. Expected one of: ${SCAFFOLD_KINDS.join(', ')}`);
  }

  const absDest = path.resolve(dest);
  if (fs.existsSync(absDest) && fs.readdirSync(absDest).length > 0) {
    throw new Error(`Destination is not empty: ${absDest}`);
  }

  const baseName = opts.name ?? path.basename(absDest);
  const slug = toSlug(baseName);
  if (!slug) throw new Error('Could not derive a slug from name/dest');

  const vars = {
    NAME: baseName,
    SLUG: slug,
    CLASS: toPhpClass(slug),
    YEAR: String(new Date().getFullYear()),
  };

  const templateDir = path.join(TEMPLATES_ROOT, kind);
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template missing: ${templateDir}`);
  }

  copyTemplate(templateDir, absDest, vars);

  /** @type {string[]} */
  const nextSteps = [];
  if (kind === 'shopify-theme') {
    nextSteps.push('Install Shopify CLI: https://shopify.dev/docs/api/shopify-cli');
    nextSteps.push(`cd ${absDest} && shopify theme dev --store YOUR_STORE.myshopify.com`);
    nextSteps.push('Run Theme Check in VS Code / Cursor (Shopify Theme Check extension)');
  } else if (kind === 'shopify-app') {
    nextSteps.push('Install Shopify CLI and run: shopify app dev');
    nextSteps.push('Set SHOPIFY_API_KEY / SHOPIFY_API_SECRET in .env');
    nextSteps.push('Wire Admin GraphQL via @steadyflow/shopify-admin where possible');
  } else if (kind === 'wordpress-plugin') {
    nextSteps.push(`Symlink or copy into wp-content/plugins/${slug}`);
    nextSteps.push('Activate in WP Admin → Plugins');
  } else if (kind === 'wordpress-theme') {
    nextSteps.push(`Copy into wp-content/themes/${slug} and activate`);
    nextSteps.push('Install WooCommerce if using commerce templates');
  }

  return { kind, dest: absDest, slug, nextSteps };
}

export { TEMPLATES_ROOT };
