'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, AppHeader, Card, ErrorNote, Spinner, api } from '@/components/ui';

interface Job {
  id: string;
  title: string;
  complaint: string | null;
  status: string;
  jobNumber: string | null;
  updatedAt: string;
  customer: { name: string; address: string | null } | null;
  _count: { diagnosticSessions: number; reports: number };
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', customerName: '', customerAddress: '', complaint: '' });

  const load = () =>
    api<{ jobs: Job[] }>('/api/jobs')
      .then((r) => setJobs(r.jobs))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load jobs.'));

  useEffect(() => {
    void load();
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/jobs', { method: 'POST', body: JSON.stringify(form) });
      setForm({ title: '', customerName: '', customerAddress: '', complaint: '' });
      setCreating(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the job.');
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <AppHeader title="Saved jobs" back="/" />

      <div className="space-y-4 px-3 py-4">
        <ErrorNote>{error}</ErrorNote>

        {creating ? (
          <form onSubmit={create}>
            <Card className="space-y-3">
              <div>
                <label className="tr-label" htmlFor="title">
                  Job title
                </label>
                <input id="title" required className="tr-input" value={form.title} onChange={set('title')} />
              </div>
              <div>
                <label className="tr-label" htmlFor="cust">
                  Customer
                </label>
                <input id="cust" className="tr-input" value={form.customerName} onChange={set('customerName')} />
              </div>
              <div>
                <label className="tr-label" htmlFor="addr">
                  Service address
                </label>
                <input id="addr" className="tr-input" value={form.customerAddress} onChange={set('customerAddress')} />
              </div>
              <div>
                <label className="tr-label" htmlFor="comp">
                  Complaint
                </label>
                <textarea id="comp" rows={2} className="tr-input" style={{ resize: 'vertical' }} value={form.complaint} onChange={set('complaint')} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="tr-btn tr-btn-secondary" onClick={() => setCreating(false)}>
                  Cancel
                </button>
                <button type="submit" className="tr-btn tr-btn-primary" disabled={busy || !form.title.trim()}>
                  {busy ? <Spinner label="Saving" /> : 'Save job'}
                </button>
              </div>
            </Card>
          </form>
        ) : (
          <button type="button" className="tr-btn tr-btn-primary w-full" onClick={() => setCreating(true)}>
            + New job
          </button>
        )}

        {jobs === null ? (
          <Spinner label="Loading jobs" />
        ) : jobs.length === 0 ? (
          <Card>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No saved jobs yet. Create one to group diagnoses, photos and reports for a single
              customer visit.
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
                      {j.customer && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {j.customer.name}
                          {j.customer.address ? ` · ${j.customer.address}` : ''}
                        </p>
                      )}
                      {j.complaint && (
                        <p className="mt-1 line-clamp-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                          {j.complaint}
                        </p>
                      )}
                    </div>
                    <span className="tr-chip sev-INFO shrink-0">{j.status}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs" style={{ color: 'var(--text-dim)' }}>
                    <span>{j._count.diagnosticSessions} diagnoses</span>
                    <span>{j._count.reports} reports</span>
                    <span className="ml-auto">{new Date(j.updatedAt).toLocaleDateString()}</span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <Link href="/diagnose/new" className="tr-btn tr-btn-secondary w-full">
          Start a diagnosis
        </Link>
      </div>
    </div>
  );
}
