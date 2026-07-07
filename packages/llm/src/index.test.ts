import { describe, it, expect } from 'vitest';
import { DeepseekAdapter } from './index.js';

describe('@steadyflow/llm', () => {
  it('exports DeepseekAdapter', () => {
    expect(DeepseekAdapter).toBeDefined();
  });
});
