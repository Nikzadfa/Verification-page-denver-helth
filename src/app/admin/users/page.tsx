import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { AppHeader, Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect('/login');
  if (admin.role !== 'PLATFORM_ADMIN') redirect('/');

  const [users, companies] = await Promise.all([
    prisma.user
      .findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          company: { select: { name: true } },
          subscription: { include: { plan: { select: { name: true } } } },
          _count: { select: { diagnosticSessions: true, reports: true } },
        },
      })
      .catch(() => []),
    prisma.company
      .findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          _count: { select: { users: true, jobs: true } },
          subscription: { include: { plan: { select: { name: true } } } },
        },
      })
      .catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <AppHeader title="Users & companies" back="/admin" />

      <div className="space-y-4 px-3 py-4">
        <Card>
          <p className="tr-label">Companies ({companies.length})</p>
          {companies.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No companies yet.
            </p>
          ) : (
            <ul className="divide-y text-sm" style={{ borderColor: 'var(--border)' }}>
              {companies.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
                      {c._count.users} technicians · {c._count.jobs} jobs
                    </span>
                  </span>
                  <span className="tr-chip sev-INFO shrink-0">
                    {c.subscription?.plan.name ?? 'Free'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="tr-label">Users ({users.length})</p>
          <ul className="divide-y text-sm" style={{ borderColor: 'var(--border)' }}>
            {users.map((u) => (
              <li key={u.id} className="py-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{u.fullName}</span>
                    <span className="block truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                      {u.email}
                      {u.company ? ` · ${u.company.name}` : ''}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
                      {u._count.diagnosticSessions} diagnoses · {u._count.reports} reports · joined{' '}
                      {new Date(u.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className={`tr-chip ${u.role === 'PLATFORM_ADMIN' ? 'sev-ABNORMAL' : u.role === 'COMPANY_ADMIN' ? 'sev-WATCH' : 'sev-INFO'}`}
                    >
                      {u.role.replace('_', ' ').toLowerCase()}
                    </span>
                    <span className="mt-1 block text-xs" style={{ color: 'var(--text-dim)' }}>
                      {u.subscription?.plan.name ?? 'Free'}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
