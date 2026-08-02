import type { ReadinessRequirement } from './schemas.js';

const REQUIREMENTS_URL = 'https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements';
const PRIVACY_URL = 'https://shopify.dev/docs/apps/launch/privacy-requirements';
const LAST_VERIFIED_ON = '2026-08-02';

const requirement = (id: string, title: string, description: string, verificationMode: 'automatic' | 'manual', url = REQUIREMENTS_URL): ReadinessRequirement => ({
  id, title, description, verificationMode, source: { url, lastVerifiedOn: LAST_VERIFIED_ON },
});

/** Curated universal baseline, not an exhaustive reproduction of Shopify's requirements. */
export const SHOPIFY_APP_STORE_BASELINE_REQUIREMENTS: readonly ReadinessRequirement[] = [
  requirement('shopify.app_store.1.1.4', 'Use factual information', 'Manually verify that product behavior and listing claims are accurate and supportable.', 'manual'),
  requirement('shopify.app_store.1.1.11', 'Keep browser extensions optional', 'Verify that core app functionality does not depend on a browser extension.', 'manual'),
  requirement('shopify.app_store.1.1.12', 'Keep the app web-based', 'Verify from deployable surfaces that a desktop application is not required.', 'automatic'),
  requirement('shopify.app_store.2.1.1', 'Avoid review-blocking errors', 'Exercise review paths and retain test evidence for critical UI and HTTP failures.', 'automatic'),
  requirement('shopify.app_store.2.2.1', 'Use Shopify APIs', 'Verify that the app uses supported Shopify APIs for its merchant functionality.', 'automatic'),
  requirement('shopify.app_store.2.2.3', 'Use the current App Bridge', 'Inspect the embedded app entry document for the current App Bridge integration.', 'automatic'),
  requirement('shopify.app_store.2.2.4', 'Use the GraphQL Admin API', 'Verify that a new public app does not use the legacy REST Admin API.', 'automatic'),
  requirement('shopify.app_store.2.3', 'Provide Shopify-managed installation', 'Manually review installation, authentication, redirect, reinstall, and uninstall behavior.', 'manual'),
  requirement('shopify.app_store.3.1.1', 'Use valid TLS', 'Verify deployed app endpoints use HTTPS with a valid certificate.', 'automatic'),
  requirement('shopify.app_store.3.2', 'Request only necessary scopes', 'Manually map every requested scope to required product functionality and evidence.', 'manual'),
  requirement('shopify.app_store.4', 'Provide an accurate App Store listing', 'Manually review naming, pricing, claims, assets, support details, and reviewer instructions.', 'manual'),
  requirement('shopify.privacy.policy', 'Publish an accurate privacy policy', 'Manually verify the policy matches actual collection, use, retention, and contact practices.', 'manual', PRIVACY_URL),
];
