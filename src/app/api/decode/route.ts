import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { decodeSchema } from '@/lib/api/schemas';
import { handle, ok } from '@/lib/api/respond';
import { decodeModel, decodedSummary } from '@/lib/decoder';

export const POST = handle(async (request: NextRequest) => {
  await requireUser();
  const body = decodeSchema.parse(await request.json());

  const decoded = decodeModel(body.modelNumber, body.serialNumber, body.manufacturer);
  return ok({ decoded, summary: decodedSummary(decoded) });
});
