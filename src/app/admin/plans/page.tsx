'use client';

import { useEffect, useState } from 'react';
import { ApiError, AppHeader, Card, ErrorNote, Spinner, api } from '@/components/ui';

interface Plan {
  id: string;
  tier: string;
  name: string;
  description: string | null;
  priceCentsMonthly: number;
  priceCentsYearly: number | null;
  maxDiagnosesPerMonth: number;
  maxPhotosPerMonth: number;
  maxSeats: number;
  photoAnalysis: boolean;
  savedJobs: boolean;
  serviceReports: boolean;
  companyDashboard: boolean;
  sharedKnowledge: boolean;
  active: boolean;
  stripePriceIdMonthly: string | null;
  featureBullets: string[];
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void api<{ plans: Plan[] }>('/api/admin/plans')
      .then((r) => setPlans(r.plans))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load plans.'));
  }, []);

  async function save(plan: Plan) {
    setBusy(plan.id);
    setError(null);
    setSaved(null);
    try {
      await api('/api/admin/plans', {
        method: 'PATCH',
        body: JSON.stringify({
          id: plan.id,
          name: plan.name,
          description: plan.description ?? undefined,
          priceCentsMonthly: plan.priceCentsMonthly,
          priceCentsYearly: plan.priceCentsYearly ?? undefined,
          maxDiagnosesPerMonth: plan.maxDiagnosesPerMonth,
          maxPhotosPerMonth: plan.maxPhotosPerMonth,
          maxSeats: plan.maxSeats,
          photoAnalysis: plan.photoAnalysis,
          savedJobs: plan.savedJobs,
          serviceReports: plan.serviceReports,
          companyDashboard: plan.companyDashboard,
          sharedKnowledge: plan.sharedKnowledge,
          active: plan.active,
          stripePriceIdMonthly: plan.stripePriceIdMonthly ?? undefined,
        }),
      });
      setSaved(plan.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
    } finally {
      setBusy(null);
    }
  }

  const update = (id: string, patch: Partial<Plan>) =>
    setPlans((p) => p?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? null);

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <AppHeader title="Plans & pricing" back="/admin" />

      <div className="space-y-4 px-3 py-4">
        <ErrorNote>{error}</ErrorNote>
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Prices and limits take effect immediately for every account. A limit of{' '}
            <span className="font-mono">-1</span> means unlimited. Changes are written to the
            audit log.
          </p>
        </Card>

        {plans === null ? (
          <Spinner label="Loading plans" />
        ) : (
          plans.map((plan) => (
            <Card key={plan.id} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold">
                  {plan.name} <span className="tr-chip sev-INFO ml-1">{plan.tier}</span>
                </h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={plan.active}
                    onChange={(e) => update(plan.id, { active: e.target.checked })}
                  />
                  Active
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="tr-label">Monthly price (cents)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="tr-input font-mono"
                    value={plan.priceCentsMonthly}
                    onChange={(e) => update(plan.id, { priceCentsMonthly: Number(e.target.value) })}
                  />
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                    ${(plan.priceCentsMonthly / 100).toFixed(2)}/month
                  </p>
                </div>
                <div>
                  <label className="tr-label">Seats</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="tr-input font-mono"
                    value={plan.maxSeats}
                    onChange={(e) => update(plan.id, { maxSeats: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="tr-label">Diagnoses / month</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="tr-input font-mono"
                    value={plan.maxDiagnosesPerMonth}
                    onChange={(e) => update(plan.id, { maxDiagnosesPerMonth: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="tr-label">Photos / month</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="tr-input font-mono"
                    value={plan.maxPhotosPerMonth}
                    onChange={(e) => update(plan.id, { maxPhotosPerMonth: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="tr-label">Stripe monthly price ID</label>
                <input
                  className="tr-input font-mono text-sm"
                  placeholder="price_..."
                  value={plan.stripePriceIdMonthly ?? ''}
                  onChange={(e) => update(plan.id, { stripePriceIdMonthly: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['photoAnalysis', 'Photo analysis'],
                    ['savedJobs', 'Saved jobs'],
                    ['serviceReports', 'Service reports'],
                    ['companyDashboard', 'Company dashboard'],
                    ['sharedKnowledge', 'Shared knowledge'],
                  ] as Array<[keyof Plan, string]>
                ).map(([key, label]) => (
                  <label key={String(key)} className="flex items-center gap-2 text-sm" style={{ minHeight: '2.5rem' }}>
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={Boolean(plan[key])}
                      onChange={(e) => update(plan.id, { [key]: e.target.checked } as Partial<Plan>)}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <button
                type="button"
                className="tr-btn tr-btn-primary w-full"
                disabled={busy === plan.id}
                onClick={() => save(plan)}
              >
                {busy === plan.id ? <Spinner label="Saving" /> : saved === plan.id ? 'Saved ✓' : 'Save changes'}
              </button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
