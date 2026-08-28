/**
 * Deterministic revenue-optimization logic for the Shopify catalog audit.
 *
 * These pure functions were extracted from `workers.ts` (a 1,400-line god
 * module) so they can be unit-tested in isolation. None of them touch
 * Supabase or the network — they map audit signals to an AI-readiness score,
 * a first-sale math breakdown, and a prioritized 30-day playbook.
 */

export interface PageSeoSignals {
  hasMetaDescription: boolean;
  metaDescriptionLength: number;
  hasStructuredData: boolean;
  hasSitemap: boolean;
  hasRobotsTxt: boolean;
  allowsOaiSearchBot: boolean;
  allowsPerplexityBot: boolean;
  hasProductSchema: boolean;
  hasGtin: boolean;
}

export interface AiReadiness {
  score: number;
  chatgptShopping: boolean;
  googleAiMode: boolean;
  perplexityShopping: boolean;
  productSchemaPresent: boolean;
  gtinOnProducts: boolean;
  merchantCenterConnected: boolean;
  shopPayEnabled: boolean;
  googlePayEnabled: boolean;
}

export const computeAiReadiness = (
  signals: PageSeoSignals,
  _audit: { totalProducts: number },
): AiReadiness => {
  const productSchemaPresent = signals.hasProductSchema;
  const gtinOnProducts = signals.hasGtin;
  const chatgptShopping = true; // Shopify stores are auto-integrated via Shop Pay
  const googleAiMode = signals.hasSitemap;
  const perplexityShopping = signals.allowsPerplexityBot || signals.hasProductSchema;
  const shopPayEnabled = true; // Shopify stores have this out of the box
  const googlePayEnabled = signals.hasSitemap;

  let score = 50; // Shopify baseline
  if (productSchemaPresent) score += 15;
  if (gtinOnProducts) score += 10;
  if (signals.allowsOaiSearchBot) score += 10;
  if (signals.allowsPerplexityBot) score += 5;
  if (signals.hasSitemap) score += 5;
  if (signals.hasMetaDescription) score += 5;

  return {
    score: Math.min(100, score),
    chatgptShopping,
    googleAiMode,
    perplexityShopping,
    productSchemaPresent,
    gtinOnProducts,
    merchantCenterConnected: false,
    shopPayEnabled,
    googlePayEnabled,
  };
};

export interface FirstSaleMath {
  grossMarginPct: number;
  breakEvenRoas: number;
  recommendedChannel: string;
  recommendedCpc: number;
  clicksForFirstSale: number;
  estimatedFirstSaleCost: number;
  dailyBudget: number;
}

export const computeFirstSaleMath = (
  audit: { rows: { margin: { marginPct: number | null } }[] },
): FirstSaleMath | null => {
  const withMargin = audit.rows.filter((r) => r.margin.marginPct !== null);
  if (withMargin.length === 0) return null;

  const grossMarginPct = withMargin.reduce((sum, r) => sum + (r.margin.marginPct ?? 0), 0) / withMargin.length;
  const breakEvenRoas = grossMarginPct > 0 ? 1 / (grossMarginPct / 100) : 4.0;

  // Channel CPC benchmarks (from Triple Whale + WordStream 2025/2026)
  const metaCpc = 0.45; // Fashion/apparel on Meta
  const tiktokCpc = 0.50; // Typical TikTok Spark Ads
  const googleCpc = 4.44; // Google Ads apparel

  let recommendedChannel: string;
  let recommendedCpc: number;
  if (grossMarginPct >= 60) {
    recommendedChannel = 'Google Shopping + Meta';
    recommendedCpc = googleCpc;
  } else if (grossMarginPct >= 25) {
    recommendedChannel = 'Meta (Facebook/Instagram)';
    recommendedCpc = metaCpc;
  } else {
    recommendedChannel = 'TikTok Spark Ads';
    recommendedCpc = tiktokCpc;
  }

  const conversionRate = 0.02; // 2% median for paid traffic
  const clicksForFirstSale = Math.ceil(1 / conversionRate); // 50 clicks
  const estimatedFirstSaleCost = clicksForFirstSale * recommendedCpc;
  const dailyBudget = Math.max(10, Math.round(estimatedFirstSaleCost / 3));

  return {
    grossMarginPct,
    breakEvenRoas: Math.round(breakEvenRoas * 10) / 10,
    recommendedChannel,
    recommendedCpc,
    clicksForFirstSale,
    estimatedFirstSaleCost: Math.round(estimatedFirstSaleCost),
    dailyBudget,
  };
};

/**
 * Deterministic first-sale playbook — works without an LLM key.
 * Returns a 30-day prioritized action plan with channel-specific steps.
 */
export const buildFirstSalePlaybook = (
  aiReadiness: AiReadiness,
  firstSaleMath: FirstSaleMath | null,
  storeName: string,
): Record<string, unknown> => {
  const actions: Record<string, unknown>[] = [];

  // Immediate actions (Day 1)
  if (!aiReadiness.productSchemaPresent) {
    actions.push({
      step: actions.length + 1, channel: 'ai_agents', priority: 'immediate',
      action: 'Add JSON-LD Product schema to all product pages (name, image, price, availability, GTIN/SKU, aggregateRating). This feeds ChatGPT Shopping, Google AI Mode, Perplexity, and Copilot simultaneously.',
      estimatedBudget: 'Free (theme edit or free SEO app)', estimatedTimeToResult: '1-7 days for AI crawlers to index',
    });
  }
  actions.push({
    step: actions.length + 1, channel: 'ai_agents', priority: 'immediate',
    action: 'Submit product feed to Google Merchant Center. One feed covers Google AI Mode (0% fee), Google free listings, and Bing/Copilot. Include GTINs, product highlights, shipping weight, return policy.',
    estimatedBudget: 'Free (Google Merchant Center)', estimatedTimeToResult: '2-5 days for feed approval',
  });
  if (!aiReadiness.chatgptShopping) {
    actions.push({
      step: actions.length + 1, channel: 'ai_agents', priority: 'immediate',
      action: 'Allow OAI-SearchBot in robots.txt — add "User-agent: OAI-SearchBot\nAllow: /" so ChatGPT can crawl your products.',
      estimatedBudget: 'Free (theme liquid edit)', estimatedTimeToResult: '1-2 days for crawl',
    });
  }

  // Week 1 actions
  actions.push({
    step: actions.length + 1, channel: 'etsy', priority: 'week_1',
    action: `Create Etsy shop and connect Printify. List your top 5-10 products with SEO-optimized titles (all 13 tags used) and lifestyle mockups. Etsy has 90M+ active buyers searching for unique designs. Fees: $0.20/listing + 6.5% transaction.`,
    estimatedBudget: '$0-5 startup cost', estimatedTimeToResult: '3-14 days to first sale',
  });
  actions.push({
    step: actions.length + 1, channel: 'tiktok', priority: 'week_1',
    action: 'Create TikTok business account. Post 1-2 videos/day: design-process timelapses, niche skits, unboxings. Use trending sounds in your niche. Target: 1,000 followers in 2-4 weeks to unlock TikTok Shop.',
    estimatedBudget: 'Free (organic content)', estimatedTimeToResult: '2-4 weeks to 1,000 followers',
  });
  actions.push({
    step: actions.length + 1, channel: 'email_sms', priority: 'week_1',
    action: 'Install email capture popup (15-30% capture rate). Set up abandoned-cart email sequence (10.7% recovery rate). At 70% cart abandonment, recovering even 5 carts/month = serious revenue for a new store.',
    estimatedBudget: 'Free-20/month (Shopify Email or Klaviyo free tier)', estimatedTimeToResult: 'Immediate capture; first recovery within 1-3 days',
  });

  // Week 2
  actions.push({
    step: actions.length + 1, channel: 'creators', priority: 'week_2',
    action: 'Find 3-5 micro-creators (1k-50k followers) in your niche. Send free product in exchange for a TikTok/IG Reel. Budget $50-150 per creator for paid usage rights. Total: <$1,000 for full content library you can repurpose as ads.',
    estimatedBudget: '$150-750 total', estimatedTimeToResult: '1-2 weeks for content delivery',
  });

  // Month 1
  if (firstSaleMath) {
    actions.push({
      step: actions.length + 1, channel: 'ads', priority: 'month_1',
      action: `Launch ${firstSaleMath.recommendedChannel} ads at $${firstSaleMath.dailyBudget}/day. Use creator content as ad creative (Spark Ads on TikTok, Advantage+ on Meta). Target CPC <$${firstSaleMath.recommendedCpc.toFixed(2)}. Break-even ROAS: ${firstSaleMath.breakEvenRoas.toFixed(1)}×. Expected first-sale cost: ~$${firstSaleMath.estimatedFirstSaleCost} at 2% conversion. Start AFTER you have 10-20 organic posts that got engagement — ads amplify what already works.`,
      estimatedBudget: `$${firstSaleMath.dailyBudget}/day`, estimatedTimeToResult: '1-7 days to first sale',
    });
  }
  actions.push({
    step: actions.length + 1, channel: 'pinterest', priority: 'month_1',
    action: 'Repurpose TikTok/Reels as Pinterest Idea Pins. Pinterest users are deliberate buyers — higher conversion intent. Tag products with Rich Pins. Free organic reach.',
    estimatedBudget: 'Free', estimatedTimeToResult: '2-4 weeks for Pinterest SEO traction',
  });

  return {
    breakEvenRoas: firstSaleMath?.breakEvenRoas,
    grossMarginPct: firstSaleMath?.grossMarginPct,
    recommendedChannel: firstSaleMath?.recommendedChannel,
    dailyBudgetRange: firstSaleMath ? `$${firstSaleMath.dailyBudget}/day` : '$10-20/day',
    actions,
    aiPlatformsAudit: {
      chatgptShopping: aiReadiness.chatgptShopping,
      googleAiMode: aiReadiness.googleAiMode,
      perplexityShopping: aiReadiness.perplexityShopping,
      productSchemaPresent: aiReadiness.productSchemaPresent,
      gtinOnProducts: aiReadiness.gtinOnProducts,
      merchantCenterConnected: aiReadiness.merchantCenterConnected,
    },
    generatedForStore: storeName,
  };
};
