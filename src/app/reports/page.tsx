'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ApiError, AppHeader, Card, ErrorNote, Spinner, api } from '@/components/ui';
import type { ServiceReportContent } from '@/lib/reports/types';

interface ReportRow {
  id: string;
  reportNumber: string;
  status: string;
  createdAt: string;
  sessionId: string | null;
  content: ServiceReportContent;
}

function ReportsInner() {
  const params = useSearchParams();
  const sessionId = params.get('session');

  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{ id: string; reportNumber: string } | null>(null);

  const load = () =>
    api<{ reports: ReportRow[] }>('/api/reports')
      .then((r) => setReports(r.reports))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load reports.'));

  useEffect(() => {
    void load();
  }, []);

  async function generate(finalize: boolean) {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ report: { id: string; reportNumber: string } }>('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ sessionId, technicianNotes: notes || undefined, finalize }),
      });
      setGenerated(r.report);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not generate the report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <AppHeader title="Service reports" back="/" />

      <div className="space-y-4 px-3 py-4">
        <ErrorNote>{error}</ErrorNote>

        {sessionId && (
          <Card className="space-y-3">
            <p className="tr-label">Generate a report for this diagnosis</p>
            <div>
              <label className="tr-label" htmlFor="notes">
                Technician notes
              </label>
              <textarea
                id="notes"
                rows={4}
                className="tr-input"
                style={{ resize: 'vertical' }}
                placeholder="Anything the customer should see: what you advised, what they approved, what you could not access."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
              The report records what was measured separately from what was concluded, including
              what was ruled out and why. Derived values are marked as derived. You are signing
              your name to it — read it before you send it.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="tr-btn tr-btn-secondary" disabled={busy} onClick={() => generate(false)}>
                {busy ? <Spinner label="Building" /> : 'Save draft'}
              </button>
              <button type="button" className="tr-btn tr-btn-primary" disabled={busy} onClick={() => generate(true)}>
                Finalize
              </button>
            </div>

            {generated && (
              <a
                href={`/api/reports/${generated.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="tr-btn tr-btn-primary w-full"
              >
                Open {generated.reportNumber} as PDF
              </a>
            )}
          </Card>
        )}

        {reports === null ? (
          <Spinner label="Loading reports" />
        ) : reports.length === 0 ? (
          <Card>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No reports yet. Finish a diagnosis and generate one from the diagnosis screen.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold">{r.reportNumber}</p>
                      <p className="mt-0.5 truncate text-sm">
                        {r.content?.diagnosis?.conclusion ?? 'No diagnosis reached'}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                        {r.content?.customer?.name ?? 'No customer recorded'} ·{' '}
                        {new Date(r.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`tr-chip shrink-0 ${r.status === 'FINAL' ? 'sev-NORMAL' : 'sev-INFO'}`}>
                      {r.status}
                    </span>
                  </div>
                  <a
                    href={`/api/reports/${r.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="tr-btn tr-btn-secondary mt-3 w-full text-sm"
                  >
                    Open PDF
                  </a>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-4"><Spinner label="Loading" /></div>}>
      <ReportsInner />
    </Suspense>
  );
}
