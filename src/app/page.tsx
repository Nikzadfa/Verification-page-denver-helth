import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getEntitlements } from '@/lib/billing/entitlements';
import { prisma } from '@/lib/db';
import { AppHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

const TILES = [
  { href: '/diagnose/new', icon: '🔧', label: 'Diagnose', hint: 'Start a guided diagnosis' },
  { href: '/fault-codes', icon: '⚠️', label: 'Fault Codes', hint: 'Manufacturer code lookup' },
  { href: '/customers', icon: '👥', label: 'Customers', hint: 'Contacts, sites and history' },
  { href: '/scan', icon: '📷', label: 'Scan Equipment', hint: 'Read a rating plate' },
  { href: '/tools/electrical', icon: '⚡', label: 'Electrical', hint: 'Capacitor, amps, voltage' },
  { href: '/tools/refrigeration', icon: '❄️', label: 'Refrigeration', hint: 'Superheat, subcooling, P/T' },
  { href: '/tools/heating', icon: '🔥', label: 'Heating', hint: 'Rise, gas input, ignition' },
  { href: '/tools/airflow', icon: '💨', label: 'Airflow', hint: 'Static pressure, CFM, ΔT' },
  { href: '/reports', icon: '📋', label: 'Service Reports', hint: 'Generate and export PDFs' },
  { href: '/jobs', icon: '🗂', label: 'Saved Jobs', hint: 'Work in progress by job' },
];

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [entitlements, recent] = await Promise.all([
    getEntitlements(user.id).catch(() => null),
    prisma.diagnosticSession
      .findMany({
        where: { userId: user.id },
        orderBy: { startedAt: 'desc' },
        take: 3,
        select: { id: true, title: true, phase: true, startedAt: true },
      })
      .catch(() => []),
  ]);

  // "A. Okonkwo" should not produce "A. — what are you working on?". Only greet
  // by name when the first token is actually a name rather than an initial.
  const firstToken = user.fullName.trim().split(/\s+/)[0] ?? '';
  const firstName = /^[A-Za-z]{2,}$/.test(firstToken) ? firstToken : null;

  return (
    <div className="mx-auto min-h-dvh max-w-3xl pb-10">
      <AppHeader
        title="ThermoRivet"
        right={
          <Link href="/account" className="tr-btn tr-btn-ghost text-sm" aria-label="Account">
            Account
          </Link>
        }
      />

      <main className="px-3 pt-4">
        <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
          {firstName ? `${firstName} — w` : 'W'}hat are you working on?
        </p>

        <nav className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TILES.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="tr-card flex flex-col p-4 transition-[border-color]"
              style={{ minHeight: '7.5rem' }}
            >
              {/* Top-aligned so titles line up across a row regardless of how
                  many lines the hint below them wraps to. */}
              <span aria-hidden className="text-2xl leading-none">
                {tile.icon}
              </span>
              <span className="mt-3 block text-sm font-bold">{tile.label}</span>
              <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-dim)' }}>
                {tile.hint}
              </span>
            </Link>
          ))}
        </nav>

        {recent.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
              Pick up where you left off
            </h2>
            <ul className="space-y-2">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link href={`/diagnose/${s.id}`} className="tr-card flex items-center gap-3 p-3">
                    <span aria-hidden>{s.phase === 'DIAGNOSED' ? '✅' : '🔧'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.title}</span>
                      <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
                        {s.phase === 'DIAGNOSED' ? 'Diagnosed' : 'In progress'} ·{' '}
                        {new Date(s.startedAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span aria-hidden style={{ color: 'var(--text-dim)' }}>
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {entitlements && (
          <section className="mt-6">
            <div className="tr-card flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-bold">{entitlements.planName}</span>
                <span className="ml-2" style={{ color: 'var(--text-dim)' }}>
                  {entitlements.diagnosesRemaining === 'unlimited'
                    ? 'Unlimited diagnoses'
                    : `${entitlements.diagnosesRemaining} diagnoses left this period`}
                </span>
              </span>
              {entitlements.tier !== 'COMPANY' && (
                <Link href="/pricing" className="tr-btn tr-btn-secondary text-sm">
                  Upgrade
                </Link>
              )}
            </div>
          </section>
        )}

        {user.role === 'PLATFORM_ADMIN' && (
          <Link href="/admin" className="tr-btn tr-btn-secondary mt-4 w-full">
            Admin dashboard
          </Link>
        )}

        <p className="mt-8 text-center text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          ThermoRivet assists a qualified technician. It does not replace one.
          <br />
          Always follow applicable codes, the manufacturer&rsquo;s procedures, and your own
          safety practices.
        </p>
      </main>
    </div>
  );
}
