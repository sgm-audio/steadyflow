import { createClient } from '../../lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: member } = await supabase.from('memberships').select('org_id').eq('user_id', session.user.id).single();
  const orgId = member?.org_id;

  const { data: insights } = orgId
    ? await supabase
        .from('insights')
        .select('*')
        .eq('org_id', orgId)
        .order('generated_at', { ascending: false })
        .limit(50)
    : { data: [] };

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <a href="/dashboard">← Dashboard</a>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.5rem' }}>Insights</h1>
      </header>
      {!insights || insights.length === 0 ? (
        <p style={{ color: '#a1a1aa' }}>No insights yet. Analyze a shop to generate insights.</p>
      ) : (
        insights.map((ins) => (
          <div key={ins.id} style={{
            padding: '1rem', marginBottom: '1rem',
            background: '#18181b', border: '1px solid #27272a', borderRadius: '0.5rem',
          }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{
                padding: '0.125rem 0.5rem', borderRadius: '0.25rem',
                background: severityColor(ins.severity), color: '#000', fontSize: '0.75rem', fontWeight: 600,
              }}>
                {ins.severity}
              </span>
              <span style={{
                padding: '0.125rem 0.5rem', borderRadius: '0.25rem',
                background: '#27272a', fontSize: '0.75rem',
              }}>
                {ins.category}
              </span>
            </div>
            <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{ins.title}</h3>
            <p style={{ fontSize: '0.875rem', color: '#a1a1aa' }}>{ins.body}</p>
            <p style={{ fontSize: '0.75rem', color: '#52525b', marginTop: '0.5rem' }}>
              {ins.provider} / {ins.model} · {new Date(ins.generated_at).toLocaleString()}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

const severityColor = (s: string) => ({ low: '#34d399', medium: '#fbbf24', high: '#f87171' })[s] ?? '#a1a1aa';
