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

// eslint-disable-next-line @typescript-eslint/no-deprecated
chrome.runtime.onInstalled.addListener(() => {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  chrome.contextMenus.create({
    id: 'steadyflow-analyze',
    title: 'Analyze this shop with SteadyFlow',
    contexts: ['page'],
    documentUrlPatterns: ['https://*.shopify.com/*', 'https://*.myshopify.com/*'],
  });
});

// eslint-disable-next-line @typescript-eslint/no-deprecated
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'steadyflow-analyze' && tab?.id) {
    analyzeCurrentPage(tab.id, tab.url ?? '').catch(() => undefined);
  }
});

// ── Message Handlers ───────────────────────────────────────────────────────

interface ExtMessage {
  type: string;
  email?: string;
  password?: string;
  url?: string;
  platform?: string;
}

// eslint-disable-next-line @typescript-eslint/no-deprecated
chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
  const message = rawMessage as ExtMessage;

  const sendSuccess = (data?: Record<string, unknown>): void => {
    sendResponse({ success: true, ...data });
  };
  const sendError = (err: unknown): void => {
    sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
  };

  switch (message.type) {
    case 'GET_AUTH_STATUS':
      void getToken().then((token) => { sendResponse({ authenticated: !!token }); });
      return true; // async response

    case 'LOGIN':
      if (message.email && message.password) {
        void signIn(message.email, message.password)
          .then(() => { sendSuccess(); })
          .catch((err: unknown) => { sendError(err); });
      }
      return true;

    case 'LOGOUT':
      void signOut().then(() => { sendResponse({ success: true }); });
      return true;

    case 'GET_PAGE_INFO':
      if (_sender.tab?.id) {
        void capturePage(_sender.tab.id)
          .then((info) => { sendResponse(info); })
          .catch((err: unknown) => { sendResponse({ error: err instanceof Error ? err.message : String(err) }); });
        return true;
      }
      sendResponse({ error: 'No tab' });
      return false;

    case 'ANALYZE_CURRENT':
      if (message.url) {
        void submitAnalysis(message.url, message.platform ?? 'shopify')
          .then((result) => { sendResponse({ success: true, ...result }); })
          .catch((err: unknown) => { sendError(err); });
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
  metaTags: { name: string; content: string }[];
}

const capturePage = async (tabId: number): Promise<PageInfo> => {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
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
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'SteadyFlow',
        message: 'Please sign in to analyze this shop.',
      });
      return;
    }

    const result = await submitAnalysis(url, 'shopify') as { intentId: string };

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'SteadyFlow — Analysis Started',
      message: `Intent created: ${result.intentId.slice(0, 8)}... View results in the dashboard.`,
    });
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'SteadyFlow — Error',
      message: err instanceof Error ? err.message : 'Analysis failed',
    });
  }
};
