import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { handle, notFound } from '@/lib/api/respond';
import { renderReportPdf } from '@/lib/reports/pdf';
import type { ServiceReportContent } from '@/lib/reports/types';

export const maxDuration = 60;

export const GET = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const report = await prisma.serviceReport.findFirst({
    where: {
      id,
      ...(user.role === 'COMPANY_ADMIN' && user.companyId
        ? { user: { companyId: user.companyId } }
        : { userId: user.id }),
    },
  });
  if (!report) return notFound('That report does not exist, or you do not have access to it.');

  const bytes = await renderReportPdf(
    report.content as unknown as ServiceReportContent,
    report.reportNumber,
  );

  await prisma.serviceReport.update({
    where: { id: report.id },
    data: { pdfGeneratedAt: new Date() },
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${report.reportNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
