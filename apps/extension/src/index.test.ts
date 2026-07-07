import { describe, it, expect } from 'vitest';
import { VERSION } from './index.js';

describe('@steadyflow/extension', () => {
  it('exports version', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
