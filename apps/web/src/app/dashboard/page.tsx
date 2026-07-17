/**
 * Dashboard — protected page requiring auth.
 */

import { createClient } from '../../lib/supabase-server';
import { redirect } from 'next/navigation';
import { Reveal } from '../../components/Reveal';
import {
  SparkleIcon,
  KeyIcon,
  ClockCounterClockwiseIcon,
  ArrowUpRightIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react/ssr';
import type { ReactNode } from 'react';

const SEVERITY_STYLES: Record<string, string> = {
  high: 'text-rose-300 bg-rose-400/10',
  medium: 'text-amber-300 bg-amber-400/10',
  low: 'text-emerald-300 bg-emerald-400/10',
};

const sanitizeTitle = (title: string) => title.replace(/[—–]/g, '-');

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/intents', label: 'Intents' },
  { href: '/insights', label: 'Insights' },
  { href: '/keys', label: 'Keys' },
  { href: '/audit', label: 'Audit' },
  { href: '/settings', label: 'Settings' },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  const { data: member } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .single();
  const orgId = member?.org_id;

  const { count: insightsCount } = orgId
    ? await supabase
        .from('insights')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
    : { count: null };

  const { data: recentInsights } = orgId
    ? await supabase
        .from('insights')
        .select('title, severity')
        .eq('org_id', orgId)
        .order('generated_at', { ascending: false })
        .limit(3)
    : { data: null };

  const { data: categoryRows } = orgId
    ? await supabase
        .from('insights')
        .select('category')
        .eq('org_id', orgId)
        .order('generated_at', { ascending: false })
        .limit(200)
    : { data: null };
  const categoryCounts = (categoryRows ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.category] = (acc[row.category] ?? 0) + 1;
    return acc;
  }, {});

  const { count: competitorsCount } = orgId
    ? await supabase
        .from('competitors')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
    : { count: null };

  const { data: latestSnapshot } = orgId
    ? await supabase
        .from('competitor_snapshots')
        .select('captured_at, source')
        .eq('org_id', orgId)
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName =
    (session.user.user_metadata.full_name as string | undefined)?.split(' ')[0] ??
    session.user.email?.split('@')[0] ??
    'there';

  return (
    <div className="min-h-[100dvh]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#08080b]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-8">
            <span className="shrink-0 text-lg font-semibold tracking-tight">SteadyFlow</span>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition-colors duration-300 ${
                    item.href === '/dashboard'
                      ? 'bg-white/[0.06] text-ink'
                      : 'text-ink-muted hover:bg-white/[0.04] hover:text-ink'
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="hidden max-w-[180px] truncate text-sm text-ink-muted sm:block">
              {session.user.email}
            </span>
            <a href="/logout" className="text-sm text-ink-muted transition-colors hover:text-ink">
              Sign out
            </a>
          </div>
        </div>
        <div
          className="flex gap-1 overflow-x-auto px-4 pb-3 md:hidden"
          style={{ maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)' }}
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors duration-300 ${
                item.href === '/dashboard'
                  ? 'bg-white/[0.06] text-ink'
                  : 'text-ink-muted hover:bg-white/[0.04] hover:text-ink'
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 md:px-8">
        <Reveal>
          <section className="pb-12 pt-16 md:pt-20">
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl">
              {greeting}, {firstName}.
            </h1>
            <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-ink-muted">
              Here&apos;s what&apos;s happening with your Shopify growth analysis today.
            </p>
            <div className="mt-8">
              <a
                href="/intents"
                className="group inline-flex items-center gap-3 rounded-full bg-[#4f46e5] py-3 pl-6 pr-2 text-sm font-medium text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[#4338ca] active:scale-[0.98]"
              >
                Analyze a shop
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-[1px] group-hover:translate-x-0.5">
                  <ArrowUpRightIcon size={16} weight="bold" />
                </span>
              </a>
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.1}>
          <section className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <DashboardCard
              className="md:col-span-7"
              featured
              icon={<SparkleIcon size={22} weight="light" />}
              title="Latest insights"
              description={
                orgId
                  ? 'AI-generated recommendations from your analyzed stores.'
                  : 'Analyze a shop to generate your first insight.'
              }
              stat={orgId ? `${insightsCount ?? 0} generated` : undefined}
              href="/insights"
            >
              {Object.keys(categoryCounts).length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {Object.entries(categoryCounts).map(([category, count]) => (
                    <span
                      key={category}
                      className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-ink-muted"
                    >
                      {category.replace('_', ' ')} <span className="font-mono text-ink">{count}</span>
                    </span>
                  ))}
                </div>
              )}
              {recentInsights && recentInsights.length > 0 && (
                <ul className="mt-6 flex-1 divide-y divide-white/[0.04] border-y border-white/[0.04]">
                  {recentInsights.map((insight, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <span className="truncate text-sm text-ink">
                        {sanitizeTitle(insight.title)}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
                          SEVERITY_STYLES[insight.severity] ?? 'text-ink-muted bg-white/5'
                        }`}
                      >
                        {insight.severity}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </DashboardCard>
            <div className="grid gap-6 md:col-span-5">
              <DashboardCard
                icon={<UsersThreeIcon size={20} weight="light" />}
                title="Competitors"
                description={
                  competitorsCount
                    ? `Last checked ${latestSnapshot ? new Date(latestSnapshot.captured_at).toLocaleDateString() : 'never'} via ${latestSnapshot?.source ?? 'Tavily'}.`
                    : 'Track competitor pricing to spot real market moves.'
                }
                stat={competitorsCount ? `${competitorsCount} tracked` : undefined}
                href="/insights"
              />
              <DashboardCard
                icon={<KeyIcon size={20} weight="light" />}
                title="Provider keys"
                description="Configure Shopify, Printify, Tavily, and your LLM."
                href="/keys"
              />
              <DashboardCard
                icon={<ClockCounterClockwiseIcon size={20} weight="light" />}
                title="Audit trail"
                description="Every action logged, in order."
                href="/audit"
              />
            </div>
          </section>
        </Reveal>
      </main>
    </div>
  );
}

function DashboardCard({
  icon,
  title,
  description,
  href,
  stat,
  featured = false,
  className = '',
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  stat?: string | undefined;
  featured?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <a
      href={href}
      className={`group block h-full rounded-[2rem] bg-white/[0.03] p-1.5 ring-1 ring-white/10 transition-colors duration-500 hover:ring-white/20 ${className}`}
    >
      <div
        className={`flex h-full flex-col rounded-[1.625rem] bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
          featured ? 'p-6 md:p-8' : 'p-6'
        } ${!children ? 'justify-between' : ''}`}
      >
        <div className="flex items-start justify-between">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
            {icon}
          </span>
          {stat && <span className="font-mono text-xs text-ink-muted">{stat}</span>}
        </div>
        <div className="mt-6">
          <h3 className={`font-medium ${featured ? 'text-xl' : 'text-lg'}`}>{title}</h3>
          <p className="mt-1.5 text-sm text-ink-muted">{description}</p>
        </div>
        {children}
      </div>
    </a>
  );
}
