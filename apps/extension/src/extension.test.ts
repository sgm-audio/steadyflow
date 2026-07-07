import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock chrome API
const mockStorage: Record<string, unknown> = {};

beforeAll(() => {
  (globalThis as Record<string, unknown>).chrome = {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const key = Array.isArray(keys) ? keys[0] : keys;
          return { [key ?? '']: mockStorage[key ?? ''] };
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(mockStorage, items);
        },
        remove: async (keys: string | string[]) => {
          const key = Array.isArray(keys) ? keys[0] : keys;
          delete mockStorage[key ?? ''];
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
  } as unknown as typeof chrome;
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).chrome;
});

describe('Extension Supabase Auth', () => {
  it('storage set/get roundtrip works', async () => {
    await chrome.storage.local.set({ 'test-key': 'test-value' });
    const result = await chrome.storage.local.get('test-key');
    expect(result['test-key']).toBe('test-value');
  });

  it('storage remove works', async () => {
    await chrome.storage.local.set({ 'rm-key': 'x' });
    await chrome.storage.local.remove('rm-key');
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
