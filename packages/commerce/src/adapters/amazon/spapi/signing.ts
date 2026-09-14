import { createHash, createHmac } from 'node:crypto';

export interface SignableRequest {
  method: string;
  /** Canonical URI path (already URL-encoded, starts with '/'). */
  path: string;
  /** Canonical query string (sorted, URL-encoded, no leading '?'). */
  query?: string;
  host: string;
  body?: string;
  /** Extra headers to include in the signed set (host + x-amz-date are always included). */
  headers?: Record<string, string>;
}

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface SigV4Scope {
  region: string;
  service: string;
  /** ISO8601 basic format: YYYYMMDDTHHMMSSZ */
  datetime: string;
}

export interface SignedRequestFields {
  authorization: string;
  signedHeaders: string;
  xAmzDate: string;
  payloadHash: string;
}

/**
 * AWS Signature Version 4 request signing (SP-API `execute-api`).
 * Pure function — no I/O, verified against the AWS SigV4 test-suite oracle.
 */
export function signSigV4(
  req: SignableRequest,
  creds: SigV4Credentials,
  scope: SigV4Scope,
): SignedRequestFields {
  const dateStamp = scope.datetime.slice(0, 8);
  const payloadHash = createHash('sha256').update(req.body ?? '').digest('hex');

  const headerMap = new Map<string, string>([
    ['host', req.host],
    ['x-amz-date', scope.datetime],
  ]);
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    headerMap.set(key.toLowerCase(), value.trim());
  }

  const sortedKeys = [...headerMap.keys()].sort();
  const canonicalHeaders = sortedKeys
    .map((k) => `${k}:${headerMap.get(k) ?? ''}\n`)
    .join('');
  const signedHeaders = sortedKeys.join(';');

  const canonicalRequest = [
    req.method,
    req.path,
    req.query ?? '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scopeString = `${dateStamp}/${scope.region}/${scope.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    scope.datetime,
    scopeString,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const kDate = createHmac('sha256', `AWS4${creds.secretAccessKey}`).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(scope.region).digest();
  const kService = createHmac('sha256', kRegion).update(scope.service).digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scopeString}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    signedHeaders,
    xAmzDate: scope.datetime,
    payloadHash,
  };
}

/** Current timestamp in SigV4 basic format: YYYYMMDDTHHMMSSZ */
export function amzDate(now: Date = new Date()): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
