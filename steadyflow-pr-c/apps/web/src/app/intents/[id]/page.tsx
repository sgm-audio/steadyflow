/**
 * Intent detail page.
 */

import { createClient } from '../../../lib/supabase-server';
import { redirect, notFound } from 'next/navigation';

export default async function IntentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: intent, error } = await supabase
    .from('intents')
    .select('*')
    .eq('id', id)
    .single();

  if (error) notFound();

  // Get linked insights
  const { data: insights } = await supabase
    .from('insights')
    .select('*')
    .eq('intent_id', id);

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <a href="/intents">← Back to Intents</a>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.5rem' }}>
          Intent: {intent.kind}
        </h1>
      </header>

      <div style={{ display: 'grid', gap: '1rem', maxWidth: 800 }}>
        <DetailRow label="Status">
          <StatusBadge status={intent.status} />
        </DetailRow>
        <DetailRow label="Created" value={new Date(intent.created_at).toLocaleString()} />
        <DetailRow label="Updated" value={new Date(intent.updated_at).toLocaleString()} />
        <DetailRow label="Input Hash" value={intent.input_hash.slice(0, 16) + '...'} />
        {intent.error_message ? (
          <DetailRow label="Error" value={intent.error_message} />
        ) : null}
      </div>

      {insights && insights.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Insights ({insights.length})</h2>
          {insights.map((ins) => (
            <div key={ins.id} style={{
              padding: '1rem', marginBottom: '1rem',
              background: '#18181b', border: '1px solid #27272a', borderRadius: '0.5rem',
            }}>
              <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{ins.title}</h3>
              <p style={{ fontSize: '0.875rem', color: '#a1a1aa' }}>{ins.body.slice(0, 200)}...</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #27272a', paddingBottom: '0.5rem' }}>
      <span style={{ width: 120, color: '#a1a1aa', fontSize: '0.875rem' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: '#a1a1aa', running: '#fbbf24', succeeded: '#34d399',
    failed: '#f87171', cancelled: '#6b7280', rate_limited: '#f59e0b',
  };
  return (
    <span style={{
      display: 'inline-block', padding: '0.125rem 0.5rem', borderRadius: '0.25rem',
      background: colors[status] ?? '#a1a1aa', color: '#000', fontSize: '0.75rem', fontWeight: 600,
    }}>
      {status}
    </span>
  );
}
