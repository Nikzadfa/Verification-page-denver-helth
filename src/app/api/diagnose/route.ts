import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { startDiagnosisSchema } from '@/lib/api/schemas';
import { handle, ok } from '@/lib/api/respond';
import { startSession } from '@/lib/diagnose/service';

export const dynamic = 'force-dynamic';

/** List the technician's recent sessions. */
export const GET = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 25), 100);

  const sessions = await prisma.diagnosticSession.findMany({
    where: user.role === 'COMPANY_ADMIN' && user.companyId
      ? { user: { companyId: user.companyId } }
      : { userId: user.id },
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      complaint: true,
      equipmentType: true,
      phase: true,
      confidence: true,
      conclusion: true,
      startedAt: true,
      completedAt: true,
    },
  });

  return ok({ sessions });
});

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const body = startDiagnosisSchema.parse(await request.json());
  const result = await startSession(user, body);
  return ok(
    {
      sessionId: result.sessionId,
      narration: result.narration,
      faultResolution: result.faultResolution,
      phase: result.view.state.phase,
    },
    201,
  );
});
