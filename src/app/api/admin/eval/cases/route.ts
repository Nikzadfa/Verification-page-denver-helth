import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { evalCaseSchema } from '@/lib/api/schemas';
import { handle, ok } from '@/lib/api/respond';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin();
  const cases = await prisma.evalCase.findMany({ orderBy: { slug: 'asc' } });
  return ok({ cases });
});

export const POST = handle(async (request: NextRequest) => {
  await requireAdmin();
  const body = evalCaseSchema.parse(await request.json());

  const created = await prisma.evalCase.upsert({
    where: { slug: body.slug },
    create: {
      slug: body.slug,
      name: body.name,
      category: body.category,
      tags: body.tags,
      scenario: body.scenario as object,
      expectations: body.expectations as object,
      active: body.active,
    },
    update: {
      name: body.name,
      category: body.category,
      tags: body.tags,
      scenario: body.scenario as object,
      expectations: body.expectations as object,
      active: body.active,
    },
  });

  return ok({ case: created }, 201);
});
