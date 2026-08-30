'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CancelIntentButton({ intentId }: { intentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleCancel = async () => {
    if (!confirm('Cancel this intent?')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/intents/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intentId }),
      });
      if (!res.ok) throw new Error('Failed to cancel');
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
      onClick={() => {
        void handleCancel();
      }}
      disabled={busy}
      style={{
        fontSize: '0.875rem',
        padding: '0.125rem 0.5rem',
        background: 'transparent',
        color: '#f87171',
        border: '1px solid #27272a',
        borderRadius: '0.25rem',
        cursor: busy ? 'default' : 'pointer',
      }}
    >
      {busy ? 'Cancelling…' : 'Cancel'}
    </button>
  );
}
