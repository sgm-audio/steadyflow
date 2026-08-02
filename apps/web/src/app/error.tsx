'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Something went wrong</h1>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          {error.digest ? `Reference: ${error.digest}` : error.message || 'An unexpected error occurred.'}
        </p>
        <button
          type="button"
          onClick={() => { reset(); }}
          style={{ padding: '0.75rem 1.5rem', background: '#818cf8', color: '#fff', border: 'none', borderRadius: '0.375rem', fontWeight: 600 }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
