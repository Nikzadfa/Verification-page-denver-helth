import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { customerPatchSchema } from '@/lib/api/schemas';
import { customerData, getScopedCustomer } from '@/lib/customers/service';
import { fail, handle, notFound, ok } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const customer = await getScopedCustomer(user, id);
  if (!customer) return notFound('That customer does not exist, or belongs to another account.');

  const [jobs, equipment] = await Promise.all([
    prisma.job.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        jobNumber: true,
        complaint: true,
        status: true,
        createdAt: true,
        completedAt: true,
        _count: { select: { diagnosticSessions: true, reports: true } },
      },
    }),
    prisma.equipment.findMany({
      where: { customerId: customer.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        modelNumber: true,
        serialNumber: true,
        refrigerant: true,
        nominalTons: true,
        location: true,
        installedOn: true,
        manufacturer: { select: { name: true } },
      },
    }),
  ]);

  return ok({ customer, jobs, equipment });
});

export const PATCH = handle(async (request: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const existing = await getScopedCustomer(user, id);
  if (!existing) return notFound('That customer does not exist, or belongs to another account.');

  const body = customerPatchSchema.parse(await request.json());
  // Only overwrite the fields the request actually named, so a partial edit
  // from the customer screen cannot blank out the address.
  const cleaned = customerData({ name: body.name ?? existing.name, ...body });
  const data = Object.fromEntries(
    Object.entries(cleaned).filter(([key]) => key === 'name' || key in body),
  );

  const customer = await prisma.customer.update({ where: { id: existing.id }, data });
  return ok({ customer });
});

export const DELETE = handle(async (_request: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const existing = await getScopedCustomer(user, id);
  if (!existing) return notFound('That customer does not exist, or belongs to another account.');

  // Jobs point at the customer with ON DELETE SET NULL, so deleting one with
  // history would silently detach every job and report filed against it. That
  // is a records loss a technician cannot undo, so it needs a decision rather
  // than a confirm dialog.
  const jobs = await prisma.job.count({ where: { customerId: existing.id } });
  if (jobs > 0) {
    return fail(
      `${existing.name} has ${jobs} job${jobs === 1 ? '' : 's'} on file. Deleting the customer would leave those jobs with no one attached. Delete or reassign the jobs first.`,
      409,
      'customer_has_jobs',
    );
  }

  await prisma.customer.delete({ where: { id: existing.id } });
  return ok({ deleted: true });
});
