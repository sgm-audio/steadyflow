/**
 * Intents list and submission page.
 */

import { requireOrgSession } from '../../lib/session';
import { classifyError } from '../../lib/api-client';
import { StateBanner } from '../../components/StateBanner';
import CancelIntentButton from './CancelIntentButton';

const CANCELLABLE = new Set(['queued', 'running']);

export default async function IntentsPage() {
  const { orgId, api } = await requireOrgSession();

  const result = orgId ? await api.intentList({ limit: 20 }) : null;
  const intents = result?.ok ? result.data.items : [];

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Intents</h1>
        <a href="/dashboard">← Back to Dashboard</a>
      </header>

      {/* New Intent Form */}
      <IntentForm />

      {/* Intent List */}
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Recent Intents</h2>
        {!orgId ? (
          <StateBanner state="not-found" message="No organization found for this account." />
        ) : result && !result.ok ? (
          <StateBanner state={classifyError(result.error)} message={result.error.message} />
        ) : intents.length === 0 ? (
          <p style={{ color: '#a1a1aa' }}>No intents yet. Submit your first shop URL above.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #27272a', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Kind</th>
                <th style={{ padding: '0.5rem' }}>Status</th>
                <th style={{ padding: '0.5rem' }}>Created</th>
                <th style={{ padding: '0.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {intents.map((intent) => (
                <tr key={intent.id} style={{ borderBottom: '1px solid #27272a' }}>
                  <td style={{ padding: '0.5rem' }}>{intent.kind}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <StatusBadge status={intent.status} />
                  </td>
                  <td style={{ padding: '0.5rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
                    {new Date(intent.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <a href={`/intents/${intent.id}`}>View</a>
                    {CANCELLABLE.has(intent.status) && <CancelIntentButton intentId={intent.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: '#a1a1aa',
    running: '#fbbf24',
    succeeded: '#34d399',
    failed: '#f87171',
    cancelled: '#6b7280',
    rate_limited: '#f59e0b',
  };
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.125rem 0.5rem',
      borderRadius: '0.25rem',
      background: colors[status] ?? '#a1a1aa',
      color: '#000',
      fontSize: '0.75rem',
      fontWeight: 600,
    }}>
      {status}
    </span>
  );
}

function IntentForm() {
  return (
    <div style={{ padding: '1.5rem', background: '#18181b', borderRadius: '0.5rem', border: '1px solid #27272a' }}>
      <h3 style={{ marginBottom: '1rem' }}>Submit a Shop for Analysis</h3>
      <form action="/api/intents" method="POST" style={{ display: 'flex', gap: '0.5rem' }}>
        <select name="platform" defaultValue="shopify" style={{ width: 120 }}>
          <option value="shopify">Shopify</option>
          <option value="etsy">Etsy</option>
        </select>
        <input
          name="url"
          type="url"
          placeholder="https://example.myshopify.com"
          required
          style={{ flex: 1 }}
        />
        <input type="hidden" name="idempotencyKey" value={`web-${Date.now()}`} />
        <button
          type="submit"
          style={{
            padding: '0.5rem 1.5rem',
            background: '#818cf8',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            fontWeight: 600,
          }}
        >
          Analyze
        </button>
      </form>
    </div>
  );
}
