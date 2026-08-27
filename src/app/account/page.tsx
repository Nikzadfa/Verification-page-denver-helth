'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, AppHeader, Card, ErrorNote, SignOutButton, Spinner, api } from '@/components/ui';

interface Profile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  licenseNumber: string | null;
  epaCert: string | null;
  createdAt: string;
  company: { name: string } | null;
}

interface Entitlements {
  tier: string;
  planName: string;
  diagnosesRemaining: number | 'unlimited';
  photosRemaining: number | 'unlimited';
  periodEnd: string | null;
  status: string;
}

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ profile: Profile; entitlements: Entitlements | null }>('/api/account')
      .then((r) => {
        setProfile(r.profile);
        setEntitlements(r.entitlements);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load your account.'))
      .finally(() => setLoading(false));
  }, []);

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/account', {
        method: 'DELETE',
        body: JSON.stringify({ password, confirm }),
      });
      router.push('/login');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete your account.');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <AppHeader title="Account" back="/" />

      <div className="space-y-4 px-3 py-4">
        <ErrorNote>{error}</ErrorNote>

        {loading ? (
          <Spinner label="Loading account" />
        ) : profile ? (
          <>
            <Card className="space-y-2">
              <p className="text-lg font-bold">{profile.fullName}</p>
              <dl className="space-y-2 text-sm">
                <Row label="Email" value={profile.email} />
                <Row label="Phone" value={profile.phone} />
                <Row label="Company" value={profile.company?.name ?? null} />
                <Row label="License" value={profile.licenseNumber} />
                <Row label="EPA cert" value={profile.epaCert} />
                <Row
                  label="Joined"
                  value={new Date(profile.createdAt).toLocaleDateString()}
                />
              </dl>
            </Card>

            {entitlements && (
              <Card className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{entitlements.planName}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {entitlements.diagnosesRemaining === 'unlimited'
                        ? 'Unlimited diagnoses'
                        : `${entitlements.diagnosesRemaining} diagnoses left this period`}
                    </p>
                  </div>
                  <span className="tr-chip sev-INFO shrink-0">{entitlements.status}</span>
                </div>
                {entitlements.periodEnd && (
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    Renews {new Date(entitlements.periodEnd).toLocaleDateString()}
                  </p>
                )}
                <Link href="/pricing" className="tr-btn tr-btn-secondary w-full">
                  {entitlements.tier === 'FREE' ? 'See plans' : 'Change plan'}
                </Link>
              </Card>
            )}
          </>
        ) : null}

        <div className="grid gap-2">
          <Link href="/legal/privacy" className="tr-btn tr-btn-secondary w-full">
            Privacy policy
          </Link>
          <Link href="/legal/terms" className="tr-btn tr-btn-secondary w-full">
            Terms of use
          </Link>
          <Link href="/legal/support" className="tr-btn tr-btn-secondary w-full">
            Support
          </Link>
          <SignOutButton />
        </div>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-alert-400)' }}>
            Delete account
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            This removes your account, your diagnoses, your jobs, your service reports and every
            photo you uploaded. If you are a solo technician, your customer records go too. It
            cannot be undone and support cannot restore it.
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            A paid subscription is billed by whoever you bought it from. Cancel it there as well —
            deleting the account here does not stop an App Store subscription.
          </p>

          {confirming ? (
            <form onSubmit={remove} className="space-y-3">
              <div>
                <label className="tr-label" htmlFor="del-password">
                  Your password
                </label>
                <input
                  id="del-password"
                  type="password"
                  className="tr-input"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="tr-label" htmlFor="del-confirm">
                  Type DELETE to confirm
                </label>
                <input
                  id="del-confirm"
                  className="tr-input"
                  autoComplete="off"
                  autoCapitalize="characters"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="tr-btn tr-btn-secondary"
                  onClick={() => {
                    setConfirming(false);
                    setPassword('');
                    setConfirm('');
                  }}
                >
                  Keep my account
                </button>
                <button
                  type="submit"
                  className="tr-btn tr-btn-primary"
                  style={{ background: 'var(--color-alert-500)', color: '#fff' }}
                  disabled={busy || confirm !== 'DELETE' || password.length === 0}
                >
                  {busy ? <Spinner label="Deleting" /> : 'Delete permanently'}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="tr-btn tr-btn-secondary w-full"
              style={{ color: 'var(--color-alert-400)' }}
              onClick={() => setConfirming(true)}
            >
              Delete my account
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-xs" style={{ color: 'var(--text-dim)' }}>
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-words">
        {value ?? <span style={{ color: 'var(--text-dim)' }}>—</span>}
      </dd>
    </div>
  );
}
