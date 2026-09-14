'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';

const PROVIDERS = [
  'firecrawl',
  'tavily',
  'deepseek',
  'nvidia-nim',
  'groq',
  'openai-compatible',
  'printify',
  'amazon-sp-api',
  'alibaba',
] as const;
const Provider = z.enum(PROVIDERS);

const KeysSetErrorResponse = z.object({ error: z.string() });

/** Inline key entry: provider dropdown + key input, no per-provider page needed.
 *  shopify-admin is OAuth-only so it stays on its own connect page. */
export default function SetKeyForm({ defaultProvider }: { defaultProvider?: string }) {
  const router = useRouter();
  const initial = Provider.safeParse(defaultProvider);
  const [provider, setProvider] = useState<string>(initial.success ? initial.data : 'nvidia-nim');
  const [rawKey, setRawKey] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaved('');
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
      setSaved(`Saved ${provider} key.`);
      setRawKey('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      style={{
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        maxWidth: 600,
        padding: '1rem',
        background: '#18181b',
        border: '1px solid #27272a',
        borderRadius: '0.5rem',
        marginBottom: '1.5rem',
      }}
    >
      <div>
        <label
          htmlFor="key-provider"
          style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}
        >
          Provider
        </label>
        <select
          id="key-provider"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
          }}
          style={{ padding: '0.5rem', borderRadius: '0.375rem', background: '#27272a' }}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <label
          htmlFor="key-value"
          style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}
        >
          API key
        </label>
        <input
          id="key-value"
          type="password"
          value={rawKey}
          onChange={(e) => {
            setRawKey(e.target.value);
          }}
          required
          autoComplete="off"
          placeholder="paste key…"
          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem' }}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        style={{
          padding: '0.5rem 1rem',
          background: '#818cf8',
          color: '#fff',
          border: 'none',
          borderRadius: '0.375rem',
          fontSize: '0.875rem',
          fontWeight: 600,
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? 'Saving…' : 'Save key'}
      </button>
      {error && (
        <p style={{ color: '#f87171', fontSize: '0.875rem', width: '100%', margin: 0 }}>{error}</p>
      )}
      {saved && (
        <p style={{ color: '#34d399', fontSize: '0.875rem', width: '100%', margin: 0 }}>{saved}</p>
      )}
    </form>
  );
}
