import { describe, it, expect } from 'vitest';
import { PLACEHOLDER } from './index.js';

describe('@steadyflow/extension', () => {
  it('placeholder', () => {
    expect(PLACEHOLDER).toBe(true);
  });
});
