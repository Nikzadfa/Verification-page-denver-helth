import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { AppHeader, Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  { href: '/admin/users', icon: '👤', label: 'Users & companies', hint: 'Accounts, roles, seats' },
  { href: '/admin/plans', icon: '💳', label: 'Plans & pricing', hint: 'Prices and entitlements' },
  { href: '/admin/knowledge', icon: '📚', label: 'Knowledge base', hint: 'Manuals and documents' },
  { href: '/admin/fault-codes', icon: '⚠️', label: 'Fault codes', hint: 'Manufacturers and codes' },
  { href: '/admin/eval', icon: '🧪', label: 'AI Testing Center', hint: 'Scenarios and regressions' },
  { href: '/admin/usage', icon: '📈', label: 'AI usage & revenue', hint: 'Tokens, cost, MRR' },
];

export default async function AdminHome() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'PLATFORM_ADMIN') redirect('/');

  const [users, sessions, faultCodes, documents, lastRun] = await Promise.all([
    prisma.user.count().catch(() => 0),
    prisma.diagnosticSession.count().catch(() => 0),
    prisma.faultCode.count().catch(() => 0),
    prisma.knowledgeDocument.count().catch(() => 0),
    prisma.evalRun.findFirst({ orderBy: { createdAt: 'desc' } }).catch(() => null),
  ]);

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <AppHeader title="Admin" back="/" />

      <div className="space-y-4 px-3 py-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Users" value={users} />
          <Stat label="Diagnoses" value={sessions} />
          <Stat label="Fault codes" value={faultCodes} />
          <Stat label="Documents" value={documents} />
        </div>

        {lastRun && (
          <Card>
            <p className="tr-label">Last eval run</p>
            <p className="text-sm">
              <span className="font-bold">
                {lastRun.passedCases}/{lastRun.totalCases} cases passed
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                {' '}
                · score {Math.round(lastRun.score * 100)}% · engine {lastRun.engineVersion} · prompt{' '}
                {lastRun.promptVersion}
              </span>
            </p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-dim)' }}>
              {new Date(lastRun.createdAt).toLocaleString()}
            </p>
          </Card>
        )}

        <nav className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="tr-card flex items-center gap-3 p-4">
              <span aria-hidden className="text-2xl">
                {s.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{s.label}</span>
                <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
                  {s.hint}
                </span>
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="text-center">
      <p className="font-mono text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs" style={{ color: 'var(--text-dim)' }}>
        {label}
      </p>
    </Card>
  );
}
