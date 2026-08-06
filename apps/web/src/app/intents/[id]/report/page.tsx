/**
 * Client-facing audit report for an intent (PR 5 of the scope decision).
 *
 * Calls report.generate on every view — idempotent, so this either creates
 * the report on first visit or returns the one already on file.
 */

import { requireOrgSession } from '../../../../lib/session';
import { classifyError } from '../../../../lib/api-client';
import { StateBanner } from '../../../../components/StateBanner';
import { ReportGenerateInput } from '@steadyflow/core';
import { notFound } from 'next/navigation';

const EFFORT_LABEL: Record<string, string> = { small: 'Small (hours)', medium: 'Medium (days)', large: 'Large (weeks)' };
const SEVERITY_COLOR: Record<string, string> = { low: '#34d399', medium: '#fbbf24', high: '#f87171' };

export default async function IntentReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, api } = await requireOrgSession();

  const input = ReportGenerateInput.safeParse({ intentId: id });
  if (!input.success) notFound();

  const result = orgId ? await api.reportGenerate(input.data) : null;

  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <a href={`/intents/${id}`}>← Back to Intent</a>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.5rem' }}>Audit Report</h1>
      </header>

      {!orgId ? (
        <StateBanner state="not-found" message="No organization found for this account." />
      ) : result && !result.ok ? (
        <StateBanner state={classifyError(result.error)} message={result.error.message} />
      ) : result ? (
        <>
          <p style={{ fontSize: '0.75rem', color: '#52525b', marginBottom: '2rem' }}>
            Generated {new Date(result.data.generatedAt).toLocaleString()} · {result.data.findingCount} finding
            {result.data.findingCount === 1 ? '' : 's'}
          </p>

          <Section title="Executive Summary">
            <p style={{ lineHeight: 1.6 }}>{result.data.executiveSummary}</p>
          </Section>

          <Section title="Recommendation">
            <p style={{ lineHeight: 1.6 }}>{result.data.sprintRecommendation}</p>
          </Section>

          <Section title={`Verified Findings (${result.data.findings.length})`}>
            {result.data.findings.length === 0 ? (
              <p style={{ color: '#a1a1aa' }}>No findings to report.</p>
            ) : (
              result.data.findings.map((f) => (
                <div
                  key={f.id}
                  style={{
                    padding: '1.25rem', marginBottom: '1rem',
                    background: '#18181b', border: '1px solid #27272a', borderRadius: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '0.125rem 0.5rem', borderRadius: '0.25rem',
                      background: SEVERITY_COLOR[f.severity] ?? '#a1a1aa', color: '#000', fontSize: '0.75rem', fontWeight: 600,
                    }}>
                      {f.severity}
                    </span>
                    <span style={{ padding: '0.125rem 0.5rem', borderRadius: '0.25rem', background: '#27272a', fontSize: '0.75rem' }}>
                      {f.category.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                      Confidence: {Math.round(f.confidence * 100)}%
                    </span>
                  </div>
                  <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{f.title}</h3>
                  <p style={{ fontSize: '0.875rem', color: '#a1a1aa', marginBottom: '0.75rem' }}>{f.body}</p>

                  {f.citations.length > 0 && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <p style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 600, marginBottom: '0.25rem' }}>Evidence</p>
                      <ul style={{ fontSize: '0.75rem', color: '#a1a1aa', paddingLeft: '1.25rem' }}>
                        {f.citations.map((c, i) => (
                          <li key={i}>{c.excerpt ?? c.url ?? c.sourceId}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: '0.375rem', fontSize: '0.8125rem', borderTop: '1px solid #27272a', paddingTop: '0.75rem' }}>
                    <FieldRow label="Recommended remediation" value={f.remediation} />
                    <FieldRow label="Estimated effort" value={EFFORT_LABEL[f.effortEstimate] ?? f.effortEstimate} />
                    <FieldRow
                      label="Required access"
                      value={f.requiredAccess.length > 0 ? f.requiredAccess.join(', ') : 'None (informational)'}
                    />
                  </div>
                </div>
              ))
            )}
          </Section>
        </>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>{title}</h2>
      {children}
    </section>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem' }}>
      <span style={{ width: 180, color: '#71717a', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#e4e4e7' }}>{value}</span>
    </div>
  );
}
