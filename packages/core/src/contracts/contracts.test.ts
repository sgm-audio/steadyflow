import { describe, expect, it } from 'vitest';
import {
  analyzeShop,
  auditQuery,
  intentCancel,
  intentList,
  keysList,
  keysSet,
  keysTest,
  listInsights,
  orgLlmConfigGet,
  orgLlmConfigSet,
  reportGenerate,
  trackingCheck,
} from './procedures.js';
import { router, type ProcedureName } from './router.js';

describe('Router', () => {
  it('exports all 12 procedures', () => {
    const expected: ProcedureName[] = [
      'intel.analyzeShop',
      'insights.list',
      'audit.query',
      'keys.set',
      'keys.list',
      'keys.test',
      'org.llmConfig.get',
      'org.llmConfig.set',
      'intent.cancel',
      'intent.list',
      'report.generate',
      'intel.trackingCheck',
    ];
    for (const name of expected) {
      expect(router[name]).toBeDefined();
    }
  });

  it('every procedure declares auth, rateLimit, idempotent', () => {
    for (const name of Object.keys(router) as ProcedureName[]) {
      const proc = router[name];
      expect(['required', 'optional', 'none']).toContain(proc.auth);
      expect(['standard', 'strict', 'unlimited']).toContain(proc.rateLimit);
      expect(typeof proc.idempotent).toBe('boolean');
    }
  });
});

describe('trackingCheck', () => {
  it('accepts a shopify platform url', () => {
    const r = trackingCheck.input.safeParse({
      platform: 'shopify',
      url: 'https://example.myshopify.com',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a non-platform url', () => {
    const r = trackingCheck.input.safeParse({
      url: 'https://example.com',
    });
    expect(r.success).toBe(false);
  });
});

describe('analyzeShop', () => {
  it('requires platform, url, idempotencyKey', () => {
    const r = analyzeShop.input.safeParse({
      platform: 'shopify',
      url: 'https://example.myshopify.com',
      idempotencyKey: 'k1',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing idempotencyKey', () => {
    const r = analyzeShop.input.safeParse({
      platform: 'shopify',
      url: 'https://example.myshopify.com',
    });
    expect(r.success).toBe(false);
  });

  it('output requires intentId and status', () => {
    const r = analyzeShop.output.safeParse({
      intentId: '00000000-0000-4000-8000-000000000001',
      status: 'queued',
    });
    expect(r.success).toBe(true);
  });
});

describe('listInsights', () => {
  it('defaults limit to 20', () => {
    const r = listInsights.input.parse({});
    expect(r.limit).toBe(20);
  });

  it('caps limit at 100', () => {
    expect(() => listInsights.input.parse({ limit: 101 })).toThrow();
  });

  it('accepts category filter', () => {
    const r = listInsights.input.parse({ category: 'pricing' });
    expect(r.category).toBe('pricing');
  });
});

describe('auditQuery', () => {
  it('defaults limit to 50', () => {
    const r = auditQuery.input.parse({});
    expect(r.limit).toBe(50);
  });

  it('accepts action and outcome filters', () => {
    const r = auditQuery.input.parse({
      action: 'scrape.firecrawl',
      outcome: 'success',
    });
    expect(r.action).toBe('scrape.firecrawl');
    expect(r.outcome).toBe('success');
  });
});

describe('keysSet', () => {
  it('accepts a provider and raw key', () => {
    const r = keysSet.input.safeParse({
      provider: 'firecrawl',
      rawKey: 'sk-test-key',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty raw key', () => {
    const r = keysSet.input.safeParse({
      provider: 'firecrawl',
      rawKey: '',
    });
    expect(r.success).toBe(false);
  });
});

describe('keysList', () => {
  it('accepts empty input', () => {
    const r = keysList.input.parse({});
    expect(r).toEqual({});
  });
});

describe('keysTest', () => {
  it('requires provider', () => {
    const r = keysTest.input.safeParse({ provider: 'firecrawl' });
    expect(r.success).toBe(true);
  });

  it('output includes latencyMs', () => {
    const r = keysTest.output.parse({
      provider: 'firecrawl',
      ok: true,
      latencyMs: 42,
    });
    expect(r.latencyMs).toBe(42);
  });
});

describe('orgLlmConfig', () => {
  it('get accepts empty input', () => {
    const r = orgLlmConfigGet.input.parse({});
    expect(r).toEqual({});
  });

  it('set requires provider and defaultModel', () => {
    const r = orgLlmConfigSet.input.safeParse({
      provider: 'deepseek',
      defaultModel: 'deepseek-chat',
    });
    expect(r.success).toBe(true);
  });
});

describe('intentCancel', () => {
  it('requires intentId', () => {
    const r = intentCancel.input.safeParse({
      intentId: '00000000-0000-4000-8000-000000000001',
    });
    expect(r.success).toBe(true);
  });
});

describe('intentList', () => {
  it('defaults limit to 20', () => {
    const r = intentList.input.parse({});
    expect(r.limit).toBe(20);
  });

  it('accepts kind and status filters', () => {
    const r = intentList.input.parse({
      kind: 'analyze_shop',
      status: 'succeeded',
    });
    expect(r.kind).toBe('analyze_shop');
    expect(r.status).toBe('succeeded');
  });
});

describe('reportGenerate', () => {
  it('requires intentId', () => {
    const r = reportGenerate.input.safeParse({
      intentId: '00000000-0000-4000-8000-000000000001',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a non-uuid intentId', () => {
    const r = reportGenerate.input.safeParse({ intentId: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('is idempotent', () => {
    expect(reportGenerate.idempotent).toBe(true);
  });
});
