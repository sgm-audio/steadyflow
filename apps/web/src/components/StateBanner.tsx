import type { ErrorState } from '../lib/api-client';

const COPY: Record<ErrorState, { label: string; color: string; hint: string }> = {
  auth: { label: 'Session expired', color: '#f87171', hint: 'Sign in again to continue.' },
  'provider-auth-failure': {
    label: 'Provider authentication failed',
    color: '#fbbf24',
    hint: 'A configured provider key is missing or invalid. Check your keys.',
  },
  'rate-limited': { label: 'Rate limited', color: '#fbbf24', hint: 'Too many requests — try again shortly.' },
  'not-found': { label: 'Not found', color: '#a1a1aa', hint: 'The requested resource does not exist.' },
  error: { label: 'Something went wrong', color: '#f87171', hint: 'Try again, or check back later.' },
};

/** Renders one of the non-happy-path interface states (error/auth-failure/rate-limited/not-found). */
export function StateBanner({ state, message }: { state: ErrorState; message?: string }) {
  const copy = COPY[state];
  return (
    <div
      style={{
        padding: '1rem',
        background: '#18181b',
        border: `1px solid ${copy.color}55`,
        borderRadius: '0.5rem',
        marginBottom: '1rem',
      }}
    >
      <p style={{ color: copy.color, fontWeight: 600, marginBottom: '0.25rem' }}>{copy.label}</p>
      <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>{message ?? copy.hint}</p>
      {state === 'provider-auth-failure' && (
        <a href="/keys" style={{ fontSize: '0.875rem', color: '#818cf8', marginTop: '0.5rem', display: 'inline-block' }}>
          Manage provider keys →
        </a>
      )}
    </div>
  );
}
