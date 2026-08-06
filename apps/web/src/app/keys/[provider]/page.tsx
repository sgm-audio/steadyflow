'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { z } from 'zod';

const PROVIDERS = [
  'firecrawl', 'tavily', 'deepseek', 'nvidia-nim', 'groq', 'openai-compatible',
  'shopify-admin', 'printify', 'amazon-sp-api', 'alibaba',
] as const;
const Provider = z.enum(PROVIDERS);

const KeysSetErrorResponse = z.object({ error: z.string() });

const OAUTH_ERRORS: Record<string, string> = {
  invalid_state: 'OAuth state mismatch — please try connecting again.',
  invalid_hmac: 'Shopify callback failed signature verification.',
  token_exchange_failed: 'Shopify rejected the authorization code.',
  no_org: 'No organization found for this account.',
  encrypt_failed: 'Failed to encrypt the access token.',
  store_failed: 'Failed to save the access token.',
};

export default function KeySetPage() {
  const router = useRouter();
  const params = useParams<{ provider: string }>();
  const providerResult = Provider.safeParse(params.provider);

  const [rawKey, setRawKey] = useState('');
  const [shopDomain, setShopDomain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!providerResult.success) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>Unknown provider &ldquo;{params.provider}&rdquo;.</p>
        <a href="/keys">← Back to Keys</a>
      </div>
    );
  }
  const provider = providerResult.data;

  if (provider === 'shopify-admin') {
    const oauthErrorParam = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('error')
      : null;
    const oauthError = oauthErrorParam ? OAUTH_ERRORS[oauthErrorParam] ?? oauthErrorParam : '';

    return (
      <div style={{ padding: '2rem' }}>
        <header style={{ marginBottom: '2rem' }}>
          <a href="/keys">← Keys</a>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.5rem' }}>Shopify Admin</h1>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
          <p style={{ fontSize: '0.875rem', color: '#a1a1aa' }}>
            Shopify retired static custom-app tokens (<code>shpat_</code>) — connect via OAuth instead.
            You&apos;ll be redirected to Shopify to approve access, then back here.
          </p>
          <div>
            <label htmlFor="shopDomain" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
              Store domain
            </label>
            <input
              id="shopDomain"
              type="text"
              value={shopDomain}
              onChange={(e) => { setShopDomain(e.target.value); }}
              placeholder="makingmadi.myshopify.com"
              style={{ width: '100%' }}
            />
          </div>
          {oauthError && <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{oauthError}</p>}
          <a
            href={`/api/shopify/oauth/start?shop=${encodeURIComponent(shopDomain)}`}
            style={{
              padding: '0.75rem',
              background: shopDomain ? '#818cf8' : '#3f3f46',
              color: '#fff',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              fontWeight: 600,
              textAlign: 'center',
              pointerEvents: shopDomain ? 'auto' : 'none',
            }}
          >
            Connect via Shopify
          </a>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, rawKey }),
      });
      if (!res.ok) {
        const body = KeysSetErrorResponse.safeParse(await res.json());
        throw new Error(body.success ? body.data.error : 'Failed to save key');
      }
      router.push('/keys');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <a href="/keys">← Keys</a>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.5rem', textTransform: 'capitalize' }}>
          {provider}
        </h1>
      </header>

      <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>API key</label>
          <input
            type="password"
            value={rawKey}
            onChange={(e) => { setRawKey(e.target.value); }}
            required
            autoComplete="off"
            style={{ width: '100%' }}
          />
          <p style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.25rem' }}>
            Encrypted at rest on the server (pgsodium). Never logged or displayed again.
          </p>
        </div>
        {error && <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{error}</p>}
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '0.75rem',
            background: '#818cf8',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            fontWeight: 600,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Save key'}
        </button>
      </form>
    </div>
  );
}
