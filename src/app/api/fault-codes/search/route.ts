import type { NextRequest } from 'next/server';
import { EquipmentType } from '@prisma/client';
import { requireUser } from '@/lib/auth/session';
import { handle, ok } from '@/lib/api/respond';
import { searchFaultCodes } from '@/lib/faultcodes/resolve';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: NextRequest) => {
  await requireUser();
  const params = request.nextUrl.searchParams;
  const equipmentType = params.get('equipmentType');

  const [codes, manufacturers] = await Promise.all([
    searchFaultCodes({
      manufacturerSlug: params.get('manufacturer') ?? undefined,
      equipmentType:
        equipmentType && equipmentType in EquipmentType
          ? (equipmentType as EquipmentType)
          : undefined,
      query: params.get('q') ?? undefined,
      limit: Math.min(Number(params.get('limit') ?? 60), 200),
    }),
    prisma.manufacturer.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { name: true, slug: true, parent: true },
    }),
  ]);

  return ok({ codes, manufacturers });
});
