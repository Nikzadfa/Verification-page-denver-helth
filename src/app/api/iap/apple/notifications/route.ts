import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  AppleVerificationError,
  isAppleIapConfigured,
  verifySignedPayload,
  verifyTransaction,
} from '@/lib/billing/apple';
import { AppleGrantError, applyAppleTransaction } from '@/lib/billing/appleGrant';
import { handle, ok } from '@/lib/api/respond';

/**
 * App Store Server Notifications V2.
 *
 * Renewals, cancellations, refunds and billing failures happen entirely
 * between the subscriber and Apple; without this endpoint the app would only
 * learn about them the next time it happened to be opened.
 *
 * The URL is public, so the JWS signature is the only thing standing between
 * this and a stranger granting themselves a plan. It is verified exactly as a
 * purchase receipt is.
 *
 * Apple retries on a non-2xx. A payload we understand but cannot apply is
 * still acknowledged — retrying it would not change the outcome — while a
 * payload that fails verification is rejected loudly.
 */

export const dynamic = 'force-dynamic';

const schema = z.object({ signedPayload: z.string().min(20).max(100_000) });

interface NotificationPayload {
  notificationType?: unknown;
  subtype?: unknown;
  data?: { signedTransactionInfo?: unknown };
}

export const POST = handle(async (request: NextRequest) => {
  if (!isAppleIapConfigured()) {
    // Acknowledged rather than errored: Apple should not retry against a
    // deployment that has no IAP configured at all.
    return ok({ received: true, applied: false, reason: 'not_configured' });
  }

  const body = schema.parse(await request.json());

  let notification: NotificationPayload;
  try {
    notification = await verifySignedPayload<NotificationPayload>(body.signedPayload);
  } catch (error) {
    const message = error instanceof AppleVerificationError ? error.message : 'Unverifiable payload.';
    console.error('[iap] notification verification failed', message);
    // 401 rather than 400: this is an authentication failure, and Apple's
    // retry will not fix a bad signature.
    return Response.json({ error: message, code: 'receipt_invalid' }, { status: 401 });
  }

  const type = typeof notification.notificationType === 'string' ? notification.notificationType : '';
  const signed = notification.data?.signedTransactionInfo;

  if (typeof signed !== 'string') {
    return ok({ received: true, applied: false, type });
  }

  try {
    const transaction = await verifyTransaction(signed);
    const result = await applyAppleTransaction(transaction);
    return ok({ received: true, applied: true, type, status: result.status });
  } catch (error) {
    if (error instanceof AppleGrantError) {
      // A notification for a purchase we have not seen, or one mapped to no
      // plan. Nothing a retry would fix.
      console.warn('[iap] notification not applied', type, error.message);
      return ok({ received: true, applied: false, type });
    }
    if (error instanceof AppleVerificationError) {
      console.error('[iap] notification transaction invalid', error.message);
      return Response.json({ error: error.message, code: 'receipt_invalid' }, { status: 401 });
    }
    throw error;
  }
});
