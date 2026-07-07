import { describe, it, expect } from 'vitest';
import { PLACEHOLDER } from './index.js';

describe('@steadyflow/llm', () => {
  it('placeholder', () => {
    expect(PLACEHOLDER).toBe(true);
  });
});
