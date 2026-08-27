/**
 * Stripe integration.
 *
 * Prices live in the database, not in Stripe alone, so an administrator can
 * change what a plan costs and what it includes from the admin dashboard.
 * Stripe price ids are attached to the Plan row; when one is missing the
 * checkout route says so plainly rather than failing with a Stripe error the
 * technician cannot act on.
 */

import Stripe from 'stripe';
import type { PlanTier, SubscriptionStatus } from '@prisma/client';
import { prisma } from '@/lib/db';

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new BillingUnavailableError(
      'Stripe is not configured on this deployment. Plans and entitlements still work; only self-service checkout is unavailable.',
    );
  }
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export class BillingUnavailableError extends Error {}

/** Map Stripe's subscription status onto ours. */
export function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'canceled':
    case 'paused':
      return 'CANCELED';
    default:
      return 'INCOMPLETE';
  }
}

export async function createCheckoutSession(params: {
  userId: string;
  email: string;
  companyId: string | null;
  tier: PlanTier;
  interval: 'monthly' | 'yearly';
  origin: string;
}): Promise<string> {
  const plan = await prisma.plan.findUnique({ where: { tier: params.tier } });
  if (!plan) throw new BillingUnavailableError('That plan does not exist.');

  const priceId = params.interval === 'yearly' ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
  if (!priceId) {
    throw new BillingUnavailableError(
      `The ${plan.name} plan has no Stripe price configured for ${params.interval} billing. An administrator can add it under Admin → Plans.`,
    );
  }

  // Reuse the customer so a technician who upgrades twice does not end up with
  // two Stripe customers and a confusing billing history.
  const existing = await prisma.subscription.findFirst({
    where: params.companyId ? { companyId: params.companyId } : { userId: params.userId },
    select: { stripeCustomerId: true },
  });

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${params.origin}/pricing?upgraded=1`,
    cancel_url: `${params.origin}/pricing`,
    ...(existing?.stripeCustomerId
      ? { customer: existing.stripeCustomerId }
      : { customer_email: params.email }),
    client_reference_id: params.companyId ?? params.userId,
    metadata: {
      userId: params.userId,
      companyId: params.companyId ?? '',
      tier: params.tier,
    },
    subscription_data: {
      metadata: { userId: params.userId, companyId: params.companyId ?? '', tier: params.tier },
    },
  });

  if (!session.url) throw new BillingUnavailableError('Stripe did not return a checkout URL.');
  return session.url;
}

export async function createPortalSession(params: {
  userId: string;
  companyId: string | null;
  origin: string;
}): Promise<string> {
  const subscription = await prisma.subscription.findFirst({
    where: params.companyId ? { companyId: params.companyId } : { userId: params.userId },
    select: { stripeCustomerId: true },
  });

  if (!subscription?.stripeCustomerId) {
    throw new BillingUnavailableError('There is no billing account to manage yet.');
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${params.origin}/pricing`,
  });
  return session.url;
}

/**
 * Apply a Stripe subscription to our records. Idempotent: webhooks are
 * delivered at least once and can arrive out of order, so this always writes
 * the current state rather than incrementing anything.
 */
export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const metadata = subscription.metadata ?? {};
  const userId = metadata.userId || null;
  const companyId = metadata.companyId || null;
  const tier = (metadata.tier as PlanTier) || 'PRO';

  const plan = await prisma.plan.findUnique({ where: { tier } });
  if (!plan) return;

  const item = subscription.items.data[0];
  const periodStart = item?.current_period_start ?? null;
  const periodEnd = item?.current_period_end ?? null;

  const data = {
    planId: plan.id,
    status: mapStatus(subscription.status),
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    ...(periodStart ? { currentPeriodStart: new Date(periodStart * 1000) } : {}),
    ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
  };

  const where = companyId ? { companyId } : userId ? { userId } : null;
  if (!where) return;

  const existing = await prisma.subscription.findFirst({ where });

  if (existing) {
    await prisma.subscription.update({ where: { id: existing.id }, data });
  } else {
    await prisma.subscription.create({
      data: { ...data, ...(companyId ? { companyId } : { userId: userId! }) },
    });
  }
}
