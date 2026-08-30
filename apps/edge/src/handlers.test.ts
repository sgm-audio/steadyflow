/**
 * Integration tests for all BFF handlers.
 *
 * Runs against local Supabase (supabase start required).
 * Each test creates a fresh Supabase client with the seed user's JWT.
 *
 * These tests are automatically excluded when Supabase is not available
 * (see vitest.config.ts for the dynamic availability check).
 */

import type { Database } from '@steadyflow/db';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  analyzeShop,
  auditQuery,
  handleCors,
  intentCancel,
  intentList,
  keysList,
  keysSet,
  keysTest,
  listInsights,
  orgLlmConfigGet,
  orgLlmConfigSet,
  type HandlerCtx,
} from './handlers.js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// Fail closed inside beforeAll (not at module load) so a missing key cannot
// abort Vitest collection of unrelated unit/fuzz suites.
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = process.env.TEST_USER_ID ?? '11111111-1111-1111-1111-111111111111';
const ORG_ID = process.env.TEST_ORG_ID ?? '22222222-2222-2222-2222-222222222222';

let supabase: ReturnType<typeof createClient<Database>>;

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

beforeAll(() => {
  if (!KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for integration tests (set via env / repo-root .env.local; fail closed)',
    );
  }
  // Create service_role client for write operations
  supabase = createClient<Database>(URL, KEY);
});

// Response-shape schemas — parse `res.json()` (typed `any` by the DOM lib)
// instead of asserting through it.
const IntentResponse = z.object({ intentId: z.string(), status: z.string() });
const ListResponse = z.object({ items: z.array(z.unknown()), nextCursor: z.string().optional() });
const KeyListItem = z.object({ provider: z.string() });
const KeysTestResponse = z.object({ provider: z.string(), ok: z.boolean(), latencyMs: z.number() });
const LlmConfigResponse = z.object({
  provider: z.string(),
  baseUrl: z.string().nullable().optional(),
  defaultModel: z.string(),
});
const readJson = async <T>(res: Response, schema: z.ZodType<T>): Promise<T> =>
  schema.parse(await res.json());

// ── CORS ───────────────────────────────────────────────────────────────────

describe('handleCors', () => {
  it('returns preflight response for OPTIONS', () => {
    const res = handleCors(new Request('http://localhost', { method: 'OPTIONS' }));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(204);
  });

  it('returns null for non-OPTIONS', () => {
    expect(handleCors(new Request('http://localhost', { method: 'GET' }))).toBeNull();
  });
});

// ── analyzeShop ─────────────────────────────────────────────────────────────

describe('analyzeShop', () => {
  it('creates an intent and enqueues scrape', async () => {
    const res = await analyzeShop(
      ctx({
        platform: 'shopify',
        url: 'https://demo.myshopify.com',
        idempotencyKey: `test-${Date.now()}`,
      }),
    );

    expect(res.status).toBe(200);
    const body = await readJson(res, IntentResponse);
    expect(body.intentId).toBeDefined();
    expect(body.status).toBe('queued');
  });

  it('returns existing intent on duplicate key', async () => {
    const key = `dup-${Date.now()}`;
    const r1 = await analyzeShop(
      ctx({ platform: 'shopify', url: 'https://x.com', idempotencyKey: key }),
    );
    const b1 = await readJson(r1, IntentResponse);
    const r2 = await analyzeShop(
      ctx({ platform: 'shopify', url: 'https://x.com', idempotencyKey: key }),
    );
    const b2 = await readJson(r2, IntentResponse);
    expect(b1.intentId).toBe(b2.intentId);
  });

  it('rejects invalid URL', async () => {
    const res = await analyzeShop(
      ctx({ platform: 'shopify', url: 'not-a-url', idempotencyKey: `bad-${Date.now()}` }),
    );
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
    const body = await readJson(res, ListResponse);
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
    const body = await readJson(res, ListResponse);
    expect(Array.isArray(body.items)).toBe(true);
  });
});

// ── keys/set + keys/list + keys/test ────────────────────────────────────────

describe('keys', () => {
  const provider = 'firecrawl';

  it('sets and lists a key', async () => {
    const setRes = await keysSet(
      ctx({
        provider,
        rawKey: 'sk-test-key',
      }),
    );

    expect(setRes.status).toBe(200);

    const listRes = await keysList(getCtx());
    expect(listRes.status).toBe(200);
    const items = z.array(KeyListItem).parse(await listRes.json());
    expect(items.some((k) => k.provider === provider)).toBe(true);
  });

  it('tests a stored key', async () => {
    const res = await keysTest(ctx({ provider }));
    expect(res.status).toBe(200);
    const body = await readJson(res, KeysTestResponse);
    expect(body.ok).toBe(true);
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns 404 for non-existent provider', async () => {
    const res = await keysTest(ctx({ provider: 'printify' }));
    expect(res.status).toBe(404);
  });
});

// ── org/llm-config ─────────────────────────────────────────────────────────

describe('orgLlmConfig', () => {
  it('gets config (returns whatever was last set)', async () => {
    const res = await orgLlmConfigGet(getCtx());
    expect(res.status).toBe(200);
    const body = await readJson(res, LlmConfigResponse);
    expect(body.provider).toBeDefined();
    expect(body.defaultModel).toBeDefined();
  });

  it('sets and gets new config', async () => {
    const setRes = await orgLlmConfigSet(
      ctx({
        provider: 'deepseek',
        defaultModel: 'deepseek-v4-flash',
      }),
    );
    expect(setRes.status).toBe(200);

    const getRes = await orgLlmConfigGet(getCtx());
    const body = await readJson(getRes, LlmConfigResponse);
    expect(body.defaultModel).toBe('deepseek-v4-flash');
  });
});

// ── intent/list + intent/cancel ─────────────────────────────────────────────

describe('intents', () => {
  it('lists intents', async () => {
    const res = await intentList(getCtx('GET', 'limit=5'));
    expect(res.status).toBe(200);
    const body = await readJson(res, ListResponse);
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('cancels an intent', async () => {
    // Create then cancel
    const create = await analyzeShop(
      ctx({
        platform: 'shopify',
        url: 'https://cancel-test.myshopify.com',
        idempotencyKey: `cancel-${Date.now()}`,
      }),
    );
    const created = await readJson(create, IntentResponse);

    const res = await intentCancel(ctx({ intentId: created.intentId }));
    expect(res.status).toBe(200);
    const body = await readJson(res, IntentResponse);
    expect(body.status).toBe('cancelled');
  });

  it('returns 404 for non-existent intent', async () => {
    const res = await intentCancel(ctx({ intentId: '00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(404);
  });
});
