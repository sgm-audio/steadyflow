/**
 * B2 — Theme lint from public homepage HTML.
 *
 * `@shopify/theme-check-node` needs Liquid source (`read_themes`). The audit
 * only has a public storefront fetch, so this is a static HTML proxy for the
 * theme-check rules that still fire on rendered markup.
 *
 * Upgrade path: swap the HTML regexes for theme-check when Admin theme
 * files are in the audit path.
 */

export type ThemeLintSeverity = 'high' | 'medium';

export interface ThemeLintIssue {
  code: string;
  severity: ThemeLintSeverity;
  message: string;
}

export interface ThemeLintResult {
  issueCount: number;
  highCount: number;
  issues: ThemeLintIssue[];
}

const IMG_RE = /<img\b[^>]*>/gi;
const HAS_ALT = /\balt\s*=/i;
const HAS_LANG = /<html\b[^>]*\blang\s*=/i;
const HAS_VIEWPORT = /<meta\b[^>]*\bname=["']viewport["']/i;
const HAS_CANONICAL = /<link\b[^>]*\brel=["']canonical["']/i;
const HAS_SKIP = /href=["']#(?:main|content|MainContent|main-content)["']/i;
const DOCUMENT_WRITE = /document\.write\s*\(/i;
const STYLESHEET_RE = /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi;
const SHOPIFY_SECTION = /class=["'][^"']*shopify-section/;

export const lintThemeHtml = (html: string): ThemeLintResult => {
  const issues: ThemeLintIssue[] = [];
  if (html.trim().length === 0) {
    return { issueCount: 0, highCount: 0, issues };
  }

  if (!HAS_LANG.test(html)) {
    issues.push({
      code: 'html_missing_lang',
      severity: 'high',
      message: '<html> is missing a lang attribute.',
    });
  }
  if (!HAS_VIEWPORT.test(html)) {
    issues.push({
      code: 'missing_viewport',
      severity: 'high',
      message: 'No <meta name="viewport"> — mobile layout will not scale.',
    });
  }

  let images = 0;
  let missingAlt = 0;
  for (const match of html.matchAll(IMG_RE)) {
    const tag = match[0];
    if (!tag) continue;
    images += 1;
    if (!HAS_ALT.test(tag)) missingAlt += 1;
  }
  if (images > 0 && missingAlt > 0) {
    issues.push({
      code: 'img_missing_alt',
      severity: missingAlt / images >= 0.5 ? 'high' : 'medium',
      message: `${missingAlt}/${images} <img> tag(s) missing alt.`,
    });
  }

  if (!HAS_SKIP.test(html)) {
    issues.push({
      code: 'missing_skip_link',
      severity: 'medium',
      message: 'No skip-to-content link targeting #main / #content.',
    });
  }
  if (!HAS_CANONICAL.test(html)) {
    issues.push({
      code: 'missing_canonical',
      severity: 'medium',
      message: 'No <link rel="canonical"> on the homepage.',
    });
  }
  if (DOCUMENT_WRITE.test(html)) {
    issues.push({
      code: 'document_write',
      severity: 'high',
      message: 'document.write() present — parser-blocking and theme-check forbidden.',
    });
  }

  const stylesheets = html.match(STYLESHEET_RE)?.length ?? 0;
  if (stylesheets >= 6) {
    issues.push({
      code: 'too_many_stylesheets',
      severity: 'medium',
      message: `${stylesheets} stylesheets — split CSS hurts LCP on Online Store 2.0.`,
    });
  }
  if (!SHOPIFY_SECTION.test(html)) {
    issues.push({
      code: 'no_shopify_sections',
      severity: 'medium',
      message: 'No shopify-section markup — theme may not be Online Store 2.0.',
    });
  }

  return {
    issueCount: issues.length,
    highCount: issues.filter((i) => i.severity === 'high').length,
    issues,
  };
};
