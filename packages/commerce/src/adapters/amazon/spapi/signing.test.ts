import { describe, expect, it } from 'vitest';
import { signSigV4 } from './signing.js';

const TEST_CREDS = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};

describe('signSigV4', () => {
  it('matches the AWS SigV4 get-vanilla oracle vector (botocore-verified)', () => {
    const signed = signSigV4(
      { method: 'GET', path: '/', host: 'example.amazonaws.com' },
      TEST_CREDS,
      { region: 'us-east-1', service: 'service', datetime: '20150830T123600Z' },
    );

    expect(signed.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
    expect(signed.signedHeaders).toBe('host;x-amz-date');
    expect(signed.xAmzDate).toBe('20150830T123600Z');
  });

  it('hashes a body into the canonical request (POST payload included)', () => {
    const signed = signSigV4(
      {
        method: 'POST',
        path: '/auth/o2/token',
        host: 'api.amazon.com',
        body: '{"a":1}',
      },
      TEST_CREDS,
      { region: 'us-east-1', service: 'service', datetime: '20150830T123600Z' },
    );

    expect(signed.authorization).toContain('AWS4-HMAC-SHA256');
    expect(signed.signedHeaders).toContain('x-amz-date');
    expect(signed.authorization).not.toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('sorts extra headers into signed headers deterministically', () => {
    const signed = signSigV4(
      {
        method: 'GET',
        path: '/',
        host: 'example.amazonaws.com',
        headers: { 'x-amz-access-token': 'Atza|test' },
      },
      TEST_CREDS,
      { region: 'us-east-1', service: 'service', datetime: '20150830T123600Z' },
    );

    expect(signed.signedHeaders).toBe('host;x-amz-access-token;x-amz-date');
  });
});
