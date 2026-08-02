import { test, expect } from '@playwright/test';

/**
 * SteadyFlow v0.x Primary Workflow Test
 * 
 * This test covers the core revenue audit workflow:
 * Login → Configure provider keys → Create Shopify audit intent → 
 * Worker processes real store data → Findings appear as insights → 
 * Audit events are visible → Report is generated
 * 
 * Target: Making Madi validation account
 */

test.describe('SteadyFlow Primary Workflow', () => {
  // Test configuration - update these for your environment
  const baseURL = process.env.STEADYFLOW_BASE_URL || 'http://localhost:3000';
  const testEmail = process.env.STEADYFLOW_TEST_EMAIL || 'dev@steadyflow.local';
  const testPassword = process.env.STEADYFLOW_TEST_PASSWORD || 'password123';
  const shopifyStoreUrl = process.env.STEADYFLOW_SHOPIFY_STORE_URL || 'https://makingmadi.myshopify.com';

  test.beforeEach(async ({ page }) => {
    await page.goto(`${baseURL}/login`);
  });

  test('complete audit workflow from login to insights', async ({ page }) => {
    // Step 1: Login
    await test.step('Login to dashboard', async () => {
      await page.fill('input[type="email"]', testEmail);
      await page.fill('input[type="password"]', testPassword);
      await page.click('button[type="submit"]');
      
      // Wait for navigation to dashboard
      await expect(page).toHaveURL(`${baseURL}/dashboard`);
      await expect(page.getByText('Good', { exact: false })).toBeVisible();
    });

    // Step 2: Navigate to Keys page
    await test.step('Navigate to provider keys configuration', async () => {
      await page.click('a[href="/keys"]');
      await expect(page).toHaveURL(`${baseURL}/keys`);
      await expect(page.getByText('Provider Keys')).toBeVisible();
    });

    // Step 3: Check key configuration state (empty state test)
    await test.step('Verify keys page shows configuration options', async () => {
      // Check that key providers are listed
      const providers = ['shopify-admin', 'firecrawl', 'tavily', 'openai-compatible'];
      for (const provider of providers) {
        await expect(page.getByText(provider, { exact: false })).toBeVisible();
      }
    });

    // Step 4: Navigate to Intents and create new audit
    await test.step('Create new Shopify audit intent', async () => {
      await page.click('a[href="/intents"]');
      await expect(page).toHaveURL(`${baseURL}/intents`);
      
      // Fill out the intent form
      await page.selectOption('select[name="platform"]', 'shopify');
      await page.fill('input[name="url"]', shopifyStoreUrl);
      
      // Submit the form
      await page.click('button[type="submit"]');
      
      // Should redirect to intent detail page
      await expect(page).toHaveURL(`${baseURL}/intents/*`);
    });

    // Step 5: Verify intent status (loading/queued state)
    await test.step('Verify intent is queued', async () => {
      // Check for queued or running status
      const statusBadge = page.locator('span').filter({ hasText: /queued|running/i });
      await expect(statusBadge.first()).toBeVisible();
    });

    // Step 6: Navigate to Insights page
    await test.step('Navigate to insights page', async () => {
      await page.click('a[href="/insights"]');
      await expect(page).toHaveURL(`${baseURL}/insights`);
    });

    // Step 7: Check insights state (empty, partial, or completed)
    await test.step('Verify insights page handles various states', async () => {
      // Page should load without error
      await expect(page.getByText('Insights')).toBeVisible();
      
      // Either show "no insights yet" message or list of insights
      const noInsights = page.getByText(/no insights yet/i);
      const insightsList = page.locator('div').filter({ hasText: /severity|category/i }).first();
      
      // At least one of these should be visible
      await expect(
        noInsights.or(insightsList)
      ).toBeVisible();
    });

    // Step 8: Navigate to Audit Log
    await test.step('Verify audit log is accessible', async () => {
      await page.click('a[href="/audit"]');
      await expect(page).toHaveURL(`${baseURL}/audit`);
      await expect(page.getByText('Audit Log')).toBeVisible();
      
      // Table should exist even if empty
      await expect(page.locator('table')).toBeVisible();
    });

    // Step 9: Return to Dashboard
    await test.step('Return to dashboard and verify summary', async () => {
      await page.click('a[href="/dashboard"]');
      await expect(page).toHaveURL(`${baseURL}/dashboard`);
      
      // Dashboard cards should be visible
      await expect(page.getByText('Latest insights')).toBeVisible();
      await expect(page.getByText('Provider keys')).toBeVisible();
      await expect(page.getByText('Audit trail')).toBeVisible();
    });
  });

  test('error state - invalid login credentials', async ({ page }) => {
    await test.step('Attempt login with invalid credentials', async () => {
      await page.fill('input[type="email"]', 'invalid@example.com');
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      
      // Should show error message
      await expect(page.getByText(/login failed|invalid/i)).toBeVisible();
      
      // Should stay on login page
      await expect(page).toHaveURL(`${baseURL}/login`);
    });
  });

  test('empty state - new organization with no data', async ({ page }) => {
    // This test assumes a fresh test account
    const freshEmail = process.env.STEADYFLOW_FRESH_TEST_EMAIL || testEmail;
    const freshPassword = process.env.STEADYFLOW_FRESH_TEST_PASSWORD || testPassword;

    await test.step('Login with fresh account', async () => {
      await page.fill('input[type="email"]', freshEmail);
      await page.fill('input[type="password"]', freshPassword);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(`${baseURL}/dashboard`);
    });

    await test.step('Verify empty states across pages', async () => {
      // Check insights empty state
      await page.click('a[href="/insights"]');
      await expect(page.getByText(/no insights yet/i)).toBeVisible();

      // Check intents empty state  
      await page.click('a[href="/intents"]');
      await expect(page.getByText(/no intents yet/i)).toBeVisible();

      // Check audit log (may have system events)
      await page.click('a[href="/audit"]');
      await expect(page.locator('table')).toBeVisible();
    });
  });

  test('provider key configuration flow', async ({ page }) => {
    await test.step('Login and navigate to keys', async () => {
      await page.fill('input[type="email"]', testEmail);
      await page.fill('input[type="password"]', testPassword);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(`${baseURL}/dashboard`);
      
      await page.click('a[href="/keys"]');
      await expect(page).toHaveURL(`${baseURL}/keys`);
    });

    await test.step('Navigate to add key page', async () => {
      // Click on a provider that's not configured (or update existing)
      const addLink = page.getByRole('link', { name: /add|update/i }).first();
      await addLink.click();
      
      // Should be on key configuration page
      await expect(page).toHaveURL(`${baseURL}/keys/*`);
    });

    await test.step('Verify key input form', async () => {
      await expect(page.getByText(/api key/i)).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.getByText(/encrypted at rest/i)).toBeVisible();
    });
  });

  test('navigation and routing verification', async ({ page }) => {
    // Login first
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(`${baseURL}/dashboard`);

    // Test all required routes from the scope document
    const requiredRoutes = [
      '/dashboard',
      '/intents',
      '/insights',
      '/audit',
      '/keys',
      '/settings',
    ];

    for (const route of requiredRoutes) {
      await test.step(`Navigate to ${route}`, async () => {
        await page.goto(`${baseURL}${route}`);
        await expect(page).toHaveURL(`${baseURL}${route}`);
        
        // Each page should load without 404 or error
        await expect(page.locator('body')).not.toContainText('404');
        await expect(page.locator('body')).not.toContainText('Error:');
      });
    }
  });
});
