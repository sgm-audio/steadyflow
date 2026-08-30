/**
 * report/generate — Generate (or return the existing) client-facing report
 * for an intent.
 *
 * POST /report/generate
 * Auth: required
 * Body: { intentId: string }
 *
 * One report per intent. If a report already exists, it's returned as-is
 * (idempotent) rather than regenerated — findings are re-derived fresh
 * from the intent's current insights each time, since the per-finding
 * enrichment (confidence/remediation/effort/access) is a pure function of
 * fields already on the insight row, not something worth persisting and
 * keeping in sync separately.
 *
 * Mirrors @steadyflow/core's report schema + enrichment rules
 * (packages/core/src/report/enrich.ts) inline — Deno can't resolve the
 * local workspace package the way Node can, so this is kept in sync by
 * contract tests, matching every other Edge Function in this repo.
 */

import { z } from 'npm:zod@3';
import {
  badRequest,
  createContext,
  handleCors,
  internalError,
  notFound,
  ok,
  parseInput,
  writeAudit,
} from '../_shared/context.ts';

const ReportGenerateInput = z.object({
  intentId: z.string().uuid(),
});

type InsightCategory =
  | 'pricing'
  | 'positioning'
  | 'product_mix'
  | 'marketing'
  | 'seo'
  | 'conversion'
  | 'inventory'
  | 'trend'
  | 'ai_agent_readiness'
  | 'first_sale_math'
  | 'channel_gap'
  | 'creator_playbook';
type InsightRow = {
  id: string;
  category: InsightCategory;
  severity: 'low' | 'medium' | 'high';
  title: string;
  body: string;
  citations: Array<{ sourceId: string; url?: string; excerpt?: string }>;
  model: string;
  provider: string;
  generated_at: string;
};

const REMEDIATION_BY_CATEGORY: Record<InsightCategory, string> = {
  pricing:
    'Review pricing against competitor benchmarks and adjust margins where this finding flags a gap.',
  positioning:
    'Refine product or brand messaging to close the positioning gap this finding identifies.',
  product_mix: 'Reorganize the affected catalog or collection structure to address this finding.',
  marketing: 'Update marketing copy or channels to address this finding.',
  seo: 'Add or correct the missing metadata, alt text, or structured data this finding flags.',
  conversion:
    'Adjust the affected page or checkout flow to remove the friction this finding identifies.',
  inventory:
    'Update the affected product or variant data (weight, stock, shipping fields) this finding flags.',
  trend: 'Monitor this trend and revisit pricing or positioning if it persists.',
  ai_agent_readiness:
    'Submit product feed to Google Merchant Center, add JSON-LD Product schema, allow AI crawler bots in robots.txt, and enable Shop Pay / Google Pay for AI-native checkout.',
  first_sale_math:
    'Calculate break-even ROAS from your actual Printify costs + Shopify pricing, then choose the cheapest CPA channel (Meta/TikTok, not Google Shopping) that clears break-even at 2% conversion.',
  channel_gap:
    'You are only selling through Shopify. Expand to Etsy (built-in traffic, $0.20 listing), TikTok Shop (1,000-follower threshold, zero-fee discovery), and Google free listings (via Merchant Center) to add three new zero-CAC channels.',
  creator_playbook:
    'Find 3-5 micro-creators in your niche (1k-50k followers), send free product + $50-150 per post, and repurpose their content as paid ad creative. Gifting + small payment delivers 2.3x engagement vs gifting alone.',
};

const EFFORT_BY_CATEGORY: Record<InsightCategory, 'small' | 'medium' | 'large'> = {
  pricing: 'small',
  positioning: 'medium',
  product_mix: 'medium',
  marketing: 'medium',
  seo: 'small',
  conversion: 'medium',
  inventory: 'small',
  trend: 'small',
  ai_agent_readiness: 'medium',
  first_sale_math: 'small',
  channel_gap: 'medium',
  creator_playbook: 'medium',
};

const ACCESS_BY_CATEGORY: Record<InsightCategory, string[]> = {
  pricing: ['Shopify Admin (Products)'],
  positioning: [],
  product_mix: ['Shopify Admin (Products, Collections)'],
  marketing: ['Shopify Admin (Online Store)'],
  seo: ['Shopify Admin (Online Store, Themes)'],
  conversion: ['Shopify Admin (Online Store)'],
  inventory: ['Shopify Admin (Products, Inventory)', 'Printify (optional, for cost sync)'],
  trend: [],
  ai_agent_readiness: ['Google Merchant Center', 'Shopify Admin (Online Store, Themes)'],
  first_sale_math: ['Shopify Admin (Products)', 'Printify (required, for cost data)'],
  channel_gap: ['Etsy account', 'TikTok Shop account', 'Google Merchant Center'],
  creator_playbook: ['TikTok account', 'social media accounts'],
};

const computeFindingConfidence = (
  insight: Pick<InsightRow, 'citations' | 'provider' | 'severity'>,
): number => {
  let score = 0.55;
  if (insight.citations.length > 0) score += 0.2;
  if (insight.provider === 'shopify-admin') score += 0.15;
  if (insight.severity === 'high' && insight.citations.length === 0) score -= 0.1;
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
};

const enrichFinding = (row: InsightRow) => ({
  id: row.id,
  category: row.category,
  severity: row.severity,
  title: row.title,
  body: row.body,
  citations: row.citations,
  model: row.model,
  provider: row.provider,
  generatedAt: row.generated_at,
  confidence: computeFindingConfidence(row),
  remediation: REMEDIATION_BY_CATEGORY[row.category],
  effortEstimate: EFFORT_BY_CATEGORY[row.category],
  requiredAccess: ACCESS_BY_CATEGORY[row.category],
});

const buildExecutiveSummary = (findings: InsightRow[]): string => {
  if (findings.length === 0) {
    return 'No findings were generated for this audit. The store may already meet the checks performed, or the analysis did not surface actionable issues.';
  }
  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byCategory = new Map<string, number>();
  for (const f of findings) {
    bySeverity[f.severity] += 1;
    byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
  }
  const topCategories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat.replace('_', ' '));

  return [
    `This audit surfaced ${findings.length} finding${findings.length === 1 ? '' : 's'} — ${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low severity.`,
    `The largest concentrations are in ${topCategories.join(', ')}.`,
    bySeverity.high > 0
      ? 'The high-severity findings should be prioritized first, as they carry the most direct revenue or operational risk.'
      : 'No high-severity findings were identified; remaining items are lower-priority improvements.',
  ].join(' ');
};

const buildSprintRecommendation = (findings: InsightRow[]): string => {
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;

  if (highCount >= 3) {
    return `Recommend a fixed-price remediation sprint to address the ${highCount} high-severity findings — bundling related fixes typically completes in one sprint and de-risks the largest revenue-impacting issues first.`;
  }
  if (highCount > 0) {
    return `Recommend a scoped fix for the ${highCount} high-severity finding${highCount === 1 ? '' : 's'} rather than a full sprint — the remaining ${mediumCount} medium-severity item${mediumCount === 1 ? '' : 's'} can be addressed incrementally.`;
  }
  if (mediumCount > 0) {
    return `No sprint recommended — the ${mediumCount} medium-severity finding${mediumCount === 1 ? '' : 's'} can be self-serviced or scheduled as routine maintenance.`;
  }
  return "No sprint recommended — findings are low-priority and can be addressed at the store owner's convenience.";
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const ctx = await createContext(req);
  if (ctx instanceof Response) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const parsed = parseInput(ReportGenerateInput, body);
  if (!parsed.ok) return badRequest(parsed.error.message);
  const { intentId } = parsed.value;

  const { data: intent, error: intentError } = await ctx.supabase
    .from('intents')
    .select('id, org_id')
    .eq('id', intentId)
    .eq('org_id', ctx.orgId)
    .single();
  if (intentError || !intent) return notFound('Intent');

  const { data: insights, error: insightsError } = await ctx.supabase
    .from('insights')
    .select('id, category, severity, title, body, citations, model, provider, generated_at')
    .eq('intent_id', intentId)
    .order('generated_at', { ascending: false });
  if (insightsError) return internalError(insightsError.message);

  const rows = (insights ?? []) as InsightRow[];
  const startMs = Date.now();

  const { data: existing } = await ctx.supabase
    .from('reports')
    .select(
      'id, org_id, intent_id, executive_summary, sprint_recommendation, first_sale_plan, finding_count, generated_at',
    )
    .eq('intent_id', intentId)
    .maybeSingle();

  const findings = rows.map(enrichFinding);

  if (existing) {
    return ok({
      id: existing.id,
      orgId: existing.org_id,
      intentId: existing.intent_id,
      executiveSummary: existing.executive_summary,
      sprintRecommendation: existing.sprint_recommendation,
      firstSalePlan: (existing as { first_sale_plan?: unknown }).first_sale_plan ?? undefined,
      findingCount: existing.finding_count,
      generatedAt: existing.generated_at,
      findings,
    });
  }

  const executiveSummary = buildExecutiveSummary(rows);
  const sprintRecommendation = buildSprintRecommendation(rows);

  const { data: created, error: createError } = await ctx.supabase
    .from('reports')
    .insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      executive_summary: executiveSummary,
      sprint_recommendation: sprintRecommendation,
      finding_count: rows.length,
      generated_by: ctx.userId,
    })
    .select(
      'id, org_id, intent_id, executive_summary, sprint_recommendation, first_sale_plan, finding_count, generated_at',
    )
    .single();
  if (createError || !created)
    return internalError(`Failed to store report: ${createError?.message ?? 'unknown error'}`);

  writeAudit(ctx.supabase, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: 'report.generate',
    outcome: 'success',
    input: { intentId },
    durationMs: Date.now() - startMs,
  }).catch(() => {});

  return ok({
    id: created.id,
    orgId: created.org_id,
    intentId: created.intent_id,
    executiveSummary: created.executive_summary,
    sprintRecommendation: created.sprint_recommendation,
    firstSalePlan: (created as { first_sale_plan?: unknown }).first_sale_plan ?? undefined,
    findingCount: created.finding_count,
    generatedAt: created.generated_at,
    findings,
  });
});
