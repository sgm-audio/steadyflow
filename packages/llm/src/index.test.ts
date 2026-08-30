import { describe, expect, it } from 'vitest';
import { DeepseekAdapter } from './index.js';

describe('@steadyflow/llm', () => {
  it('exports DeepseekAdapter', () => {
    expect(DeepseekAdapter).toBeDefined();
  });
});
