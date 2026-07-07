/**
 * Integration tests for all BFF handlers.
 *
 * Runs against local Supabase (supabase start required).
 * Each test creates a fresh Supabase client with the seed user's JWT.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  analyzeShop, listInsights, auditQuery,
  keysSet, keysList, keysTest,
  orgLlmConfigGet, orgLlmConfigSet,
  intentList, intentCancel,
  handleCors, type HandlerCtx,
} from './handlers.js';

const URL = 'http://127.0.0.1:54321';
const KEY = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const ORG_ID = '22222222-2222-2222-2222-222222222222';

let supabase: ReturnType<typeof createClient>;

const ctx = (body: unknown = {}): HandlerCtx => ({
  req: new Request('http://localhost/functions/v1/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  supabase,
  userId: USER_ID,
  orgId: ORG_ID,
  body,
});

const getCtx = (method = 'GET', search = ''): HandlerCtx => ({
  req: new Request(`http://localhost/functions/v1/test${search ? `?${search}` : ''}`, { method }),
  supabase,
  userId: USER_ID,
  orgId: ORG_ID,
  body: {},
});

beforeAll(async () => {
  // Create service_role client for write operations
  supabase = createClient(URL, KEY);
});

// ── CORS ───────────────────────────────────────────────────────────────────

describe('handleCors', () => {
  it('returns preflight response for OPTIONS', () => {
    const res = handleCors(new Request('http://localhost', { method: 'OPTIONS' }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(204);
  });

  it('returns null for non-OPTIONS', () => {
    expect(handleCors(new Request('http://localhost', { method: 'GET' }))).toBeNull();
  });
});

// ── analyzeShop ─────────────────────────────────────────────────────────────

describe('analyzeShop', () => {
  it('creates an intent and enqueues scrape', async () => {
    const res = await analyzeShop(ctx({
      platform: 'shopify',
      url: 'https://demo.myshopify.com',
      idempotencyKey: `test-${Date.now()}`,
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.intentId).toBeDefined();
    expect(body.status).toBe('queued');
  });

  it('returns existing intent on duplicate key', async () => {
    const key = `dup-${Date.now()}`;
    const r1 = await analyzeShop(ctx({ platform: 'shopify', url: 'https://x.com', idempotencyKey: key }));
    const b1 = await r1.json();
    const r2 = await analyzeShop(ctx({ platform: 'shopify', url: 'https://x.com', idempotencyKey: key }));
    const b2 = await r2.json();
    expect(b1.intentId).toBe(b2.intentId);
  });

  it('rejects invalid URL', async () => {
    const res = await analyzeShop(ctx({ platform: 'shopify', url: 'not-a-url', idempotencyKey: `bad-${Date.now()}` }));
    expect(res.status).toBe(400);
  });

  it('rejects missing fields', async () => {
    const res = await analyzeShop(ctx({ platform: 'shopify' }));
    expect(res.status).toBe(400);
  });
});

// ── insights/list ───────────────────────────────────────────────────────────

describe('listInsights', () => {
  it('returns empty list when no insights exist', async () => {
    const res = await listInsights(getCtx('GET', 'limit=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeUndefined();
  });

  it('rejects invalid category', async () => {
    const res = await listInsights(getCtx('GET', 'category=invalid&limit=5'));
    expect(res.status).toBe(400);
  });
});

// ── audit/query ─────────────────────────────────────────────────────────────

describe('auditQuery', () => {
  it('returns paginated audit log', async () => {
    const res = await auditQuery(getCtx('GET', 'limit=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });
});

// ── keys/set + keys/list + keys/test ────────────────────────────────────────

describe('keys', () => {
  const provider = 'firecrawl';

  it('sets and lists a key', async () => {
    const setRes = await keysSet(ctx({
      provider,
      wrappedKey: 'dGVzdC1rZXk=', // base64 "test-key"
      iv: 'AAAAAAAAAAAA', // 12 bytes base64
      dekWrapped: 'dGVzdC1kZWstZW5jcnlwdGVk',
      dekSalt: 'dGVzdC1zYWx0',
      kdfParams: { algo: 'argon2id', mem: 19456, t: 2, p: 1 },
    }));

    expect(setRes.status).toBe(200);

    const listRes = await keysList(getCtx());
    expect(listRes.status).toBe(200);
    const items = await listRes.json();
    expect(items.some((k: { provider: string }) => k.provider === provider)).toBe(true);
  });

  it('tests a stored key', async () => {
    const res = await keysTest(ctx({ provider }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns 404 for non-existent provider', async () => {
    const res = await keysTest(ctx({ provider: 'hunter' }));
    expect(res.status).toBe(404);
  });
});

// ── org/llm-config ─────────────────────────────────────────────────────────

describe('orgLlmConfig', () => {
  it('gets config (returns whatever was last set)', async () => {
    const res = await orgLlmConfigGet(getCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBeDefined();
    expect(body.defaultModel).toBeDefined();
  });

  it('sets and gets new config', async () => {
    const setRes = await orgLlmConfigSet(ctx({
      provider: 'deepseek',
      defaultModel: 'deepseek-v4-flash',
    }));
    expect(setRes.status).toBe(200);

    const getRes = await orgLlmConfigGet(getCtx());
    const body = await getRes.json();
    expect(body.defaultModel).toBe('deepseek-v4-flash');
  });
});

// ── intent/list + intent/cancel ─────────────────────────────────────────────

describe('intents', () => {
  it('lists intents', async () => {
    const res = await intentList(getCtx('GET', 'limit=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('cancels an intent', async () => {
    // Create then cancel
    const create = await analyzeShop(ctx({
      platform: 'shopify',
      url: 'https://cancel-test.myshopify.com',
      idempotencyKey: `cancel-${Date.now()}`,
    }));
    const created = await create.json();

    const res = await intentCancel(ctx({ intentId: created.intentId }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('cancelled');
  });

  it('returns 404 for non-existent intent', async () => {
    const res = await intentCancel(ctx({ intentId: '00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(404);
  });
});
