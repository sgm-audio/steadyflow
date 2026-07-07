import { createClient } from '../../lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: member } = await supabase.from('memberships').select('org_id').eq('user_id', session.user.id).single();
  const orgId = (member as { org_id?: string })?.org_id;

  const { data: org } = await supabase.from('orgs').select('*').eq('id', orgId).single();

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <a href="/dashboard">← Dashboard</a>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.5rem' }}>Settings</h1>
      </header>

      <div style={{ maxWidth: 600 }}>
        <div style={{ padding: '1.5rem', background: '#18181b', borderRadius: '0.5rem', border: '1px solid #27272a', marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Organization</h3>
          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>Name: </span>
            <span>{org ? (org as Record<string, unknown>).name as string : '-'}</span>
          </div>
        </div>

        <div style={{ padding: '1.5rem', background: '#18181b', borderRadius: '0.5rem', border: '1px solid #27272a' }}>
          <h3 style={{ marginBottom: '1rem' }}>LLM Configuration</h3>
          <form action="/api/settings/llm" method="POST" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Provider</label>
              <select name="provider" defaultValue={org ? (org as Record<string, string>).default_llm_provider : 'deepseek'}>
                <option value="deepseek">Deepseek</option>
                <option value="nvidia-nim">Nvidia NIM</option>
                <option value="groq">Groq</option>
                <option value="openai-compatible">OpenAI Compatible</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Default Model</label>
              <input name="defaultModel" defaultValue={org ? (org as Record<string, string>).default_llm_model : 'deepseek-chat'} />
            </div>
            <button type="submit" style={{ padding: '0.75rem', background: '#818cf8', color: '#fff', border: 'none', borderRadius: '0.375rem', fontWeight: 600 }}>
              Save
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
