import type { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { fail, handle, ok } from '@/lib/api/respond';
import { isStripeConfigured, stripe, syncSubscription } from '@/lib/billing/stripe';

/**
 * Stripe webhook.
 *
 * The signature is verified against the raw body before anything is trusted —
 * without that check, anyone who knows the URL could grant themselves a
 * Company subscription with a POST.
 */
export const POST = handle(async (request: NextRequest) => {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return fail('Stripe webhooks are not configured.', 503, 'billing_unavailable');
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return fail('Missing Stripe signature.', 400, 'bad_signature');

  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('[stripe] signature verification failed', error);
    return fail('Signature verification failed.', 400, 'bad_signature');
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncSubscription(event.data.object);
      break;

    case 'checkout.session.completed': {
      const session = event.data.object;
      if (typeof session.subscription === 'string') {
        const subscription = await stripe().subscriptions.retrieve(session.subscription);
        // Checkout metadata is the authoritative link back to our user or
        // company; subscription metadata can be empty on the first event.
        subscription.metadata = { ...subscription.metadata, ...session.metadata };
        await syncSubscription(subscription);
      }
      break;
    }

    default:
      // Unhandled event types are acknowledged so Stripe stops retrying.
      break;
  }

  return ok({ received: true });
});
