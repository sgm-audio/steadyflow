'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RemoveKeyButton({ provider }: { provider: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleRemove = async () => {
    if (!confirm(`Remove the ${provider} key? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error('Failed to remove key');
      router.refresh();
    } catch {
      // Swallow — the row simply won't update if this failed; user can retry.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => { void handleRemove(); }}
      disabled={busy}
      style={{
        fontSize: '0.875rem',
        padding: '0.25rem 0.75rem',
        background: 'transparent',
        color: '#f87171',
        border: '1px solid #27272a',
        borderRadius: '0.25rem',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? 'Removing…' : 'Remove'}
    </button>
  );
}
