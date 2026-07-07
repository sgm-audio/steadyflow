/**
 * Dashboard — protected page requiring auth.
 */

import { createClient } from '../../lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>SteadyFlow Dashboard</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: '#a1a1aa' }}>{session.user.email}</span>
          <a href="/logout" style={{ fontSize: '0.875rem' }}>Sign out</a>
        </div>
      </header>

      <nav style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid #27272a', paddingBottom: '1rem' }}>
        <a href="/dashboard">Dashboard</a>
        <a href="/intents">Intents</a>
        <a href="/insights">Insights</a>
        <a href="/keys">Keys</a>
        <a href="/audit">Audit</a>
        <a href="/settings">Settings</a>
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <QuickActionCard
          title="Analyze a Shop"
          description="Submit a Shopify store URL for AI-powered analysis."
          href="/intents/new"
        />
        <QuickActionCard
          title="Configure Provider Keys"
          description="Set up your Firecrawl, Hunter, Tavily, and LLM API keys."
          href="/keys"
        />
        <QuickActionCard
          title="View Latest Insights"
          description="Browse AI-generated insights and recommendations."
          href="/insights"
        />
        <QuickActionCard
          title="Audit Trail"
          description="Review all actions logged by the system."
          href="/audit"
        />
      </div>
    </div>
  );
}

function QuickActionCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <a
      href={href}
      style={{
        display: 'block',
        padding: '1.5rem',
        background: '#18181b',
        border: '1px solid #27272a',
        borderRadius: '0.5rem',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>{title}</h3>
      <p style={{ fontSize: '0.875rem', color: '#a1a1aa' }}>{description}</p>
    </a>
  );
}
