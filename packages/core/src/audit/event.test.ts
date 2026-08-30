import { describe, expect, it } from 'vitest';
import { buildAuditEvent } from './event.js';

describe('buildAuditEvent', () => {
  it('produces a valid AuditEvent', () => {
    const e = buildAuditEvent({
      orgId: '00000000-0000-0000-0000-000000000001',
      userId: '00000000-0000-0000-0000-000000000002',
      action: 'scrape.firecrawl',
      outcome: 'success',
      input: { url: 'https://example.com' },
      provider: 'firecrawl',
      durationMs: 123,
    });
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(e.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(e.action).toBe('scrape.firecrawl');
    expect(e.outcome).toBe('success');
    expect(e.provider).toBe('firecrawl');
    expect(e.durationMs).toBe(123);
  });

  it('hashes redacted input, not raw', () => {
    const e1 = buildAuditEvent({
      orgId: '00000000-0000-0000-0000-000000000001',
      userId: '00000000-0000-0000-0000-000000000002',
      action: 'llm.chat',
      outcome: 'success',
      input: { apiKey: 'sk-secret', prompt: 'hi' },
      durationMs: 1,
    });
    const e2 = buildAuditEvent({
      orgId: '00000000-0000-0000-0000-000000000001',
      userId: '00000000-0000-0000-0000-000000000002',
      action: 'llm.chat',
      outcome: 'success',
      input: { apiKey: 'sk-different', prompt: 'hi' },
      durationMs: 1,
    });
    // Same hash because apiKey is redacted before hashing
    expect(e1.inputHash).toBe(e2.inputHash);
  });
});
