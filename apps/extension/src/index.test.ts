import { describe, expect, it } from 'vitest';
import { VERSION } from './index.js';

describe('@steadyflow/extension', () => {
  it('exports version', () => {
    expect(VERSION).toBe('0.2.0');
  });
});
