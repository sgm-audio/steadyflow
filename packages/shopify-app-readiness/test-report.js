/**
 * Test script to verify the Shopify App Store Readiness Report Generator
 */
const generateReport = require('./index').generateReport;

// Sample data for testing
const sampleRegistry = [
  {
    id: 'req-001',
    name: 'Shopify Storefront API Access',
    description: 'Required access to Shopify Storefront API',
    status: 'required',
    version: '2024.0',
    verified_at: '2024-01-01T00:00:00Z',
    details_url: 'https://shopify.dev/docs/api/storefront'
  },
  {
    id: 'req-002',
    name: 'Product Listing API',
    description: 'Required access to Product Listing API',
    status: 'required',
    version: '2024.0',
    verified_at: '2024-01-01T00:00:00Z',
    details_url: 'https://shopify.dev/docs/api/product-listing'
  }
];

const sampleCheckResults = [
  {
    id: 'check-001',
    name: 'API Connectivity Test',
    status: 'pass',
    message: 'API connectivity test passed',
    source_url: 'https://example.com/test-results/api-connectivity'
  },
  {
    id: 'check-002',
    name: 'Product Data Validation',
    status: 'warning',
    message: 'Some product data validation warnings detected',
    source_url: 'https://example.com/test-results/product-validation'
  }
];

const sampleManualReviews = [
  {
    id: 'review-001',
    reviewer: 'jane.doe@example.com',
    status: 'completed',
    comments: 'Manual review completed successfully',
    timestamp: '2024-01-01T00:00:00Z',
    evidence_url: 'https://example.com/reviews/001.pdf'
  }
];

const sampleAppMetadata = {
  name: 'Test Shopify App',
  description: 'A test application for Shopify integration',
  developer: 'Test Developer',
  repository_url: 'https://github.com/testorg/test-shopify-app',
  commit_sha: 'abc123def456',
  target_platform: 'shopify',
  sdk_version: '1.0.0',
  api_version: '2024-01'
};

const sampleScanTimestamp = '2024-01-01T00:00:00Z';

// Generate report
const report = generateReport(
  sampleRegistry, 
  sampleCheckResults, 
  sampleManualReviews, 
  sampleAppMetadata, 
  sampleScanTimestamp
);

console.log('Report Generated Successfully:');
console.log('Executive Summary:', report.executive_summary);
console.log('Readiness Status:', report.readiness.overall_status);
console.log('Blocker Count:', report.readiness.blocker_count);
console.log('Warning Count:', report.readiness.warning_count);
console.log('Manual Review Count:', report.readiness.manual_review_count);
console.log('Findings Count:', report.findings.all_items.length);