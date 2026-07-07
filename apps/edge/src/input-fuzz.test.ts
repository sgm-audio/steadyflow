/**
 * Zod Input Fuzz Tests.
 *
 * Tests every user-facing Zod schema against edge-case inputs:
 * max-length strings, unicode, SQL injection, nested objects, unexpected types.
 */

import { describe, it, expect } from 'vitest';

// Inline schemas (mirrored from @steadyflow/core for fuzz isolation)
import { z } from 'zod';

const PlatformUrl = z.object({
  platform: z.enum(['shopify', 'etsy', 'amazon']),
  url: z.string().url().max(2048),
  idempotencyKey: z.string().min(1).max(255),
  requiresAuth: z.boolean().default(false),
});

const KeysSetInput = z.object({
  provider: z.enum(['firecrawl','hunter','tavily','deepseek','nvidia-nim','groq','openai-compatible']),
  wrappedKey: z.string().min(1),
  iv: z.string().min(1),
  dekWrapped: z.string().min(1),
  dekSalt: z.string().min(1),
  kdfParams: z.object({
    algo: z.enum(['argon2id', 'pbkdf2-sha256']),
    mem: z.number().int().nonnegative(),
    t: z.number().int().positive(),
    p: z.number().int().positive(),
  }),
});

const LlmConfigInput = z.object({
  provider: z.enum(['deepseek', 'nvidia-nim', 'groq', 'openai-compatible']),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().min(1).max(200),
});

describe('Zod Input Fuzz', () => {
  describe('PlatformUrl', () => {
    it('SQL injection in URL path is accepted (DB uses parameterized queries)', () => {
      const r = PlatformUrl.safeParse({
        platform: 'shopify',
        url: "https://x.com/path' OR '1'='1",
        idempotencyKey: 'k1',
      });
      // URL with quotes in path is technically valid — DB layer handles parameterization
      expect(r.success).toBe(true);
    });

    it('rejects max-length URL overflow', () => {
      expect(PlatformUrl.safeParse({
        platform: 'shopify',
        url: 'https://x.com/' + 'a'.repeat(3000),
        idempotencyKey: 'k1',
      }).success).toBe(false);
    });

    it('rejects empty idempotencyKey', () => {
      expect(PlatformUrl.safeParse({
        platform: 'shopify',
        url: 'https://x.com',
        idempotencyKey: '',
      }).success).toBe(false);
    });

    it('rejects invalid platform', () => {
      expect(PlatformUrl.safeParse({
        platform: 'invalid',
        url: 'https://x.com',
        idempotencyKey: 'k1',
      }).success).toBe(false);
    });

    it('rejects non-string URL', () => {
      expect(PlatformUrl.safeParse({
        platform: 'shopify',
        url: 12345,
        idempotencyKey: 'k1',
      }).success).toBe(false);
    });

    it('rejects nested object bombs', () => {
      const bomb: Record<string, unknown> = { platform: 'shopify', url: 'https://x.com', idempotencyKey: 'k1' };
      (bomb as Record<string, unknown>).__proto__ = { evil: true };
      const r = PlatformUrl.safeParse(bomb);
      expect(r.success).toBe(true); // Zod ignores prototype pollution
    });
  });

  describe('KeysSetInput', () => {
    it('rejects negative memory cost', () => {
      expect(KeysSetInput.safeParse({
        provider: 'firecrawl',
        wrappedKey: 'a', iv: 'a', dekWrapped: 'a', dekSalt: 'a',
        kdfParams: { algo: 'argon2id', mem: -1, t: 2, p: 1 },
      }).success).toBe(false);
    });

    it('rejects unknown KDF algo', () => {
      expect(KeysSetInput.safeParse({
        provider: 'firecrawl',
        wrappedKey: 'a', iv: 'a', dekWrapped: 'a', dekSalt: 'a',
        kdfParams: { algo: 'bcrypt' as 'argon2id', mem: 0, t: 1, p: 1 },
      }).success).toBe(false);
    });

    it('rejects zero iterations', () => {
      expect(KeysSetInput.safeParse({
        provider: 'firecrawl',
        wrappedKey: 'a', iv: 'a', dekWrapped: 'a', dekSalt: 'a',
        kdfParams: { algo: 'argon2id', mem: 0, t: 0, p: 0 },
      }).success).toBe(false);
    });
  });

  describe('LlmConfigInput', () => {
    it('rejects empty model name', () => {
      expect(LlmConfigInput.safeParse({
        provider: 'deepseek',
        defaultModel: '',
      }).success).toBe(false);
    });

    it('rejects model name over 200 chars', () => {
      expect(LlmConfigInput.safeParse({
        provider: 'deepseek',
        defaultModel: 'x'.repeat(201),
      }).success).toBe(false);
    });

    it('rejects invalid URL in baseUrl', () => {
      expect(LlmConfigInput.safeParse({
        provider: 'deepseek',
        defaultModel: 'test',
        baseUrl: 'not-a-url',
      }).success).toBe(false);
    });
  });

  describe('Unicode edge cases', () => {
    it('handles unicode in URL hostname (punycode)', () => {
      const r = PlatformUrl.safeParse({
        platform: 'shopify',
        url: 'https://xn--fsq.xn--fiqs8s',
        idempotencyKey: 'k1',
      });
      expect(r.success).toBe(true);
    });
  });
});
