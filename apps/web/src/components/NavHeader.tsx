'use client';

import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/intents', label: 'Intents' },
  { href: '/insights', label: 'Insights' },
  { href: '/keys', label: 'Keys' },
  { href: '/audit', label: 'Audit' },
  { href: '/settings', label: 'Settings' },
];

export function NavHeader() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#08080b]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-8">
          <a href="/dashboard" className="shrink-0 text-lg font-semibold tracking-tight no-underline text-ink">
            SteadyFlow
          </a>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`rounded-full px-3.5 py-1.5 text-sm transition-colors duration-300 ${
                  isActive(item.href)
                    ? 'bg-white/[0.06] text-ink'
                    : 'text-ink-muted hover:bg-white/[0.04] hover:text-ink'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
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
              isActive(item.href)
                ? 'bg-white/[0.06] text-ink'
                : 'text-ink-muted hover:bg-white/[0.04] hover:text-ink'
            }`}
          >
            {item.label}
          </a>
        ))}
      </div>
    </header>
  );
}
