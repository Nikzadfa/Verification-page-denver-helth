'use client';

import { useEffect, useState } from 'react';
import { ApiError, AppHeader, Card, ErrorNote, Spinner, api } from '@/components/ui';
import type { EvalCheck, EvalTranscript } from '@/lib/eval/types';

interface EvalCaseRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  tags: string[];
  active: boolean;
}

interface RunResult {
  id: string;
  passed: boolean;
  score: number;
  checks: EvalCheck[];
  transcript: EvalTranscript;
  error: string | null;
  case: { slug: string; name: string; category?: string };
}

interface Run {
  id: string;
  label: string;
  model: string;
  engineVersion: string;
  promptVersion: string;
  totalCases: number;
  passedCases: number;
  score: number;
  durationMs: number;
  createdAt: string;
  results: RunResult[];
}

export default function EvalPage() {
  const [cases, setCases] = useState<EvalCaseRow[] | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void api<{ cases: EvalCaseRow[] }>('/api/admin/eval/cases')
      .then((r) => setCases(r.cases))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load cases.'));
    void api<{ runs: Run[] }>('/api/admin/eval/run')
      .then((r) => setHistory(r.runs))
      .catch(() => undefined);
  }, []);

  async function execute() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ run: Run }>('/api/admin/eval/run', {
        method: 'POST',
        body: JSON.stringify({
          label: selected.size ? `${selected.size} selected cases` : 'Full suite',
          caseIds: selected.size ? [...selected] : undefined,
        }),
      });
      setRun(r.run);
      setHistory((h) => [r.run, ...h]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The run failed.');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <AppHeader title="AI Testing Center" back="/admin" />

      <div className="space-y-4 px-3 py-4">
        <Card>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Each case replays a scripted technician through the real diagnostic engine and checks
            what it actually decided — which test it asked for, in what order, how it ranked the
            causes, whether it concluded too early, whether it demanded the control board before
            interpreting a fault code.
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            The checks are mechanical, not model-graded. That is deliberate: a suite graded by a
            language model drifts with the grader, and you lose the ability to tell a real
            regression from a mood.
          </p>
        </Card>

        <ErrorNote>{error}</ErrorNote>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="tr-btn tr-btn-secondary" onClick={() => setSelected(new Set())}>
            {selected.size ? `Clear ${selected.size} selected` : 'All cases'}
          </button>
          <button type="button" className="tr-btn tr-btn-primary" onClick={execute} disabled={busy}>
            {busy ? <Spinner label="Replaying" /> : selected.size ? `Run ${selected.size}` : 'Run full suite'}
          </button>
        </div>

        {run && <RunSummary run={run} open={open} setOpen={setOpen} />}

        <Card>
          <p className="tr-label">Stored scenarios</p>
          {cases === null ? (
            <Spinner label="Loading" />
          ) : cases.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No cases stored. Run <code className="font-mono">npm run db:seed</code> to load the
              starter suite.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {cases.map((c) => (
                <li key={c.id} className="py-2">
                  <label className="flex cursor-pointer items-start gap-3" style={{ minHeight: '2.5rem' }}>
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 shrink-0"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{c.name}</span>
                      <span className="block font-mono text-xs" style={{ color: 'var(--text-dim)' }}>
                        {c.slug}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <span className="tr-chip sev-INFO">{c.category}</span>
                        {c.tags.map((t) => (
                          <span key={t} className="tr-chip sev-INFO">
                            {t}
                          </span>
                        ))}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {history.length > 0 && (
          <Card>
            <p className="tr-label">Run history</p>
            <ul className="divide-y text-sm" style={{ borderColor: 'var(--border)' }}>
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{h.label}</span>
                    <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
                      engine {h.engineVersion} · prompt {h.promptVersion} ·{' '}
                      {new Date(h.createdAt).toLocaleString()}
                    </span>
                  </span>
                  <span
                    className={`tr-chip shrink-0 ${h.passedCases === h.totalCases ? 'sev-NORMAL' : 'sev-ABNORMAL'}`}
                  >
                    {h.passedCases}/{h.totalCases}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function RunSummary({
  run,
  open,
  setOpen,
}: {
  run: Run;
  open: string | null;
  setOpen: (v: string | null) => void;
}) {
  const allPassed = run.passedCases === run.totalCases;

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-lg font-bold">
            {run.passedCases}/{run.totalCases} passed
          </p>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            score {Math.round(run.score * 100)}% · {run.durationMs} ms · engine {run.engineVersion}
          </p>
        </div>
        <span className={`tr-chip ${allPassed ? 'sev-NORMAL' : 'sev-ABNORMAL'}`}>
          {allPassed ? 'All passed' : 'Regressions'}
        </span>
      </div>

      <ul className="space-y-2">
        {run.results
          .slice()
          .sort((a, b) => Number(a.passed) - Number(b.passed))
          .map((r) => {
            const isOpen = open === r.id;
            const failedChecks = r.checks.filter((c) => !c.passed);
            return (
              <li key={r.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  aria-expanded={isOpen}
                  style={{ minHeight: '2.5rem' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{r.case.name}</span>
                      <span className="block font-mono text-xs" style={{ color: 'var(--text-dim)' }}>
                        {r.case.slug}
                      </span>
                    </span>
                    <span className={`tr-chip shrink-0 ${r.passed ? 'sev-NORMAL' : 'sev-CRITICAL'}`}>
                      {r.passed ? 'pass' : `${failedChecks.length} failed`}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-3 space-y-3">
                    {r.error && (
                      <p className="text-xs" style={{ color: 'var(--color-alert-400)' }}>
                        {r.error}
                      </p>
                    )}

                    <div>
                      <p className="tr-label">Assertions</p>
                      <ul className="space-y-1.5">
                        {r.checks.map((c, i) => (
                          <li key={`${c.kind}-${i}`} className="text-xs">
                            <span className={`tr-chip mr-2 ${c.passed ? 'sev-NORMAL' : 'sev-CRITICAL'}`}>
                              {c.passed ? 'pass' : 'fail'}
                            </span>
                            <span className="font-mono">{c.kind}</span>
                            <span className="mt-0.5 block" style={{ color: 'var(--text-muted)' }}>
                              expected {c.expected} · observed {c.observed}
                            </span>
                            {!c.passed && (
                              <span className="mt-0.5 block" style={{ color: 'var(--color-warn-400)' }}>
                                {c.because}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="tr-label">What the engine did</p>
                      <ol className="space-y-1.5 text-xs">
                        {r.transcript.steps.map((s) => (
                          <li key={s.step}>
                            <span className="font-medium">
                              {s.step}. {s.testLabel}
                            </span>
                            <span className="block" style={{ color: 'var(--text-muted)' }}>
                              → {s.response}
                            </span>
                            {s.topHypotheses.length > 0 && (
                              <span className="block" style={{ color: 'var(--text-dim)' }}>
                                ranking at this point:{' '}
                                {s.topHypotheses
                                  .map((h) => `${h.id} ${Math.round(h.posterior * 100)}%`)
                                  .join(', ')}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                      <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <span className="font-semibold">Final: </span>
                        {r.transcript.conclusion
                          ? `${r.transcript.conclusion.hypothesisId} at ${Math.round(
                              r.transcript.conclusion.confidence * 100,
                            )}%`
                          : `no conclusion — ${r.transcript.stopReason}`}
                      </p>
                      {r.transcript.faultCodeResolution && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          <span className="font-semibold">Fault code: </span>
                          {r.transcript.faultCodeResolution.state}
                          {r.transcript.faultCodeResolution.needed.length
                            ? ` — asked for ${r.transcript.faultCodeResolution.needed.join(', ')}`
                            : ''}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
      </ul>
    </Card>
  );
}
