import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { assertCanUseReports } from '@/lib/billing/entitlements';
import { reportSchema } from '@/lib/api/schemas';
import { handle, notFound, ok } from '@/lib/api/respond';
import { buildReportContent, createReport } from '@/lib/reports/build';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const user = await requireUser();
  const reports = await prisma.serviceReport.findMany({
    where:
      user.role === 'COMPANY_ADMIN' && user.companyId
        ? { user: { companyId: user.companyId } }
        : { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      reportNumber: true,
      status: true,
      createdAt: true,
      sessionId: true,
      jobId: true,
      content: true,
    },
  });
  return ok({ reports });
});

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  await assertCanUseReports(user.id);

  const body = reportSchema.parse(await request.json());

  const session = await prisma.diagnosticSession.findFirst({
    where: { id: body.sessionId, userId: user.id },
    select: { id: true, jobId: true },
  });
  if (!session) return notFound('That diagnosis does not exist, or it belongs to another technician.');

  const content = await buildReportContent(session.id);
  content.technicianNotes = body.technicianNotes ?? null;

  // One report per session; regenerating updates in place rather than piling
  // up near-identical documents a customer might receive twice.
  const existing = await prisma.serviceReport.findFirst({
    where: { sessionId: session.id, userId: user.id },
    select: { id: true },
  });

  const report = existing
    ? await prisma.serviceReport.update({
        where: { id: existing.id },
        data: {
          content: content as unknown as object,
          technicianNotes: body.technicianNotes ?? null,
          status: body.finalize ? 'FINAL' : 'DRAFT',
          pdfKey: null,
          pdfGeneratedAt: null,
        },
      })
    : await createReport({
        userId: user.id,
        jobId: session.jobId,
        sessionId: session.id,
        content,
        technicianNotes: body.technicianNotes ?? null,
        finalize: body.finalize,
      });

  return ok({ report: { id: report.id, reportNumber: report.reportNumber, status: report.status }, content }, existing ? 200 : 201);
});
