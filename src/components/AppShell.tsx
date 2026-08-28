'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Persistent navigation.
 *
 * On a phone it is a bottom bar, because that is where a thumb reaches while
 * the other hand is holding a meter. On a tablet or a laptop it becomes a left
 * rail, because a bottom bar on a wide screen puts the controls as far from
 * the content as the hardware allows.
 *
 * Signed-out pages get no navigation — there is nowhere to go until you have
 * an account — and neither does the admin area, which has its own.
 */

interface Tab {
  href: string;
  label: string;
  icon: string;
  /** Sub-paths that should still light this tab up. */
  match: (path: string) => boolean;
}

const TABS: Tab[] = [
  { href: '/', label: 'Home', icon: '🏠', match: (p) => p === '/' },
  {
    href: '/diagnose/new',
    label: 'Diagnose',
    icon: '🔧',
    match: (p) => p.startsWith('/diagnose'),
  },
  { href: '/customers', label: 'Customers', icon: '👥', match: (p) => p.startsWith('/customers') },
  { href: '/jobs', label: 'Jobs', icon: '🗂', match: (p) => p.startsWith('/jobs') },
  {
    href: '/fault-codes',
    label: 'Codes',
    icon: '⚠️',
    match: (p) => p.startsWith('/fault-codes'),
  },
];

/** Routes with no navigation: nothing to navigate to, or their own chrome. */
const BARE = ['/login', '/register', '/admin', '/legal'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const bare = BARE.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (bare) return <>{children}</>;

  return (
    <>
      <a href="#main" className="tr-skip">
        Skip to content
      </a>

      <nav className="tr-nav" aria-label="Main">
        <ul className="tr-nav-list">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            return (
              <li key={tab.href} className="tr-nav-item">
                <Link
                  href={tab.href}
                  className="tr-nav-link"
                  data-active={active ? 'true' : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  <span aria-hidden className="tr-nav-icon">
                    {tab.icon}
                  </span>
                  <span className="tr-nav-label">{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* A div rather than <main>: several pages already render their own
          <main>, and nesting two is invalid. The skip link still lands here. */}
      <div className="tr-shell" id="main" tabIndex={-1}>
        {children}
      </div>
    </>
  );
}
