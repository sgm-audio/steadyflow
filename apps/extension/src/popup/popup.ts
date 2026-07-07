/**
 * Popup UI — auth, page info, submit analysis.
 */

import { getToken, signIn, signOut, getSession } from '../lib/supabase.js';

// ── DOM Elements ────────────────────────────────────────────────────────────

const loginForm = document.getElementById('login-form')!;
const authSection = document.getElementById('authenticated-section')!;
const loginError = document.getElementById('login-error')!;
const userEmail = document.getElementById('user-email')!;
const pageTitle = document.getElementById('page-title')!;
const pageUrl = document.getElementById('page-url')!;
const productCount = document.getElementById('product-count')!;
const pageDesc = document.getElementById('page-desc')!;
const pageMeta = document.getElementById('page-meta')!;
const analyzeBtn = document.getElementById('analyze-btn')!;
const resultSection = document.getElementById('result-section')!;
const resultText = document.getElementById('result-text')!;
const viewDashboard = document.getElementById('view-dashboard')!;

// ── State ───────────────────────────────────────────────────────────────────

let currentUrl = '';

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const token = await getToken();
  if (token) {
    showAuthenticated();
    await loadPageInfo();
  } else {
    showLogin();
  }

  // Login form
  document.getElementById('login')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('email') as HTMLInputElement).value;
    const password = (document.getElementById('password') as HTMLInputElement).value;
    try {
      await signIn(email, password);
      showAuthenticated();
      await loadPageInfo();
    } catch (err) {
      loginError.textContent = err instanceof Error ? err.message : 'Login failed';
      loginError.classList.remove('hidden');
    }
  });

  // Logout
  document.getElementById('logout-btn')!.addEventListener('click', async () => {
    await signOut();
    showLogin();
  });

  // Analyze
  analyzeBtn.addEventListener('click', handleAnalyze);

  // Dashboard links
  const dashUrl = 'http://127.0.0.1:3000/dashboard';
  document.getElementById('dashboard-link')!.setAttribute('href', dashUrl);
  viewDashboard.setAttribute('href', dashUrl);
});

// ── Page Info ───────────────────────────────────────────────────────────────

const loadPageInfo = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    currentUrl = tab.url ?? '';

    // Get page info from content script
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_PAGE' });

    if (response && !response.error) {
      pageTitle.textContent = response.title ?? 'Unknown';
      pageUrl.textContent = response.url ?? '';
      pageMeta.classList.remove('hidden');

      if (response.productCount > 0) {
        productCount.textContent = `${response.productCount} products detected`;
      } else {
        productCount.textContent = 'No product grid detected';
      }
      pageDesc.textContent = response.description ?? '';
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

    const res = await fetch('http://127.0.0.1:54321/functions/v1/intel/analyze-shop', {
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
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
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
  getSession().then((session) => {
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
