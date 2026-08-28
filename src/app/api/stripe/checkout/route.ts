import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { fail, handle, ok } from '@/lib/api/respond';
import { BillingUnavailableError, createCheckoutSession, isStripeConfigured } from '@/lib/billing/stripe';

const schema = z.object({
  tier: z.enum(['PRO', 'COMPANY']),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
});

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  if (!isStripeConfigured()) {
    return fail(
      'Self-service checkout is not enabled on this deployment. Contact your administrator to change your plan.',
      503,
      'billing_unavailable',
    );
  }

  const body = schema.parse(await request.json());

  try {
    const url = await createCheckoutSession({
      userId: user.id,
      email: user.email,
      companyId: body.tier === 'COMPANY' ? user.companyId : null,
      tier: body.tier,
      interval: body.interval,
      origin: process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin,
    });
    return ok({ url });
  } catch (e) {
    if (e instanceof BillingUnavailableError) return fail(e.message, 503, 'billing_unavailable');
    throw e;
  }
});
