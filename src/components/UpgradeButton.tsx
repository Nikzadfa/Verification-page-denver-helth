'use client';

import { useEffect, useState } from 'react';
import { ApiError, Spinner, api } from '@/components/ui';
import { isIosApp, storeKit } from '@/lib/native';

/**
 * Upgrade.
 *
 * Two payment paths, chosen by which shell the code is running in. On the web
 * it is Stripe Checkout. Inside the iOS app it is In-App Purchase, because
 * App Store Review Guideline 3.1.1 does not permit anything else — including
 * a link out to the web checkout.
 *
 * The product ids are build-time public values; they identify a product in
 * App Store Connect and are not secrets.
 */

const APPLE_PRODUCT: Record<string, string | undefined> = {
  PRO: process.env.NEXT_PUBLIC_APPLE_PRODUCT_PRO_MONTHLY,
  COMPANY: process.env.NEXT_PUBLIC_APPLE_PRODUCT_COMPANY_MONTHLY,
};

export function UpgradeButton({
  tier,
  planName,
  disabled,
}: {
  tier: string;
  planName: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Resolved after mount: the server render has no idea which shell it is for,
  // and guessing would flash the wrong button.
  const [native, setNative] = useState<boolean | null>(null);

  useEffect(() => setNative(isIosApp()), []);

  async function payWithStripe() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ url: string }>('/api/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({ tier, interval: 'monthly' }),
      });
      window.location.href = r.url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start checkout.');
      setBusy(false);
    }
  }

  async function payWithApple() {
    const bridge = storeKit();
    const productId = APPLE_PRODUCT[tier];

    if (!bridge || !productId) {
      setError(
        'In-App Purchase is not available in this build. Update the app from the App Store, or subscribe from a browser.',
      );
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { signedTransaction, transactionId, pending } = await bridge.purchase({ productId });
      if (!signedTransaction) {
        if (pending) {
          setError(
            'That purchase is waiting for approval. The plan unlocks as soon as it goes through.',
          );
        }
        // Otherwise the sheet was dismissed on purpose — not worth an error.
        setBusy(false);
        return;
      }
      await api('/api/iap/apple', {
        method: 'POST',
        body: JSON.stringify({ signedTransaction }),
      });
      // Only now is it safe to tell StoreKit we are done with it.
      if (transactionId) await bridge.finish({ transactionId }).catch(() => undefined);
      setDone(true);
      window.location.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The purchase could not be completed.');
      setBusy(false);
    }
  }

  async function restore() {
    const bridge = storeKit();
    if (!bridge) return;
    setBusy(true);
    setError(null);
    try {
      const { signedTransactions } = await bridge.restore();
      if (signedTransactions.length === 0) {
        setError('No previous purchase was found on this Apple Account.');
        setBusy(false);
        return;
      }
      for (const signedTransaction of signedTransactions) {
        await api('/api/iap/apple', {
          method: 'POST',
          body: JSON.stringify({ signedTransaction }),
        });
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not restore that purchase.');
      setBusy(false);
    }
  }

  if (native === null) {
    return (
      <button type="button" className="tr-btn tr-btn-primary w-full" disabled>
        Upgrade to {planName}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="tr-btn tr-btn-primary w-full"
        onClick={native ? payWithApple : payWithStripe}
        disabled={busy || done || (!native && disabled)}
      >
        {busy ? (
          <Spinner label={native ? 'Contacting the App Store' : 'Opening checkout'} />
        ) : (
          `Upgrade to ${planName}`
        )}
      </button>

      {native && (
        <button
          type="button"
          className="tr-btn tr-btn-ghost w-full text-sm"
          onClick={restore}
          disabled={busy}
        >
          Restore purchases
        </button>
      )}

      {error && (
        <p className="text-xs" role="alert" style={{ color: 'var(--color-alert-400)' }}>
          {error}
        </p>
      )}
    </>
  );
}
