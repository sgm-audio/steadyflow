import { describe, expect, it } from 'vitest';
import { assertSafeFetchUrl, isBlockedIpv4, isBlockedIpv6, SsrfBlockedError } from './ssrf.js';

const allow = ['example.com', 'myshopify.com', 'cdn.shopify.com'];

describe('isBlockedIpv4', () => {
  it('blocks private, loopback, link-local, metadata, and reserved ranges', () => {
    expect(isBlockedIpv4('127.0.0.1')).toBe(true);
    expect(isBlockedIpv4('10.0.0.1')).toBe(true);
    expect(isBlockedIpv4('192.168.1.1')).toBe(true);
    expect(isBlockedIpv4('172.16.0.1')).toBe(true);
    expect(isBlockedIpv4('169.254.169.254')).toBe(true); // metadata
    expect(isBlockedIpv4('100.64.0.1')).toBe(true); // CGNAT
    expect(isBlockedIpv4('0.0.0.0')).toBe(true);
  });

  it('allows public IPv4', () => {
    expect(isBlockedIpv4('8.8.8.8')).toBe(false);
    expect(isBlockedIpv4('104.18.0.1')).toBe(false);
  });

  it('returns false for non-IPv4 strings', () => {
    expect(isBlockedIpv4('example.com')).toBe(false);
    expect(isBlockedIpv4('999.1.1.1')).toBe(false);
  });
});

describe('isBlockedIpv6', () => {
  it('blocks loopback, ULA, and link-local', () => {
    expect(isBlockedIpv6('::1')).toBe(true);
    expect(isBlockedIpv6('::')).toBe(true);
    expect(isBlockedIpv6('fe80::1')).toBe(true);
    expect(isBlockedIpv6('fd00::1')).toBe(true);
  });

  it('allows public IPv6', () => {
    expect(isBlockedIpv6('2606:4700::1')).toBe(false);
  });
});

describe('assertSafeFetchUrl', () => {
  it('accepts an allowlisted https URL', () => {
    const r = assertSafeFetchUrl('https://example.com/robots.txt', allow);
    expect(r.hostname).toBe('example.com');
  });

  it('accepts a subdomain of an allowlisted host', () => {
    expect(assertSafeFetchUrl('https://demo.myshopify.com/sitemap.xml', allow).hostname).toBe(
      'demo.myshopify.com',
    );
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => assertSafeFetchUrl('file:///etc/passwd', allow)).toThrow(SsrfBlockedError);
    expect(() => assertSafeFetchUrl('ftp://example.com/x', allow)).toThrow(SsrfBlockedError);
  });

  it('rejects unparseable URLs', () => {
    expect(() => assertSafeFetchUrl('not a url', allow)).toThrow(SsrfBlockedError);
  });

  it('rejects reserved hostnames', () => {
    expect(() => assertSafeFetchUrl('http://localhost/admin', allow)).toThrow(SsrfBlockedError);
    expect(() => assertSafeFetchUrl('http://foo.internal/x', allow)).toThrow(SsrfBlockedError);
  });

  it('rejects private IP literals even if hostname-looking', () => {
    expect(() => assertSafeFetchUrl('http://127.0.0.1:3000/x', allow)).toThrow(SsrfBlockedError);
    expect(() => assertSafeFetchUrl('http://169.254.169.254/latest/meta-data', allow)).toThrow(
      SsrfBlockedError,
    );
  });

  it('rejects hosts outside the allowlist', () => {
    expect(() => assertSafeFetchUrl('https://evil.com/x', allow)).toThrow(SsrfBlockedError);
    expect(() => assertSafeFetchUrl('https://example.com.evil.com/x', allow)).toThrow(
      SsrfBlockedError,
    );
  });
});
