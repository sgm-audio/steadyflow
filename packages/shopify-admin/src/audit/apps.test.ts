import { describe, expect, it } from 'vitest';
import type { StorefrontAnalysis } from '../storefront.js';
import { extractAppFingerprints } from './apps.js';

const analysis = (appHosts: StorefrontAnalysis['appHosts']): StorefrontAnalysis => ({
  totalScripts: 0,
  thirdPartyHosts: [],
  appHosts,
  renderBlockingScripts: 0,
  imagesWithoutDimensions: 0,
  totalImages: 0,
  hasPreload: false,
  renderBlockingRisk: 'low',
  layoutShiftRisk: 'low',
  inefficiencyScore: 0,
});

describe('extractAppFingerprints', () => {
  it('returns an empty array when no apps are detected', () => {
    expect(extractAppFingerprints(analysis([]), 'example.myshopify.com')).toEqual([]);
  });

  it('produces one row per detected app', () => {
    const result = extractAppFingerprints(
      analysis([
        { host: 'static.klaviyo.com', count: 1, appName: 'Klaviyo' },
        { host: 'cdn.judge.me', count: 2, appName: 'Judge.me' },
      ]),
      'example.myshopify.com',
    );
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.app_title).sort()).toEqual(['Judge.me', 'Klaviyo']);
  });

  it('collapses multiple hosts of the same app into one row', () => {
    const result = extractAppFingerprints(
      analysis([
        { host: 'static.klaviyo.com', count: 1, appName: 'Klaviyo' },
        { host: 'www.klaviyo.com', count: 1, appName: 'Klaviyo' },
      ]),
      'example.myshopify.com',
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.host_count).toBe(2);
    expect(result[0]?.script_count).toBe(2);
  });

  it('skips hosts without an appName (unknown third-party scripts)', () => {
    const result = extractAppFingerprints(
      analysis([
        { host: 'cdn.example-widget.com', count: 1 }, // no appName
        { host: 'static.klaviyo.com', count: 1, appName: 'Klaviyo' },
      ]),
      'example.myshopify.com',
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.app_title).toBe('Klaviyo');
  });

  it('maps apps to the right category bucket', () => {
    const result = extractAppFingerprints(
      analysis([
        { host: 'static.klaviyo.com', count: 1, appName: 'Klaviyo' },
        { host: 'cdn.judge.me', count: 1, appName: 'Judge.me' },
        { host: 'rechargecdn.com', count: 1, appName: 'Recharge' },
        { host: 'www.googletagmanager.com', count: 1, appName: 'Google Tag Manager' },
      ]),
      'example.myshopify.com',
    );
    const byTitle = Object.fromEntries(result.map((r) => [r.app_title, r.category]));
    expect(byTitle.Klaviyo).toBe('marketing');
    expect(byTitle['Judge.me']).toBe('reviews');
    expect(byTitle.Recharge).toBe('shipping');
    expect(byTitle['Google Tag Manager']).toBe('analytics');
  });

  it('handles unknown apps by bucketing them as "other"', () => {
    const result = extractAppFingerprints(
      analysis([{ host: 'example.com', count: 1, appName: 'Brand-New SaaS' }]),
      'example.myshopify.com',
    );
    expect(result[0]?.category).toBe('other');
  });

  it('produces a stable, URL-safe handle from the app title', () => {
    const result = extractAppFingerprints(
      analysis([{ host: 'rechargecdn.com', count: 1, appName: 'Recharge' }]),
      'example.myshopify.com',
    );
    expect(result[0]?.app_handle).toBe('recharge');
  });

  it('lowercases + hyphenates multi-word titles in the handle', () => {
    const result = extractAppFingerprints(
      analysis([{ host: 'example.com', count: 1, appName: 'Google Tag Manager' }]),
      'example.myshopify.com',
    );
    expect(result[0]?.app_handle).toBe('google-tag-manager');
  });

  it('passes through the shop_domain unchanged', () => {
    const result = extractAppFingerprints(
      analysis([{ host: 'static.klaviyo.com', count: 1, appName: 'Klaviyo' }]),
      'making-madi.myshopify.com',
    );
    expect(result[0]?.shop_domain).toBe('making-madi.myshopify.com');
  });

  it('always sets detection_source to theme_script', () => {
    const result = extractAppFingerprints(
      analysis([{ host: 'static.klaviyo.com', count: 1, appName: 'Klaviyo' }]),
      'example.myshopify.com',
    );
    expect(result[0]?.detection_source).toBe('theme_script');
  });
});
