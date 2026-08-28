import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { fail, handle, ok } from '@/lib/api/respond';
import { BillingUnavailableError, createPortalSession, isStripeConfigured } from '@/lib/billing/stripe';

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  if (!isStripeConfigured()) {
    return fail('Billing is not enabled on this deployment.', 503, 'billing_unavailable');
  }
  try {
    const url = await createPortalSession({
      userId: user.id,
      companyId: user.companyId,
      origin: process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin,
    });
    return ok({ url });
  } catch (e) {
    if (e instanceof BillingUnavailableError) return fail(e.message, 503, 'billing_unavailable');
    throw e;
  }
});
