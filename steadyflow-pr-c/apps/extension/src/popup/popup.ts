/**
 * Popup UI — auth, page info, submit analysis.
 */

import { getToken, signIn, signOut, getSession } from '../lib/supabase.js';

// ── DOM Element helpers ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

const loginForm = $('login-form');
const authSection = $('authenticated-section');
const loginError = $('login-error');
const userEmail = $('user-email');
const pageTitle = $('page-title');
const pageUrl = $('page-url');
const productCount = $('product-count');
const pageDesc = $('page-desc');
const pageMeta = $('page-meta');
const analyzeBtn = $('analyze-btn');
const resultSection = $('result-section');
const resultText = $('result-text');
const viewDashboard = $('view-dashboard');

// ── State ───────────────────────────────────────────────────────────────────

let currentUrl = '';

// ── Init ────────────────────────────────────────────────────────────────────

const handleLoginSubmit = (e: Event) => {
  e.preventDefault();
  const email = (document.getElementById('email') as HTMLInputElement).value;
  const password = (document.getElementById('password') as HTMLInputElement).value;
  void signIn(email, password)
    .then(() => {
      showAuthenticated();
      return loadPageInfo();
    })
    .catch((err: unknown) => {
      loginError.textContent = err instanceof Error ? err.message : 'Login failed';
      loginError.classList.remove('hidden');
    });
};

const handleLogoutClick = () => {
  void signOut().then(() => { showLogin(); });
};

const onReady = () => {
  void (async () => {
    const token = await getToken();
    if (token) {
      showAuthenticated();
      await loadPageInfo();
    } else {
      showLogin();
    }
  })();

  // Login form
  $('login').addEventListener('submit', handleLoginSubmit);

  // Logout
  $('logout-btn').addEventListener('click', handleLogoutClick);

  // Analyze
  analyzeBtn.addEventListener('click', () => { void handleAnalyze(); });

  // Dashboard links
  const dashUrl = 'http://127.0.0.1:3000/dashboard';
  $('dashboard-link').setAttribute('href', dashUrl);
  viewDashboard.setAttribute('href', dashUrl);
};

document.addEventListener('DOMContentLoaded', onReady);

// ── Page Info ───────────────────────────────────────────────────────────────

const loadPageInfo = async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    currentUrl = tab.url ?? '';

    // Get page info from content script
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const response: Record<string, unknown> = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_PAGE' });

    if (!response.error) {
      pageTitle.textContent = typeof response.title === 'string' ? response.title : 'Unknown';
      pageUrl.textContent = typeof response.url === 'string' ? response.url : '';
      pageMeta.classList.remove('hidden');

      const pCount = Number(response.productCount ?? 0);
      if (pCount > 0) {
        productCount.textContent = `${String(pCount)} products detected`;
      } else {
        productCount.textContent = 'No product grid detected';
      }
      pageDesc.textContent = typeof response.description === 'string' ? response.description : '';
    } else {
      // Fallback to tab info
      pageTitle.textContent = tab.title ?? 'Unknown';
      pageUrl.textContent = tab.url ?? '';
    }
  } catch {
    pageTitle.textContent = 'Open a Shopify page';
    pageUrl.textContent = 'Navigate to a Shopify store to analyze it.';
  }
};

// ── Analyze ─────────────────────────────────────────────────────────────────

const handleAnalyze = async () => {
  if (!currentUrl) {
    resultText.textContent = 'No page URL available.';
    resultSection.classList.remove('hidden');
    return;
  }

  analyzeBtn.textContent = 'Submitting...';
  analyzeBtn.setAttribute('disabled', 'true');

  try {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch('http://127.0.0.1:54321/functions/v1/intel-analyze-shop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        platform: 'shopify',
        url: currentUrl,
        idempotencyKey: `popup-${Date.now()}`,
        requiresAuth: false,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(errBody.error?.message ?? `HTTP ${res.status}`);
    }

    const data = await res.json() as { intentId: string; status: string };
    resultText.textContent = `Analysis submitted! Status: ${data.status}`;
    resultSection.classList.remove('hidden');
  } catch (err) {
    resultText.textContent = err instanceof Error ? err.message : 'Submission failed';
    resultSection.classList.remove('hidden');
  } finally {
    analyzeBtn.textContent = 'Analyze This Shop';
    analyzeBtn.removeAttribute('disabled');
  }
};

// ── UI Helpers ──────────────────────────────────────────────────────────────

const showAuthenticated = () => {
  loginForm.classList.add('hidden');
  authSection.classList.remove('hidden');
  void getSession().then((session) => {
    if (session?.user.email) {
      userEmail.textContent = session.user.email;
    }
  });
};

const showLogin = () => {
  loginForm.classList.remove('hidden');
  authSection.classList.add('hidden');
  loginError.classList.add('hidden');
};
