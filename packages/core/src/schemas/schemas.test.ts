import { describe, it, expect } from 'vitest';
import { PlatformUrl } from './platform.js';
import { Shop, ShopHandle, ShopifyShop, EtsyShop } from './shop.js';
import { Product } from './product.js';
import { Insight } from './insight.js';
import { Intent } from './intent.js';
import { AuditEvent } from './auditEvent.js';
import { Provider, LlmProvider } from './provider.js';

describe('PlatformUrl', () => {
  it('accepts a valid URL', () => {
    const r = PlatformUrl.parse({
      platform: 'shopify',
      url: 'https://example.myshopify.com',
      requiresAuth: false,
    });
    expect(r.platform).toBe('shopify');
  });

  it('rejects invalid URL', () => {
    expect(() => PlatformUrl.parse({ platform: 'etsy', url: 'not-a-url', requiresAuth: false })).toThrow();
  });

  it('defaults requiresAuth to false', () => {
    const r = PlatformUrl.parse({ platform: 'etsy', url: 'https://etsy.com/shop/foo' });
    expect(r.requiresAuth).toBe(false);
  });
});

describe('Shop', () => {
  it('parses a Shopify shop', () => {
    const s = Shop.parse({
      platform: 'shopify',
      id: '00000000-0000-0000-0000-000000000001',
      handle: 'demo-store',
      domain: 'demo.myshopify.com',
      name: 'Demo',
      capturedAt: new Date().toISOString(),
    });
    expect(s.platform).toBe('shopify');
  });

  it('parses an Etsy shop', () => {
    const s = Shop.parse({
      platform: 'etsy',
      id: '00000000-0000-0000-0000-000000000002',
      handle: 'demo-shop',
      name: 'Demo',
      capturedAt: new Date().toISOString(),
    });
    expect(s.platform).toBe('etsy');
  });

  it('rejects unknown platform', () => {
    expect(() =>
      Shop.parse({
        platform: 'amazon',
        id: '00000000-0000-0000-0000-000000000003',
        handle: 'x',
        name: 'X',
        capturedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it('rejects invalid handle', () => {
    expect(() =>
      ShopHandle.parse('bad handle!'),
    ).toThrow();
  });

  it('rejects extra fields (strict)', () => {
    expect(() =>
      ShopifyShop.parse({
        platform: 'shopify',
        id: '00000000-0000-0000-0000-000000000001',
        handle: 'x',
        domain: 'x',
        name: 'X',
        capturedAt: new Date().toISOString(),
        extra: 'nope',
      }),
    ).toThrow();
  });

  it('EtsyShop rejects extra fields', () => {
    expect(() =>
      EtsyShop.parse({
        platform: 'etsy',
        id: '00000000-0000-0000-0000-000000000001',
        handle: 'x',
        name: 'X',
        capturedAt: new Date().toISOString(),
        extra: 'nope',
      }),
    ).toThrow();
  });
});

describe('Product', () => {
  it('parses a minimal product', () => {
    const p = Product.parse({
      id: '00000000-0000-0000-0000-000000000001',
      platform: 'shopify',
      externalId: 'gid://shopify/Product/1',
      title: 'Mug',
      url: 'https://example.com/p/mug',
      capturedAt: new Date().toISOString(),
    });
    expect(p.images).toEqual([]);
    expect(p.tags).toEqual([]);
  });

  it('rejects negative price', () => {
    expect(() =>
      Product.parse({
        id: '00000000-0000-0000-0000-000000000001',
        platform: 'shopify',
        externalId: '1',
        title: 'Mug',
        url: 'https://example.com/p/mug',
        price: { amount: -1, currency: 'USD' },
        capturedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

describe('Insight', () => {
  it('parses a valid insight', () => {
    const i = Insight.parse({
      id: '00000000-0000-0000-0000-000000000001',
      category: 'pricing',
      severity: 'high',
      title: 'Underpriced',
      body: 'Your average price is 20% below category median.',
      citations: [{ sourceId: '00000000-0000-0000-0000-000000000002' }],
      model: 'deepseek-chat',
      provider: 'deepseek',
      generatedAt: new Date().toISOString(),
    });
    expect(i.severity).toBe('high');
  });
});

describe('Intent', () => {
  it('parses a queued intent', () => {
    const i = Intent.parse({
      id: '00000000-0000-0000-0000-000000000001',
      orgId: '00000000-0000-0000-0000-000000000002',
      userId: '00000000-0000-0000-0000-000000000003',
      kind: 'analyze_shop',
      status: 'queued',
      inputHash: 'a'.repeat(64),
      idempotencyKey: 'k1',
      insightIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(i.status).toBe('queued');
  });

  it('rejects bad inputHash length', () => {
    expect(() =>
      Intent.parse({
        id: '00000000-0000-0000-0000-000000000001',
        orgId: '00000000-0000-0000-0000-000000000002',
        userId: '00000000-0000-0000-0000-000000000003',
        kind: 'analyze_shop',
        status: 'queued',
        inputHash: 'short',
        idempotencyKey: 'k1',
        insightIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

describe('AuditEvent', () => {
  it('parses a success event', () => {
    const e = AuditEvent.parse({
      id: '00000000-0000-0000-0000-000000000001',
      orgId: '00000000-0000-0000-0000-000000000002',
      userId: '00000000-0000-0000-0000-000000000003',
      action: 'scrape.firecrawl',
      outcome: 'success',
      inputHash: 'a'.repeat(64),
      durationMs: 100,
      metadata: {},
      createdAt: new Date().toISOString(),
    });
    expect(e.outcome).toBe('success');
  });
});

describe('Provider', () => {
  it('accepts all known providers', () => {
    for (const p of ['firecrawl', 'hunter', 'tavily', 'deepseek', 'nvidia-nim', 'groq', 'openai-compatible'] as const) {
      expect(Provider.parse(p)).toBe(p);
    }
  });

  it('rejects unknown provider', () => {
    expect(() => Provider.parse('openai')).toThrow();
  });

  it('LlmProvider excludes non-LLM providers', () => {
    expect(() => LlmProvider.parse('firecrawl')).toThrow();
  });
});
