import { createClient } from '../../lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function AuditPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: member } = await supabase.from('memberships').select('org_id').eq('user_id', session.user.id).single();
  const orgId = (member as { org_id?: string })?.org_id;

  const { data: logs } = await supabase
    .from('audit_log')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <a href="/dashboard">← Dashboard</a>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.5rem' }}>Audit Log</h1>
      </header>
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
          {(logs ?? []).map((log: Record<string, unknown>) => (
            <tr key={log.id as string} style={{ borderBottom: '1px solid #27272a' }}>
              <td style={{ padding: '0.5rem', fontSize: '0.875rem' }}>{String(log.action)}</td>
              <td style={{ padding: '0.5rem' }}>{String(log.outcome)}</td>
              <td style={{ padding: '0.5rem', fontSize: '0.875rem' }}>{String(log.provider ?? '-')}</td>
              <td style={{ padding: '0.5rem', fontSize: '0.875rem' }}>{String(log.duration_ms)}ms</td>
              <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: '#a1a1aa' }}>
                {new Date(log.created_at as string).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
