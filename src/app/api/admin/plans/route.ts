import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { handle, notFound, ok } from '@/lib/api/respond';
import { planUpdateSchema } from '@/lib/api/schemas';
import { ensurePlansSeeded } from '@/lib/billing/entitlements';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin();
  await ensurePlansSeeded();
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
  return ok({ plans });
});

const patchSchema = planUpdateSchema.extend({
  id: z.string().uuid(),
  stripePriceIdMonthly: z.string().max(120).nullish(),
  stripePriceIdYearly: z.string().max(120).nullish(),
});

export const PATCH = handle(async (request: NextRequest) => {
  const admin = await requireAdmin();
  const { id, ...data } = patchSchema.parse(await request.json());

  const before = await prisma.plan.findUnique({ where: { id } });
  if (!before) return notFound('That plan does not exist.');

  const plan = await prisma.plan.update({ where: { id }, data });

  // Pricing changes are exactly the sort of thing that needs an audit trail.
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'plan.update',
      entityType: 'Plan',
      entityId: id,
      before: before as unknown as object,
      after: plan as unknown as object,
    },
  });

  return ok({ plan });
});
