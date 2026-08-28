import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { handle, notFound } from '@/lib/api/respond';
import { getObject } from '@/lib/storage';

/**
 * Authenticated read for the local-disk storage driver. On S3 the client gets
 * a presigned URL and never reaches this route. Access is checked against the
 * owning row rather than trusting the key, so knowing a key is not enough.
 */
export const GET = handle(async (_request: Request, ctx: { params: Promise<{ key: string[] }> }) => {
  const user = await requireUser();
  const { key: segments } = await ctx.params;
  const key = decodeURIComponent(segments.join('/'));

  const photo = await prisma.photo.findFirst({
    where: {
      storageKey: key,
      ...(user.role === 'PLATFORM_ADMIN'
        ? {}
        : user.companyId
          ? { user: { companyId: user.companyId } }
          : { userId: user.id }),
    },
    select: { contentType: true },
  });

  const document = photo
    ? null
    : await prisma.knowledgeDocument.findFirst({
        where: {
          storageKey: key,
          OR: [{ companyId: null }, { companyId: user.companyId ?? undefined }],
        },
        select: { id: true },
      });

  if (!photo && !document) return notFound('That file does not exist, or you do not have access to it.');

  const body = await getObject(key);
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': photo?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline',
    },
  });
});
