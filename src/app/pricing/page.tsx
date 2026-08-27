import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { ensurePlansSeeded, getEntitlements } from '@/lib/billing/entitlements';
import { prisma } from '@/lib/db';
import { isStripeConfigured } from '@/lib/billing/stripe';
import { AppHeader, Card } from '@/components/ui';
import { UpgradeButton } from '@/components/UpgradeButton';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  await ensurePlansSeeded().catch(() => undefined);

  const [plans, entitlements] = await Promise.all([
    prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }).catch(() => []),
    getEntitlements(user.id).catch(() => null),
  ]);

  const stripeReady = isStripeConfigured();

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <AppHeader title="Plans" back="/" />

      <div className="space-y-4 px-3 py-4">
        {entitlements && (
          <Card>
            <p className="text-sm">
              You are on <span className="font-bold">{entitlements.planName}</span>.
              {entitlements.diagnosesRemaining !== 'unlimited' && (
                <span style={{ color: 'var(--text-muted)' }}>
                  {' '}
                  {entitlements.diagnosesRemaining} diagnoses left this period.
                </span>
              )}
            </p>
          </Card>
        )}

        {!stripeReady && (
          <Card>
            <p className="text-sm" style={{ color: 'var(--color-warn-400)' }}>
              Self-service checkout is not enabled on this deployment. Plans and limits still
              apply; an administrator changes them from the admin dashboard.
            </p>
          </Card>
        )}

        {plans.map((plan) => {
          const current = entitlements?.tier === plan.tier;
          return (
            <Card key={plan.id} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{plan.name}</h2>
                  {plan.description && (
                    <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                      {plan.description}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-mono text-xl font-bold">
                    ${(plan.priceCentsMonthly / 100).toFixed(2)}
                  </span>
                  <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
                    per month
                  </span>
                </div>
              </div>

              <ul className="space-y-1.5 text-sm">
                {plan.featureBullets.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden style={{ color: 'var(--color-good-400)' }}>
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {plan.maxSeats > 1 && (
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  Includes {plan.maxSeats} technician seats.
                </p>
              )}

              {current ? (
                <p className="tr-btn tr-btn-secondary w-full" style={{ cursor: 'default' }}>
                  Current plan
                </p>
              ) : plan.tier === 'FREE' ? null : (
                <UpgradeButton tier={plan.tier} planName={plan.name} disabled={!stripeReady} />
              )}
            </Card>
          );
        })}

        <p className="text-center text-xs" style={{ color: 'var(--text-dim)' }}>
          Prices and limits are set by your platform administrator and take effect immediately.
        </p>

        <Link href="/" className="tr-btn tr-btn-ghost w-full">
          Back
        </Link>
      </div>
    </div>
  );
}
