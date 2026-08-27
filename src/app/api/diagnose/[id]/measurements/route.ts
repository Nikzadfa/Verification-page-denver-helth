import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { measurementsSchema } from '@/lib/api/schemas';
import { handle, notFound, ok } from '@/lib/api/respond';
import { submitMeasurements } from '@/lib/diagnose/service';
import { serializeView } from '@/lib/diagnose/serialize';

export const POST = handle(async (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = measurementsSchema.parse(await request.json());

  const result = await submitMeasurements(user, id, body.readings, body.testId);
  if (!result) return notFound('That diagnosis does not exist, or it belongs to another technician.');

  return ok({
    narration: result.narration,
    view: serializeView(result.view),
    warnings: result.warnings,
  });
});
