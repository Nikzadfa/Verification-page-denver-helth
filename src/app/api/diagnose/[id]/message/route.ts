import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { messageSchema } from '@/lib/api/schemas';
import { handle, notFound, ok } from '@/lib/api/respond';
import { handleMessage } from '@/lib/diagnose/service';
import { serializeView } from '@/lib/diagnose/serialize';

export const POST = handle(async (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = messageSchema.parse(await request.json());

  const result = await handleMessage(user, id, body.text, body.source);
  if (!result) return notFound('That diagnosis does not exist, or it belongs to another technician.');

  return ok({
    narration: result.narration,
    view: serializeView(result.view),
    extraction: result.extraction
      ? {
          measurements: result.extraction.measurements,
          technicianOpinion: result.extraction.technicianOpinion,
          ambiguous: result.extraction.ambiguous,
          warnings: result.extraction.warnings,
        }
      : null,
  });
});
