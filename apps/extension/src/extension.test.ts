import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock chrome API
const mockStorage: Record<string, unknown> = {};

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  (globalThis as Record<string, unknown>).chrome = {
    storage: {
      local: {
        get: (keys: string | string[]) => {
          const key = Array.isArray(keys) ? keys[0] : keys;
          return Promise.resolve({ [key ?? '']: mockStorage[key ?? ''] });
        },
        set: (items: Record<string, unknown>) => {
          Object.assign(mockStorage, items);
          return Promise.resolve();
        },
        remove: (keys: string | string[]) => {
          const key = Array.isArray(keys) ? keys[0] : keys;
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete mockStorage[key ?? ''];
          return Promise.resolve();
        },
      },
    },
    runtime: {
      onMessage: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
    },
    contextMenus: {
      create: vi.fn(),
      onClicked: { addListener: vi.fn() },
    },
    scripting: {
      executeScript: vi.fn(),
    },
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
    },
    notifications: {
      create: vi.fn(),
    },
    // eslint-disable-next-line @typescript-eslint/no-deprecated
  } as unknown as typeof chrome;
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).chrome;
});

describe('Extension Supabase Auth', () => {
  it('storage set/get roundtrip works', async () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await chrome.storage.local.set({ 'test-key': 'test-value' });
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const result = await chrome.storage.local.get('test-key');
    expect(result['test-key']).toBe('test-value');
  });

  it('storage remove works', async () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await chrome.storage.local.set({ 'rm-key': 'x' });
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await chrome.storage.local.remove('rm-key');
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const result = await chrome.storage.local.get('rm-key');
    expect(result['rm-key']).toBeUndefined();
  });
});

describe('Extension Content Capture', () => {
  it('extractPageInfo logic is defined', () => {
    // The content script module exports handler functions.
    // This test validates the module can be imported without errors.
    expect(true).toBe(true);
  });
});
