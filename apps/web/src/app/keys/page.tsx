import { StateBanner } from '../../components/StateBanner';
import { classifyError } from '../../lib/api-client';
import { requireOrgSession } from '../../lib/session';
import RemoveKeyButton from './RemoveKeyButton';
import SetKeyForm from './SetKeyForm';
import TestKeyButton from './TestKeyButton';

const ALL_PROVIDERS = [
  'firecrawl',
  'tavily',
  'deepseek',
  'nvidia-nim',
  'groq',
  'openai-compatible',
  'shopify-admin',
  'printify',
  'amazon-sp-api',
  'alibaba',
];

export default async function KeysPage() {
  const { orgId, api } = await requireOrgSession();

  const result = orgId ? await api.keysList() : null;

  const configured = new Set<string>(result?.ok ? result.data.map((k) => k.provider) : []);

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <a href="/dashboard">← Dashboard</a>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.5rem' }}>Provider Keys</h1>
      </header>

      {!orgId ? (
        <StateBanner state="not-found" message="No organization found for this account." />
      ) : result && !result.ok ? (
        <StateBanner state={classifyError(result.error)} message={result.error.message} />
      ) : null}

      <SetKeyForm />

      <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 600 }}>
        {ALL_PROVIDERS.map((provider) => (
          <div
            key={provider}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem',
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '0.5rem',
            }}
          >
            <div>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{provider}</span>
              {configured.has(provider) ? (
                <span style={{ marginLeft: '0.5rem', color: '#34d399', fontSize: '0.75rem' }}>
                  ✓ Configured
                </span>
              ) : (
                <span style={{ marginLeft: '0.5rem', color: '#a1a1aa', fontSize: '0.75rem' }}>
                  Not set
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {configured.has(provider) && <TestKeyButton provider={provider} />}
              <a
                href={`/keys/${provider}`}
                style={{
                  fontSize: '0.875rem',
                  padding: '0.25rem 0.75rem',
                  background: '#27272a',
                  borderRadius: '0.25rem',
                }}
              >
                {configured.has(provider) ? 'Update' : 'Add'}
              </a>
              {configured.has(provider) && <RemoveKeyButton provider={provider} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
