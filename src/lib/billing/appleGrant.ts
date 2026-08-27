/**
 * Turning a verified Apple transaction into a subscription.
 *
 * Kept apart from the verification itself so the rules about *who* a purchase
 * belongs to are readable on their own — and so the verification module has no
 * database dependency and stays testable.
 */

import type { PlanTier, SubscriptionStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { type AppleTransaction, isActive, tierForProduct } from '@/lib/billing/apple';

export class AppleGrantError extends Error {}

/**
 * Apply a verified transaction to a user's subscription.
 *
 * `userId` is supplied when the app itself submits the receipt (we know who is
 * signed in). Server notifications arrive with no user attached, so those
 * resolve the subscriber from the original transaction id recorded on the
 * first purchase.
 */
export async function applyAppleTransaction(
  transaction: AppleTransaction,
  userId?: string,
): Promise<{ tier: PlanTier; status: SubscriptionStatus }> {
  const tier = tierForProduct(transaction.productId);
  if (!tier) {
    throw new AppleGrantError(
      `Product ${transaction.productId} is not mapped to a plan. Set APPLE_PRODUCT_* in the environment.`,
    );
  }

  const plan = await prisma.plan.findUnique({ where: { tier } });
  if (!plan) throw new AppleGrantError(`No ${tier} plan exists to grant.`);

  const active = isActive(transaction);
  // A lapsed subscription is CANCELED rather than a status of its own: the
  // enum has no EXPIRED, and entitlements treat anything but ACTIVE/TRIALING
  // as no longer entitled.
  const status: SubscriptionStatus = active ? 'ACTIVE' : 'CANCELED';

  const periodEnd = transaction.expiresDate ? new Date(transaction.expiresDate) : null;

  // A receipt already tied to a subscription always updates that one, whoever
  // submitted it. Otherwise it attaches to the signed-in user. Without the
  // first rule, restoring a purchase on a second account would move the
  // subscription; without the second, a first purchase would have nowhere to
  // go.
  const existing = await prisma.subscription.findFirst({
    where: { appleOriginalTransactionId: transaction.originalTransactionId },
  });

  if (existing) {
    if (userId && existing.userId && existing.userId !== userId) {
      throw new AppleGrantError(
        'That App Store purchase is already attached to a different ThermoRivet account. ' +
          'Sign in with that account, or contact support to move it.',
      );
    }
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        status,
        currentPeriodEnd: periodEnd,
        appleProductId: transaction.productId,
        appleEnvironment: transaction.environment,
        cancelAtPeriodEnd: false,
      },
    });
    return { tier, status };
  }

  if (!userId) {
    // A notification for a purchase we have never seen. Nothing to attach it
    // to; the app will submit the receipt when it next opens.
    throw new AppleGrantError('No subscription matches that App Store transaction yet.');
  }

  const mine = await prisma.subscription.findFirst({ where: { userId } });
  if (mine) {
    await prisma.subscription.update({
      where: { id: mine.id },
      data: {
        planId: plan.id,
        status,
        currentPeriodEnd: periodEnd,
        appleOriginalTransactionId: transaction.originalTransactionId,
        appleProductId: transaction.productId,
        appleEnvironment: transaction.environment,
        cancelAtPeriodEnd: false,
        // A new billing period starts with the counters clear.
        diagnosesUsed: 0,
        photosUsed: 0,
      },
    });
  } else {
    await prisma.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status,
        currentPeriodEnd: periodEnd,
        appleOriginalTransactionId: transaction.originalTransactionId,
        appleProductId: transaction.productId,
        appleEnvironment: transaction.environment,
      },
    });
  }

  return { tier, status };
}
