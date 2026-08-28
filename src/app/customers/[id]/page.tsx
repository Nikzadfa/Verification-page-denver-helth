'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, AppHeader, Card, ErrorNote, Spinner, api } from '@/components/ui';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal: string | null;
  notes: string | null;
}

interface Job {
  id: string;
  title: string;
  jobNumber: string | null;
  complaint: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
  _count: { diagnosticSessions: number; reports: number };
}

interface Equipment {
  id: string;
  type: string;
  modelNumber: string | null;
  serialNumber: string | null;
  refrigerant: string | null;
  nominalTons: number | null;
  location: string | null;
  installedOn: string | null;
  manufacturer: { name: string } | null;
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newJob, setNewJob] = useState<{ title: string; complaint: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api<{ customer: Customer; jobs: Job[]; equipment: Equipment[] }>(
        `/api/customers/${id}`,
      );
      setCustomer(res.customer);
      setJobs(res.jobs);
      setEquipment(res.equipment);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load that customer.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!customer) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ customer: Customer }>(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: customer.name,
          phone: customer.phone ?? '',
          email: customer.email ?? '',
          address: customer.address ?? '',
          city: customer.city ?? '',
          state: customer.state ?? '',
          postal: customer.postal ?? '',
          notes: customer.notes ?? '',
        }),
      });
      setCustomer(res.customer);
      setEditing(false);
      setNotice('Saved.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save those changes.');
    } finally {
      setBusy(false);
    }
  }

  async function createJob(event: React.FormEvent) {
    event.preventDefault();
    if (!customer || !newJob) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title: newJob.title,
          complaint: newJob.complaint || undefined,
          customerId: customer.id,
        }),
      });
      setNewJob(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create that job.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!customer) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/customers/${customer.id}`, { method: 'DELETE' });
      router.push('/customers');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete that customer.');
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <AppHeader title="Customer" back="/customers" />
        <div className="px-3 py-4">
          <Spinner label="Loading customer" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-3xl">
        <AppHeader title="Customer" back="/customers" />
        <div className="space-y-3 px-3 py-4">
          <ErrorNote>{error ?? 'That customer could not be found.'}</ErrorNote>
          <Link href="/customers" className="tr-btn tr-btn-secondary w-full">
            Back to customers
          </Link>
        </div>
      </div>
    );
  }

  const dial = customer.phone ? customer.phone.replace(/[^\d+]/g, '') : null;
  const mapQuery = [customer.address, customer.city, customer.state, customer.postal]
    .filter(Boolean)
    .join(', ');

  const set = (key: keyof Customer) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCustomer((c) => (c ? { ...c, [key]: e.target.value } : c));

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <AppHeader title={customer.name} back="/customers" />

      <div className="space-y-4 px-3 py-4">
        <ErrorNote>{error}</ErrorNote>
        {notice && (
          <p className="text-sm" role="status" style={{ color: 'var(--color-good-400)' }}>
            {notice}
          </p>
        )}

        {/* Contact actions come first: on site, this is the reason the screen
            gets opened at all. */}
        <div className="grid grid-cols-3 gap-2">
          <ContactAction href={dial ? `tel:${dial}` : null} icon="📞" label="Call" />
          <ContactAction href={dial ? `sms:${dial}` : null} icon="💬" label="Text" />
          <ContactAction
            href={mapQuery ? `https://maps.apple.com/?q=${encodeURIComponent(mapQuery)}` : null}
            icon="🧭"
            label="Directions"
            external
          />
        </div>

        {editing ? (
          <form onSubmit={save}>
            <Card className="space-y-3">
              <h2 className="text-sm font-bold">Edit details</h2>
              <Field id="e-name" label="Name" required value={customer.name} onChange={set('name')} />
              <Field id="e-phone" label="Phone" type="tel" inputMode="tel" value={customer.phone ?? ''} onChange={set('phone')} />
              <Field id="e-address" label="Service address" value={customer.address ?? ''} onChange={set('address')} />
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Field id="e-city" label="City" value={customer.city ?? ''} onChange={set('city')} />
                </div>
                <Field id="e-state" label="State" value={customer.state ?? ''} onChange={set('state')} />
              </div>
              <Field id="e-postal" label="ZIP" inputMode="numeric" value={customer.postal ?? ''} onChange={set('postal')} />
              <Field id="e-email" label="Email" type="email" inputMode="email" value={customer.email ?? ''} onChange={set('email')} />
              <div>
                <label className="tr-label" htmlFor="e-notes">
                  Site notes
                </label>
                <textarea
                  id="e-notes"
                  rows={3}
                  className="tr-input"
                  style={{ resize: 'vertical' }}
                  placeholder="Gate code, dog, attic access, panel location"
                  value={customer.notes ?? ''}
                  onChange={set('notes')}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="tr-btn tr-btn-secondary"
                  onClick={() => {
                    setEditing(false);
                    void load();
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="tr-btn tr-btn-primary" disabled={busy}>
                  {busy ? <Spinner label="Saving" /> : 'Save'}
                </button>
              </div>
            </Card>
          </form>
        ) : (
          <Card className="space-y-2">
            <dl className="space-y-2 text-sm">
              <Row label="Phone" value={customer.phone} />
              <Row label="Email" value={customer.email} />
              <Row label="Address" value={mapQuery || null} />
            </dl>
            {customer.notes && (
              <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--bg-inset)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  Site notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{customer.notes}</p>
              </div>
            )}
            <button
              type="button"
              className="tr-btn tr-btn-secondary mt-2 w-full"
              onClick={() => {
                setNotice(null);
                setEditing(true);
              }}
            >
              Edit details
            </button>
          </Card>
        )}

        <section>
          <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
            Equipment on site
          </h2>
          {equipment.length === 0 ? (
            <Card>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Nothing recorded yet. Scanning a rating plate during a diagnosis files the unit
                here.
              </p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {equipment.map((e) => (
                <li key={e.id}>
                  <Card>
                    <p className="text-sm font-bold">
                      {[e.manufacturer?.name, e.modelNumber].filter(Boolean).join(' ') ||
                        humanise(e.type)}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {[
                        humanise(e.type),
                        e.refrigerant,
                        e.nominalTons ? `${e.nominalTons} ton` : null,
                        e.location,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {e.serialNumber && (
                      <p className="mt-1 font-mono text-xs" style={{ color: 'var(--text-dim)' }}>
                        S/N {e.serialNumber}
                      </p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
              Service history
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {jobs.length} job{jobs.length === 1 ? '' : 's'}
            </span>
          </div>

          {newJob ? (
            <form onSubmit={createJob} className="mb-2">
              <Card className="space-y-3">
                <Field
                  id="j-title"
                  label="Job title"
                  required
                  placeholder="No cooling — upstairs system"
                  value={newJob.title}
                  onChange={(e) => setNewJob({ ...newJob, title: e.target.value })}
                />
                <div>
                  <label className="tr-label" htmlFor="j-complaint">
                    Complaint
                  </label>
                  <textarea
                    id="j-complaint"
                    rows={2}
                    className="tr-input"
                    style={{ resize: 'vertical' }}
                    value={newJob.complaint}
                    onChange={(e) => setNewJob({ ...newJob, complaint: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="tr-btn tr-btn-secondary" onClick={() => setNewJob(null)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="tr-btn tr-btn-primary"
                    disabled={busy || newJob.title.trim().length < 2}
                  >
                    {busy ? <Spinner label="Saving" /> : 'Create job'}
                  </button>
                </div>
              </Card>
            </form>
          ) : (
            <button
              type="button"
              className="tr-btn tr-btn-primary mb-2 w-full"
              onClick={() => setNewJob({ title: '', complaint: '' })}
            >
              + New job for {customer.name}
            </button>
          )}

          {jobs.length === 0 ? (
            <Card>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No jobs on file for this customer yet.
              </p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li key={j.id}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{j.title}</p>
                        {j.complaint && (
                          <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                            {j.complaint}
                          </p>
                        )}
                      </div>
                      <span className="tr-chip sev-INFO shrink-0">{humanise(j.status)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-dim)' }}>
                      <span>{j._count.diagnosticSessions} diagnoses</span>
                      <span>{j._count.reports} reports</span>
                      <span className="ml-auto">
                        {new Date(j.completedAt ?? j.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link href="/diagnose/new" className="tr-btn tr-btn-secondary w-full">
          Start a diagnosis
        </Link>

        <details className="tr-card p-3">
          <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--text-muted)', minHeight: '2rem' }}>
            Delete this customer
          </summary>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Permanent. A customer with jobs on file cannot be deleted — the jobs would be left
            with nobody attached.
          </p>
          <button
            type="button"
            className="tr-btn tr-btn-secondary mt-3 w-full"
            style={{ color: 'var(--color-alert-400)' }}
            onClick={remove}
            disabled={busy}
          >
            Delete {customer.name}
          </button>
        </details>
      </div>
    </div>
  );
}

function ContactAction({
  href,
  icon,
  label,
  external,
}: {
  href: string | null;
  icon: string;
  label: string;
  external?: boolean;
}) {
  if (!href) {
    return (
      <span className="tr-btn tr-btn-secondary flex-col gap-1 opacity-40" aria-disabled="true">
        <span aria-hidden className="text-lg leading-none">
          {icon}
        </span>
        <span className="text-xs">{label}</span>
      </span>
    );
  }
  return (
    <a
      href={href}
      className="tr-btn tr-btn-secondary flex-col gap-1"
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <span aria-hidden className="text-lg leading-none">
        {icon}
      </span>
      <span className="text-xs">{label}</span>
    </a>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-xs" style={{ color: 'var(--text-dim)' }}>
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-words">{value ?? <span style={{ color: 'var(--text-dim)' }}>—</span>}</dd>
    </div>
  );
}

function Field({
  id,
  label,
  ...rest
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="tr-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="tr-input" {...rest} />
    </div>
  );
}

function humanise(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w === 'ac' ? 'AC' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
