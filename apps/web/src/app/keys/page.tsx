import { createClient } from '../../lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function KeysPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: member } = await supabase.from('memberships').select('org_id').eq('user_id', session.user.id).single();
  const orgId = (member as { org_id?: string })?.org_id;

  const { data: keys } = await supabase.from('keys_envelopes').select('provider, created_at, rotated_at').eq('org_id', orgId);

  const allProviders = ['firecrawl', 'hunter', 'tavily', 'deepseek', 'nvidia-nim', 'groq', 'openai-compatible'];
  const configured = new Set((keys ?? []).map((k: { provider: string }) => k.provider));

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <a href="/dashboard">← Dashboard</a>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.5rem' }}>Provider Keys</h1>
      </header>

      <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 600 }}>
        {allProviders.map((provider) => (
          <div key={provider} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '1rem', background: '#18181b', border: '1px solid #27272a', borderRadius: '0.5rem',
          }}>
            <div>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{provider}</span>
              {configured.has(provider) ? (
                <span style={{ marginLeft: '0.5rem', color: '#34d399', fontSize: '0.75rem' }}>✓ Configured</span>
              ) : (
                <span style={{ marginLeft: '0.5rem', color: '#a1a1aa', fontSize: '0.75rem' }}>Not set</span>
              )}
            </div>
            <a
              href={`/keys/${provider}`}
              style={{ fontSize: '0.875rem', padding: '0.25rem 0.75rem', background: '#27272a', borderRadius: '0.25rem' }}
            >
              {configured.has(provider) ? 'Update' : 'Add'}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
