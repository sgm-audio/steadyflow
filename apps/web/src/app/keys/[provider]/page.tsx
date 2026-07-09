'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { z } from 'zod';
import { wrapProviderKey } from '@steadyflow/crypto';

const PROVIDERS = ['firecrawl', 'hunter', 'tavily', 'deepseek', 'nvidia-nim', 'groq', 'openai-compatible'] as const;
const Provider = z.enum(PROVIDERS);

const KeysSetErrorResponse = z.object({ error: z.string() });

export default function KeySetPage() {
  const router = useRouter();
  const params = useParams<{ provider: string }>();
  const providerResult = Provider.safeParse(params.provider);

  const [passphrase, setPassphrase] = useState('');
  const [rawKey, setRawKey] = useState('');
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const envelope = await wrapProviderKey(passphrase, rawKey);
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, ...envelope }),
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
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Passphrase</label>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => { setPassphrase(e.target.value); }}
            required
            minLength={8}
            autoComplete="off"
            style={{ width: '100%' }}
          />
          <p style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.25rem' }}>
            Encrypts this key before it leaves your browser. Never sent to or stored by the
            server — remember it, there is no recovery.
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
          {busy ? 'Encrypting…' : 'Save key'}
        </button>
      </form>
    </div>
  );
}
