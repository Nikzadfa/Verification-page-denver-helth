import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { getEntitlements } from '@/lib/billing/entitlements';
import { jobSchema } from '@/lib/api/schemas';
import { findOrCreateCustomer, getScopedCustomer } from '@/lib/customers/service';
import { fail, handle, ok } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const user = await requireUser();
  const jobs = await prisma.job.findMany({
    where:
      user.role === 'COMPANY_ADMIN' && user.companyId
        ? { companyId: user.companyId }
        : { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: {
      customer: { select: { id: true, name: true, address: true, phone: true } },
      _count: { select: { diagnosticSessions: true, reports: true } },
    },
  });
  return ok({ jobs });
});

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const entitlements = await getEntitlements(user.id);
  if (!entitlements.savedJobs) {
    return fail(
      'Saved jobs are a Pro feature. Your diagnoses are still available in your history.',
      402,
      'quota_exceeded',
    );
  }

  const body = jobSchema.parse(await request.json());

  // An existing customer wins over typed-in details; otherwise the name is
  // matched against the book so a repeat visit lands on the same record
  // instead of creating a second copy of the same house.
  let customerId: string | null = null;
  if (body.customerId) {
    const existing = await getScopedCustomer(user, body.customerId);
    if (!existing) {
      return fail('That customer does not exist, or belongs to another account.', 404, 'not_found');
    }
    customerId = existing.id;
  } else if (body.customerName?.trim()) {
    const customer = await findOrCreateCustomer(user, {
      name: body.customerName,
      phone: body.customerPhone ?? null,
      address: body.customerAddress ?? null,
    });
    customerId = customer.id;
  }

  const job = await prisma.job.create({
    data: {
      userId: user.id,
      companyId: user.companyId,
      customerId,
      title: body.title,
      complaint: body.complaint ?? null,
      jobNumber: body.jobNumber ?? null,
    },
  });

  return ok({ job }, 201);
});
