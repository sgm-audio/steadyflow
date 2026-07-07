import { describe, it, expect } from 'vitest';
import { PLACEHOLDER } from './index.js';

describe('@steadyflow/sdk', () => {
  it('placeholder', () => {
    expect(PLACEHOLDER).toBe(true);
  });
});
