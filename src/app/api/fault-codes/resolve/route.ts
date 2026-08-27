import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { getEntitlements } from '@/lib/billing/entitlements';
import { faultCodeQuerySchema } from '@/lib/api/schemas';
import { fail, handle, ok } from '@/lib/api/respond';
import { resolveFaultCode } from '@/lib/faultcodes/resolve';
import { slugify } from '@/lib/rag/retrieve';
import { retrieveForQuestion } from '@/lib/rag/retrieve';

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const entitlements = await getEntitlements(user.id);
  if (!entitlements.faultCodeLookup) {
    return fail('Fault-code lookup is not included in your plan.', 402, 'quota_exceeded');
  }

  const body = faultCodeQuerySchema.parse(await request.json());
  const manufacturerSlug = slugify(body.manufacturer);

  const resolution = await resolveFaultCode({
    manufacturerSlug,
    code: body.code,
    equipmentType: body.equipmentType ?? null,
    modelNumber: body.modelNumber ?? null,
    controlBoard: body.controlBoard ?? null,
  });

  // Pull any manufacturer documentation covering this code so the answer can
  // cite a source rather than resting on the seeded entry alone.
  const retrieval = await retrieveForQuestion({
    question: `${body.manufacturer} ${body.modelNumber ?? ''} fault code ${body.code} ${resolution.candidates[0]?.title ?? ''}`,
    manufacturerSlug,
    equipmentType: body.equipmentType ?? null,
    companyId: user.companyId,
    limit: 4,
  }).catch(() => null);

  return ok({ resolution, citations: retrieval?.citations ?? [] });
});
