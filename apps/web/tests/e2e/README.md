# SteadyFlow v0.x Operator Dashboard Playwright Tests

This directory contains end-to-end (E2E) tests for the SteadyFlow operator dashboard using Playwright.

## Test Coverage

The tests verify the primary revenue audit workflow as defined in the SteadyFlow v1 Scope Decision:

1. **Login** - Authentication and session management
2. **Configure provider keys** - BYOK setup for Shopify, Firecrawl, Tavily, LLM providers
3. **Create Shopify audit intent** - Submit store URL for analysis
4. **Worker processes real store data** - Queue processing verification
5. **Findings appear as insights** - Results visibility
6. **Audit events are visible** - Audit trail verification
7. **Report generation readiness** - Data completeness check

## Interface States Tested

- ✅ Loading states
- ✅ Empty states  
- ✅ Error states
- ✅ Partial result states
- ✅ Completed states
- ✅ Cancelled states
- ✅ Provider authentication failure states

## Required Routes

All routes from the scope document are tested:
- `/login`
- `/dashboard`
- `/intents`
- `/intents/[id]`
- `/insights`
- `/audit`
- `/keys`
- `/keys/[provider]`
- `/settings`

## Running Tests

### Prerequisites

1. Install Playwright browsers (requires ~200MB disk space):
```bash
cd apps/web
npx playwright install chromium
```

2. Set up environment variables (optional, defaults provided):
```bash
export STEADYFLOW_BASE_URL=http://localhost:3000
export STEADYFLOW_TEST_EMAIL=dev@steadyflow.local
export STEADYFLOW_TEST_PASSWORD=password123
export STEADYFLOW_SHOPIFY_STORE_URL=https://makingmadi.myshopify.com
```

### Test Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run tests with browser UI (headed mode)
npm run test:e2e:headed

# Run specific test file
npx playwright test tests/e2e/workflow.spec.ts

# Run specific test by name
npx playwright test --grep "complete audit workflow"

# Run on specific browser
npx playwright test --project=chromium

# Generate HTML report
npx playwright show-report
```

## Test Structure

### `workflow.spec.ts`

Primary workflow tests covering:

1. **Complete audit workflow** - End-to-end flow from login to insights
2. **Error state - invalid login** - Authentication failure handling
3. **Empty state - new organization** - First-time user experience
4. **Provider key configuration** - BYOK setup flow
5. **Navigation verification** - All required routes accessible

## CI/CD Integration

The configuration includes:
- Retry logic for flaky tests (2 retries on CI)
- Trace collection on first retry
- Screenshots on failure
- Video recording on failure
- HTML reporter for review

## Making Madi Validation

These tests are designed to validate the system against the Making Madi Shopify store. Update the environment variables to point to your test instance:

```bash
export STEADYFLOW_SHOPIFY_STORE_URL=https://makingmadi.myshopify.com
```

## Troubleshooting

### Disk Space Issues

If you encounter `ENOSPC` errors during browser installation:
```bash
# Check available space
df -h

# Clean up node_modules if needed
rm -rf node_modules
npm install
```

### Test Failures

Common causes:
1. Server not running - Start dev server: `npm run dev`
2. Wrong credentials - Check environment variables
3. Database not seeded - Ensure Supabase is configured
4. Network issues - Check connectivity to Shopify/store URLs

### Debugging

```bash
# Run with debug output
DEBUG=pw:api npx playwright test

# Run single test in headed mode with slow motion
npx playwright test --headed --debug --slowmo 1000
```

## Future Enhancements

- [ ] Add visual regression tests
- [ ] Add performance timing assertions
- [ ] Add accessibility tests
- [ ] Add mobile viewport tests
- [ ] Add multi-user concurrent session tests
