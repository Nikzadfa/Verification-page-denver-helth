'use client';

import { useState } from 'react';
import { ApiError, Spinner, api } from '@/components/ui';

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

  async function go() {
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

  return (
    <>
      <button type="button" className="tr-btn tr-btn-primary w-full" onClick={go} disabled={busy || disabled}>
        {busy ? <Spinner label="Opening checkout" /> : `Upgrade to ${planName}`}
      </button>
      {error && (
        <p className="text-xs" style={{ color: 'var(--color-alert-400)' }}>
          {error}
        </p>
      )}
    </>
  );
}
