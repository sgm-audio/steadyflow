/**
 * Chrome Extension background service worker.
 *
 * Responsibilities:
 *   1. Manage auth state (login/logout/session refresh)
 *   2. Register context menu ("Analyze with SteadyFlow")
 *   3. Handle context menu clicks → capture page → submit intent
 *   4. Relay messages between popup and content scripts
 */

import { getToken, signIn, signOut } from '../lib/supabase.js';
import { analyzeShop } from '../lib/api.js';

// ── Context Menu ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'steadyflow-analyze',
    title: 'Analyze this shop with SteadyFlow',
    contexts: ['page'],
    documentUrlPatterns: ['https://*.shopify.com/*', 'https://*.myshopify.com/*'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'steadyflow-analyze' && tab?.id) {
    await analyzeCurrentPage(tab.id, tab.url ?? '');
  }
});

// ── Message Handlers ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'GET_AUTH_STATUS':
      getToken().then((token) => sendResponse({ authenticated: !!token }));
      return true; // async response

    case 'LOGIN':
      signIn(message.email, message.password)
        .then(() => sendResponse({ success: true }))
        .catch((err: Error) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'LOGOUT':
      signOut().then(() => sendResponse({ success: true }));
      return true;

    case 'GET_PAGE_INFO':
      if (_sender.tab?.id) {
        capturePage(_sender.tab.id)
          .then((info) => sendResponse(info))
          .catch((err: Error) => sendResponse({ error: err.message }));
        return true;
      }
      sendResponse({ error: 'No tab' });
      return false;

    case 'ANALYZE_CURRENT':
      if (message.url) {
        submitAnalysis(message.url, message.platform ?? 'shopify')
          .then((result) => sendResponse({ success: true, ...result }))
          .catch((err: Error) => sendResponse({ success: false, error: err.message }));
        return true;
      }
      sendResponse({ error: 'No URL' });
      return false;

    default:
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

// ── Page Capture ───────────────────────────────────────────────────────────

interface PageInfo {
  url: string;
  title: string;
  description: string;
  productCount: number;
  metaTags: Array<{ name: string; content: string }>;
}

const capturePage = async (tabId: number): Promise<PageInfo> => {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const description = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
      const metaTags = Array.from(document.querySelectorAll('meta[name], meta[property]')).map((m) => ({
        name: (m.getAttribute('name') ?? m.getAttribute('property') ?? ''),
        content: m.getAttribute('content') ?? '',
      }));
      const productCount = document.querySelectorAll('[data-product-id], .product-item, .grid-product').length;

      return {
        url: window.location.href,
        title: document.title,
        description,
        productCount: productCount || 0,
        metaTags: metaTags.slice(0, 20),
      };
    },
  });

  const [injection] = results;
  if (!injection) throw new Error('Script injection failed');
  return injection.result as PageInfo;
};

// ── Analysis Submission ────────────────────────────────────────────────────

const submitAnalysis = async (url: string, platform: string) => {
  const result = await analyzeShop({
    platform,
    url,
    idempotencyKey: `ext-${Date.now()}`,
    requiresAuth: false,
  });
  return result;
};

const analyzeCurrentPage = async (_tabId: number, url: string) => {
  try {
    const token = await getToken();
    if (!token) {
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'SteadyFlow',
        message: 'Please sign in to analyze this shop.',
      });
      return;
    }

    const result = await submitAnalysis(url, 'shopify');

    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'SteadyFlow — Analysis Started',
      message: `Intent created: ${(result as { intentId: string }).intentId.slice(0, 8)}... View results in the dashboard.`,
    });
  } catch (err) {
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'SteadyFlow — Error',
      message: err instanceof Error ? err.message : 'Analysis failed',
    });
  }
};
