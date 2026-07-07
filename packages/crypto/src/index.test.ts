import { describe, it, expect } from 'vitest';
import { PLACEHOLDER } from './index.js';

describe('@steadyflow/crypto', () => {
  it('placeholder', () => {
    expect(PLACEHOLDER).toBe(true);
  });
});
