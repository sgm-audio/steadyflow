import { describe, it, expect } from 'vitest';
import { PLACEHOLDER } from './index.js';

describe('@steadyflow/edge', () => {
  it('placeholder', () => {
    expect(PLACEHOLDER).toBe(true);
  });
});
