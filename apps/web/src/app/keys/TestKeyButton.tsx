'use client';

import { useState } from 'react';
import { z } from 'zod';

const TestResult = z.object({ ok: z.boolean(), latencyMs: z.number() });
const ErrorResult = z.object({ error: z.object({ message: z.string() }) });

type Status = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok'; latencyMs: number } | { kind: 'failed'; message: string };

export default function TestKeyButton({ provider }: { provider: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const handleTest = async () => {
    setStatus({ kind: 'testing' });
    try {
      const res = await fetch('/api/keys/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        const parsed = ErrorResult.safeParse(body);
        setStatus({ kind: 'failed', message: parsed.success ? parsed.data.error.message : 'Provider authentication failed' });
        return;
      }
      const parsed = TestResult.parse(body);
      setStatus(parsed.ok ? { kind: 'ok', latencyMs: parsed.latencyMs } : { kind: 'failed', message: 'Key rejected by provider' });
    } catch {
      setStatus({ kind: 'failed', message: 'Network error while testing key' });
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <button
        type="button"
        onClick={() => { void handleTest(); }}
        disabled={status.kind === 'testing'}
        style={{
          fontSize: '0.875rem',
          padding: '0.25rem 0.75rem',
          background: 'transparent',
          color: '#a1a1aa',
          border: '1px solid #27272a',
          borderRadius: '0.25rem',
          cursor: status.kind === 'testing' ? 'default' : 'pointer',
        }}
      >
        {status.kind === 'testing' ? 'Testing…' : 'Test'}
      </button>
      {status.kind === 'ok' && (
        <span style={{ color: '#34d399', fontSize: '0.75rem' }}>✓ OK ({status.latencyMs}ms)</span>
      )}
      {status.kind === 'failed' && <span style={{ color: '#f87171', fontSize: '0.75rem' }}>{status.message}</span>}
    </div>
  );
}
