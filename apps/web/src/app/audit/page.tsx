import { requireOrgSession } from '../../lib/session';
import { classifyError } from '../../lib/api-client';
import { StateBanner } from '../../components/StateBanner';

export default async function AuditPage() {
  const { orgId, api } = await requireOrgSession();

  const result = orgId ? await api.auditQuery({ limit: 50 }) : null;

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <a href="/dashboard">← Dashboard</a>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.5rem' }}>Audit Log</h1>
      </header>

      {!orgId ? (
        <StateBanner state="not-found" message="No organization found for this account." />
      ) : result && !result.ok ? (
        <StateBanner state={classifyError(result.error)} message={result.error.message} />
      ) : !result || result.data.items.length === 0 ? (
        <p style={{ color: '#a1a1aa' }}>No audit events yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #27272a', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Action</th>
              <th style={{ padding: '0.5rem' }}>Outcome</th>
              <th style={{ padding: '0.5rem' }}>Provider</th>
              <th style={{ padding: '0.5rem' }}>Duration</th>
              <th style={{ padding: '0.5rem' }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {result.data.items.map((log) => (
              <tr key={log.id} style={{ borderBottom: '1px solid #27272a' }}>
                <td style={{ padding: '0.5rem', fontSize: '0.875rem' }}>{log.action}</td>
                <td style={{ padding: '0.5rem' }}>{log.outcome}</td>
                <td style={{ padding: '0.5rem', fontSize: '0.875rem' }}>{log.provider ?? '-'}</td>
                <td style={{ padding: '0.5rem', fontSize: '0.875rem' }}>{log.durationMs}ms</td>
                <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: '#a1a1aa' }}>
                  {new Date(log.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
