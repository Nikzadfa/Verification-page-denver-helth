import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { AppleVerificationError, isAppleIapConfigured, verifyTransaction } from '@/lib/billing/apple';
import { AppleGrantError, applyAppleTransaction } from '@/lib/billing/appleGrant';
import { getEntitlements } from '@/lib/billing/entitlements';
import { fail, handle, ok } from '@/lib/api/respond';

/**
 * The iOS app posts the JWS StoreKit handed it, here, after a purchase and
 * again on "Restore purchases".
 *
 * Nothing about the request is trusted: the signature, the certificate chain
 * and the bundle id are all checked before a plan is granted.
 */

export const dynamic = 'force-dynamic';

const schema = z.object({
  signedTransaction: z.string().min(20).max(20_000),
});

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();

  if (!isAppleIapConfigured()) {
    return fail(
      'In-App Purchase is not configured on this deployment.',
      503,
      'billing_unavailable',
    );
  }

  const body = schema.parse(await request.json());

  try {
    const transaction = await verifyTransaction(body.signedTransaction);
    const { tier, status } = await applyAppleTransaction(transaction, user.id);
    const entitlements = await getEntitlements(user.id);
    return ok({ tier, status, entitlements });
  } catch (error) {
    if (error instanceof AppleVerificationError) {
      console.error('[iap] receipt verification failed', error.message);
      return fail(error.message, 400, 'receipt_invalid');
    }
    if (error instanceof AppleGrantError) {
      return fail(error.message, 409, 'receipt_conflict');
    }
    throw error;
  }
});
