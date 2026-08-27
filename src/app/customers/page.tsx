'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, AppHeader, Card, ErrorNote, Spinner, api } from '@/components/ui';

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  jobCount: number;
  openJobs: number;
  lastServicedAt: string | null;
}

interface Summary {
  customers: number;
  openJobs: number;
  servicedThisMonth: number;
  neverServiced: number;
}

const EMPTY_FORM = { name: '', phone: '', address: '', city: '', state: '', email: '', notes: '' };

export default function CustomersPage() {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // A search keystroke should not fire a request per character, and a slow
  // response for "Del" must never land after the one for "Delacroix".
  const latest = useRef(0);

  const load = useCallback(async (term: string) => {
    const ticket = ++latest.current;
    try {
      const res = await api<{ customers: CustomerRow[]; summary: Summary }>(
        `/api/customers${term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ''}`,
      );
      if (ticket !== latest.current) return;
      setRows(res.customers);
      setSummary(res.summary);
      setError(null);
    } catch (e) {
      if (ticket !== latest.current) return;
      setError(e instanceof ApiError ? e.message : 'Could not load your customers.');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(query), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/customers', { method: 'POST', body: JSON.stringify(form) });
      setForm(EMPTY_FORM);
      setAdding(false);
      await load(query);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that customer.');
    } finally {
      setBusy(false);
    }
  }

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <AppHeader title="Customers" back="/" />

      <div className="space-y-4 px-3 py-4">
        <ErrorNote>{error}</ErrorNote>

        {summary && (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="On file" value={summary.customers} />
            <Stat label="Open jobs" value={summary.openJobs} tone="warn" />
            <Stat label="Serviced (30d)" value={summary.servicedThisMonth} tone="good" />
            <Stat label="No history" value={summary.neverServiced} />
          </dl>
        )}

        <div>
          <label className="tr-label" htmlFor="customer-search">
            Search
          </label>
          <input
            id="customer-search"
            type="search"
            className="tr-input"
            placeholder="Name, address, phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>

        {adding ? (
          <form onSubmit={create}>
            <Card className="space-y-3">
              <h2 className="text-sm font-bold">New customer</h2>
              <Field id="c-name" label="Name" required value={form.name} onChange={set('name')} />
              <Field
                id="c-phone"
                label="Phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={set('phone')}
              />
              <Field
                id="c-address"
                label="Service address"
                autoComplete="street-address"
                value={form.address}
                onChange={set('address')}
              />
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Field id="c-city" label="City" value={form.city} onChange={set('city')} />
                </div>
                <Field id="c-state" label="State" value={form.state} onChange={set('state')} />
              </div>
              <Field
                id="c-email"
                label="Email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={form.email}
                onChange={set('email')}
              />
              <div>
                <label className="tr-label" htmlFor="c-notes">
                  Site notes
                </label>
                <textarea
                  id="c-notes"
                  rows={2}
                  className="tr-input"
                  style={{ resize: 'vertical' }}
                  placeholder="Gate code, dog, attic access, panel location"
                  value={form.notes}
                  onChange={set('notes')}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="tr-btn tr-btn-secondary"
                  onClick={() => {
                    setAdding(false);
                    setForm(EMPTY_FORM);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tr-btn tr-btn-primary"
                  disabled={busy || form.name.trim().length < 2}
                >
                  {busy ? <Spinner label="Saving" /> : 'Save customer'}
                </button>
              </div>
            </Card>
          </form>
        ) : (
          <button
            type="button"
            className="tr-btn tr-btn-primary w-full"
            onClick={() => setAdding(true)}
          >
            + Add customer
          </button>
        )}

        {rows === null ? (
          <Spinner label="Loading customers" />
        ) : rows.length === 0 ? (
          <Card>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {query.trim()
                ? `No customer matches “${query.trim()}”.`
                : 'No customers yet. Add one here, or start a job — the customer on a job is filed here automatically.'}
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {rows.map((c) => (
              <li key={c.id} className="tr-card flex items-stretch">
                <Link
                  href={`/customers/${c.id}`}
                  className="min-w-0 flex-1 p-3"
                  style={{ minHeight: '3.5rem' }}
                >
                  <span className="block truncate text-sm font-bold">{c.name}</span>
                  {(c.address || c.city) && (
                    <span className="mt-0.5 block truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                      {[c.address, c.city, c.state].filter(Boolean).join(', ')}
                    </span>
                  )}
                  <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    {c.openJobs > 0 && (
                      <span className="tr-chip sev-WATCH">
                        {c.openJobs} open
                      </span>
                    )}
                    <span style={{ color: 'var(--text-dim)' }}>
                      {c.jobCount === 0
                        ? 'No jobs yet'
                        : `${c.jobCount} job${c.jobCount === 1 ? '' : 's'}`}
                    </span>
                    <span style={{ color: 'var(--text-dim)' }}>
                      {c.lastServicedAt
                        ? `Last serviced ${new Date(c.lastServicedAt).toLocaleDateString()}`
                        : ''}
                    </span>
                  </span>
                </Link>
                {c.phone && (
                  <a
                    href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}
                    className="tr-btn tr-btn-ghost shrink-0 border-l px-4"
                    aria-label={`Call ${c.name}`}
                  >
                    <span aria-hidden>📞</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'warn' | 'good';
}) {
  const colour =
    tone === 'warn' && value > 0
      ? 'var(--color-warn-400)'
      : tone === 'good' && value > 0
        ? 'var(--color-good-400)'
        : 'var(--text)';
  return (
    <div className="tr-card px-3 py-2.5">
      <dt className="text-xs" style={{ color: 'var(--text-dim)' }}>
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-xl font-bold tabular-nums" style={{ color: colour }}>
        {value}
      </dd>
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
