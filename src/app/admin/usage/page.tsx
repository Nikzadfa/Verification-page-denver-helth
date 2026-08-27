import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { AppHeader, Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminUsagePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'PLATFORM_ADMIN') redirect('/');

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [usage, failures, active, recent] = await Promise.all([
    prisma.aiUsageEvent
      .groupBy({
        by: ['operation'],
        where: { createdAt: { gte: since } },
        _count: true,
        _sum: { inputTokens: true, outputTokens: true, costCents: true },
        _avg: { latencyMs: true },
      })
      .catch(() => []),
    prisma.aiUsageEvent.count({ where: { createdAt: { gte: since }, ok: false } }).catch(() => 0),
    prisma.subscription
      .findMany({
        where: { status: { in: ['ACTIVE', 'TRIALING'] } },
        include: { plan: { select: { name: true, priceCentsMonthly: true } } },
      })
      .catch(() => []),
    prisma.aiUsageEvent
      .findMany({ where: { ok: false }, orderBy: { createdAt: 'desc' }, take: 10 })
      .catch(() => []),
  ]);

  const mrrCents = active.reduce((a, s) => a + s.plan.priceCentsMonthly, 0);
  const totalCostCents = usage.reduce((a, u) => a + (u._sum.costCents ?? 0), 0);

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <AppHeader title="AI usage & revenue" back="/admin" />

      <div className="space-y-4 px-3 py-4">
        <div className="grid grid-cols-2 gap-3">
          <Card className="text-center">
            <p className="font-mono text-2xl font-bold">${(mrrCents / 100).toFixed(2)}</p>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Estimated MRR
            </p>
          </Card>
          <Card className="text-center">
            <p className="font-mono text-2xl font-bold">${(totalCostCents / 100).toFixed(2)}</p>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Model cost, 30 days
            </p>
          </Card>
        </div>

        <Card>
          <p className="tr-label">Model usage by operation (30 days)</p>
          {usage.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No model calls recorded. The diagnostic engine runs without one; usage only appears
              once free-text understanding, narration or photo analysis is exercised.
            </p>
          ) : (
            <div className="tr-scroll overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--text-dim)' }}>
                    <th className="py-1.5 text-left font-semibold">Operation</th>
                    <th className="py-1.5 text-right font-semibold">Calls</th>
                    <th className="py-1.5 text-right font-semibold">In</th>
                    <th className="py-1.5 text-right font-semibold">Out</th>
                    <th className="py-1.5 text-right font-semibold">Avg ms</th>
                    <th className="py-1.5 text-right font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((u) => (
                    <tr key={u.operation} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-1.5 font-mono text-xs">{u.operation}</td>
                      <td className="py-1.5 text-right tabular-nums">{u._count}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {(u._sum.inputTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {(u._sum.outputTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{Math.round(u._avg.latencyMs ?? 0)}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        ${((u._sum.costCents ?? 0) / 100).toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs" style={{ color: 'var(--text-dim)' }}>
            Cost is an estimate from configured per-token rates, not a bill.
          </p>
        </Card>

        <Card>
          <p className="tr-label">Failures (30 days): {failures}</p>
          {recent.length > 0 && (
            <ul className="space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              {recent.map((r) => (
                <li key={r.id}>
                  <span className="font-mono">{r.operation}</span> — {r.error ?? 'unknown'} ·{' '}
                  {new Date(r.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="tr-label">Active subscriptions</p>
          <ul className="text-sm">
            {active.length === 0 ? (
              <li style={{ color: 'var(--text-muted)' }}>None yet.</li>
            ) : (
              active.map((s) => (
                <li key={s.id} className="flex justify-between border-t py-1.5" style={{ borderColor: 'var(--border)' }}>
                  <span>{s.plan.name}</span>
                  <span className="font-mono">${(s.plan.priceCentsMonthly / 100).toFixed(2)}</span>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
