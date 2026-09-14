import { describe, expect, it } from 'vitest';
import { parseAmazonSpApiCredentials } from './credential.js';

const validJson = JSON.stringify({
  clientId: 'amzn1.application-oa2-client.test',
  clientSecret: 'amzn1.otoken.test',
  refreshToken: 'Atzr|refresh-token',
  awsAccessKeyId: 'AKIDEXAMPLE',
  awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  sellerId: 'A1SELLERID',
  marketplaceIds: ['ATVPDKIKX0DER'],
});

describe('parseAmazonSpApiCredentials', () => {
  it('parses a JSON credential envelope and defaults region to na', () => {
    const creds = parseAmazonSpApiCredentials(validJson);
    expect(creds.sellerId).toBe('A1SELLERID');
    expect(creds.region).toBe('na');
    expect(creds.marketplaceIds).toEqual(['ATVPDKIKX0DER']);
  });

  it('accepts an explicit region', () => {
    const creds = parseAmazonSpApiCredentials(
      JSON.stringify({ ...JSON.parse(validJson), region: 'eu' }),
    );
    expect(creds.region).toBe('eu');
  });

  it('rejects an invalid JSON envelope loudly (no silent fallback)', () => {
    expect(() => parseAmazonSpApiCredentials('{not json')).toThrow();
  });

  it('rejects missing required fields', () => {
    const partial = JSON.stringify({ clientId: 'x' });
    expect(() => parseAmazonSpApiCredentials(partial)).toThrow();
  });

  it('rejects unknown keys (strictObject boundary)', () => {
    const extra = JSON.stringify({ ...JSON.parse(validJson), hunterKey: 'removed' });
    expect(() => parseAmazonSpApiCredentials(extra)).toThrow();
  });
});
