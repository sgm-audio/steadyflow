import { describe, expect, it } from 'vitest';
import { PLACEHOLDER } from './index.js';

describe('@steadyflow/desktop', () => {
  it('placeholder', () => {
    expect(PLACEHOLDER).toBe(true);
  });
});
