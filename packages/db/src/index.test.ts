import { describe, expect, it } from 'vitest';
import type { Database } from './index.js';

describe('@steadyflow/db', () => {
  it('exposes the generated Database type with the expected tables', () => {
    // Compile-time check: fails to typecheck if the generated schema
    // drops a table the rest of the codebase depends on.
    type PublicTables = keyof Database['public']['Tables'];
    const expected: PublicTables[] = [
      'orgs',
      'memberships',
      'intents',
      'sources',
      'insights',
      'keys_envelopes',
      'audit_log',
      'rate_limits',
      'devices',
    ];
    expect(expected.length).toBe(9);
  });
});
