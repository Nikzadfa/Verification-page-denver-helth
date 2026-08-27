import { requireAdmin } from '@/lib/auth/session';
import { handle, ok } from '@/lib/api/respond';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin();

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [
    users,
    companies,
    sessions,
    reports,
    documents,
    faultCodes,
    subscriptions,
    usage,
    recentRuns,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.company.count(),
    prisma.diagnosticSession.count(),
    prisma.serviceReport.count(),
    prisma.knowledgeDocument.count(),
    prisma.faultCode.count(),
    prisma.subscription.groupBy({ by: ['status'], _count: true }),
    prisma.aiUsageEvent.groupBy({
      by: ['operation'],
      where: { createdAt: { gte: since } },
      _count: true,
      _sum: { inputTokens: true, outputTokens: true, costCents: true },
      _avg: { latencyMs: true },
    }),
    prisma.evalRun.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);

  // Monthly recurring revenue from active subscriptions, at the prices
  // currently configured. Labelled as an estimate in the UI because it does
  // not account for proration or partial periods.
  const active = await prisma.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'TRIALING'] } },
    include: { plan: { select: { priceCentsMonthly: true } } },
  });
  const mrrCents = active.reduce((a, s) => a + s.plan.priceCentsMonthly, 0);

  const failures = await prisma.aiUsageEvent.count({
    where: { createdAt: { gte: since }, ok: false },
  });

  return ok({
    counts: { users, companies, sessions, reports, documents, faultCodes },
    subscriptions,
    mrrCents,
    usage,
    failures,
    recentRuns,
  });
});
