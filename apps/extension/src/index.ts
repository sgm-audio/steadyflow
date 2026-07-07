/**
 * @steadyflow/extension — Chrome MV3 Extension.
 *
 * Provides one-click Shopify store analysis from the browser.
 *
 * Entrypoints:
 *   - src/background/worker.ts  — service worker (auth, context menu, API)
 *   - src/popup/popup.ts        — popup UI (auth, page info, submit)
 *   - src/content/capture.ts    — content script (page data extraction)
 *   - src/lib/supabase.ts       — Supabase auth client
 *   - src/lib/api.ts            — SteadyFlow BFF API client
 */

export const VERSION = '0.1.0';
