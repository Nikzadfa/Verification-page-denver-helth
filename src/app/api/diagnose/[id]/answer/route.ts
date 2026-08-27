import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { answerSchema } from '@/lib/api/schemas';
import { handle, notFound, ok } from '@/lib/api/respond';
import { answerTest } from '@/lib/diagnose/service';
import { serializeView } from '@/lib/diagnose/serialize';

export const POST = handle(async (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = answerSchema.parse(await request.json());

  const result = await answerTest(user, id, body.testId, body.optionValue);
  if (!result) return notFound('That diagnosis or test step could not be found.');

  return ok({ narration: result.narration, view: serializeView(result.view) });
});
