'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SerializedView } from '@/lib/diagnose/serialize';
import {
  ApiError,
  Card,
  ConfidenceRow,
  ErrorNote,
  HazardBanner,
  Severity,
  Spinner,
  api,
} from '@/components/ui';
import { MeasurementForm } from '@/components/MeasurementForm';
import { VoiceInput } from '@/components/VoiceInput';

export interface SessionMessage {
  id: string;
  role: 'TECHNICIAN' | 'ASSISTANT' | 'SYSTEM' | 'ENGINE';
  content: string;
  createdAt: string;
  citations?: Array<{ documentTitle: string; page?: number | null }> | null;
}

interface Props {
  sessionId: string;
  title: string;
  complaint: string;
  initialMessages: SessionMessage[];
  initialView: SerializedView;
}

type Tab = 'step' | 'ranking' | 'readings';

export function DiagnosisSession({
  sessionId,
  title,
  complaint,
  initialMessages,
  initialView,
}: Props) {
  const [messages, setMessages] = useState<SessionMessage[]>(initialMessages);
  const [view, setView] = useState<SerializedView>(initialView);
  const [tab, setTab] = useState<Tab>('step');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [extraction, setExtraction] = useState<{
    measurements: Array<{ key: string; value: number | null; text: string | null; evidence: string }>;
    technicianOpinion: string[];
    ambiguous: Array<{ text: string; why: string }>;
    warnings: string[];
  } | null>(null);

  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy]);

  const applyResult = useCallback(
    (result: { narration: string; view: SerializedView; warnings?: string[] }) => {
      setView(result.view);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          role: 'ASSISTANT',
          content: result.narration,
          createdAt: new Date().toISOString(),
        },
      ]);
      setTab('step');
    },
    [],
  );

  const post = useCallback(
    async (path: string, body: unknown, optimisticEcho?: string) => {
      setBusy(true);
      setError(null);
      setExtraction(null);
      if (optimisticEcho) {
        setMessages((prev) => [
          ...prev,
          {
            id: `me-${Date.now()}`,
            role: 'TECHNICIAN',
            content: optimisticEcho,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      try {
        const result = await api<{
          narration: string;
          view: SerializedView;
          warnings?: string[];
          extraction?: typeof extraction;
        }>(`/api/diagnose/${sessionId}/${path}`, { method: 'POST', body: JSON.stringify(body) });
        applyResult(result);
        if (result.extraction) setExtraction(result.extraction);
      } catch (e) {
        setError(
          e instanceof ApiError
            ? e.message
            : 'Could not reach the server. Your readings are still on this screen — try again when you have signal.',
        );
      } finally {
        setBusy(false);
      }
    },
    [applyResult, sessionId],
  );

  const sendText = useCallback(
    (text: string, source: 'text' | 'voice') => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setDraft('');
      void post('message', { text: trimmed, source }, trimmed);
    },
    [post],
  );

  const next = view.nextTest;
  const conclusion = view.conclusion;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Tabs */}
      <div className="sticky top-[3.25rem] z-10 flex gap-1 border-b px-3 py-2" style={{ background: 'var(--bg)' }}>
        {(
          [
            ['step', conclusion ? 'Diagnosis' : 'Next step', null],
            ['ranking', 'Causes', view.ranked.length],
            ['readings', 'Readings', view.derived.length],
          ] as Array<[Tab, string, number | null]>
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="tr-btn flex-1 whitespace-nowrap px-1 text-sm"
            style={{
              minHeight: '2.75rem',
              background: tab === key ? 'var(--bg-inset)' : 'transparent',
              color: tab === key ? 'var(--text)' : 'var(--text-dim)',
              border: tab === key ? '1px solid var(--border-strong)' : '1px solid transparent',
            }}
            aria-pressed={tab === key}
          >
            {label}
            {count !== null && count > 0 && (
              <span
                className="ml-1 rounded-full px-1.5 text-xs font-bold tabular-nums"
                style={{ background: 'var(--border-strong)', color: 'var(--text-muted)' }}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <main className="flex-1 space-y-4 px-3 py-4">
        {tab === 'step' && (
          <>
            {/* Transcript */}
            <section aria-label="Diagnosis transcript" className="space-y-3">
              <Card className="text-sm">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
                  Complaint
                </p>
                <p>{complaint}</p>
              </Card>

              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}

              {busy && (
                <div className="px-1">
                  <Spinner label="Analyzing" />
                </div>
              )}
            </section>

            <ErrorNote>{error}</ErrorNote>

            {extraction && <ExtractionReceipt extraction={extraction} />}

            {view.verifyNotes.length > 0 && (
              <Card className="text-xs" >
                <p className="font-bold" style={{ color: 'var(--color-warn-400)' }}>
                  Values converted from pressure
                </p>
                <ul className="mt-1 space-y-1" style={{ color: 'var(--text-muted)' }}>
                  {view.verifyNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </Card>
            )}

            {conclusion ? (
              <ConclusionCard conclusion={conclusion} sessionId={sessionId} hazards={view.hazards} />
            ) : next ? (
              <NextStepCard
                test={next}
                hazards={view.hazards}
                differential={view.differential}
                busy={busy}
                onAnswer={(optionValue, label) =>
                  post('answer', { testId: next.id, optionValue }, `${next.label}: ${label}`)
                }
                onMeasurements={(readings) => post('measurements', { testId: next.id, readings })}
                onSkip={() => post('skip', { testId: next.id, reason: 'Cannot run this test right now' })}
              />
            ) : (
              <Card>
                <p className="text-sm font-bold">Nothing further to test</p>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {view.stopReason}
                </p>
              </Card>
            )}

            {/* Free text + voice */}
            <Card className="space-y-3">
              <label className="tr-label" htmlFor="say">
                Or just tell me what you found
              </label>
              <textarea
                id="say"
                rows={2}
                className="tr-input"
                style={{ minHeight: '3.5rem', resize: 'vertical' }}
                placeholder='e.g. "410A, outdoor 92, suction 118, liquid 325, supply 68, return 78"'
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendText(draft, 'text');
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <VoiceInput onTranscript={(t) => sendText(t, 'voice')} disabled={busy} />
                <button
                  type="button"
                  className="tr-btn tr-btn-primary"
                  disabled={busy || !draft.trim()}
                  onClick={() => sendText(draft, 'text')}
                >
                  Send
                </button>
              </div>
            </Card>
          </>
        )}

        {tab === 'ranking' && <RankingPanel view={view} />}
        {tab === 'readings' && <ReadingsPanel view={view} />}
      </main>

      <div ref={bottom} />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function MessageBubble({ message }: { message: SessionMessage }) {
  const mine = message.role === 'TECHNICIAN';
  return (
    <div className={mine ? 'flex justify-end' : ''}>
      <div
        className="max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed"
        style={{
          background: mine ? 'var(--accent)' : 'var(--bg-raised)',
          color: mine ? 'var(--accent-ink)' : 'var(--text)',
          border: mine ? 'none' : '1px solid var(--border)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {message.content}
        {message.citations?.length ? (
          <div className="mt-2 border-t pt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            <p className="font-semibold">Sources</p>
            <ul className="mt-0.5 space-y-0.5">
              {message.citations.map((c, i) => (
                <li key={`${c.documentTitle}-${i}`}>
                  {c.documentTitle}
                  {c.page ? `, p.${c.page}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NextStepCard({
  test,
  hazards,
  differential,
  busy,
  onAnswer,
  onMeasurements,
  onSkip,
}: {
  test: NonNullable<SerializedView['nextTest']>;
  hazards: SerializedView['hazards'];
  differential: SerializedView['differential'];
  busy: boolean;
  onAnswer: (optionValue: string, label: string) => void;
  onMeasurements: (readings: Array<{ key: string; value?: number | null; text?: string | null }>) => void;
  onSkip: () => void;
}) {
  const relevant = hazards.filter((h) => test.hazardIds.includes(h.id));

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
            Next test
          </p>
          <h2 className="mt-0.5 text-base font-bold">{test.label}</h2>
        </div>
        <span className="tr-chip sev-INFO shrink-0">~{test.costMinutes} min</span>
      </div>

      {/* Safety comes before the instruction, always. */}
      <HazardBanner hazards={relevant} />

      <p className="text-sm leading-relaxed">{test.instruction}</p>

      <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--bg-inset)' }}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
          What normal looks like
        </p>
        <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
          {test.expected}
        </p>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
        <span className="font-semibold">Why this one:</span> {test.rationale}
      </p>

      {differential?.how && (
        <div className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--border-strong)' }}>
          <p className="font-bold">
            Telling {differential.a} from {differential.b}
          </p>
          <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
            {differential.how}
          </p>
        </div>
      )}

      {test.options?.length ? (
        <div className="space-y-2">
          {test.options.map((o) => (
            <button
              key={o.value}
              type="button"
              className="tr-choice"
              disabled={busy}
              onClick={() => onAnswer(o.value, o.label)}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : test.collects.length ? (
        <MeasurementForm keys={test.collects} onSubmit={onMeasurements} busy={busy} />
      ) : null}

      <button type="button" className="tr-btn tr-btn-ghost w-full text-sm" disabled={busy} onClick={onSkip}>
        I can&rsquo;t run this test
      </button>
    </Card>
  );
}

function ConclusionCard({
  conclusion,
  sessionId,
  hazards,
}: {
  conclusion: NonNullable<SerializedView['conclusion']>;
  sessionId: string;
  hazards: SerializedView['hazards'];
}) {
  return (
    <Card className="space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-good-400)' }}>
          Diagnosis · {Math.round(conclusion.confidence * 100)}% confidence
        </p>
        <h2 className="mt-1 text-lg font-bold">{conclusion.label}</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          {conclusion.statement}
        </p>
      </div>

      <HazardBanner hazards={hazards.filter((h) => conclusion.safetyIds.includes(h.id))} />

      {conclusion.evidence.length > 0 && (
        <div>
          <p className="tr-label">Evidence</p>
          <ul className="space-y-1.5 text-sm">
            {conclusion.evidence.map((e) => (
              <li key={e.findingKey} className="flex gap-2">
                <span aria-hidden style={{ color: 'var(--color-good-400)' }}>
                  ✓
                </span>
                <span>
                  <span className="font-medium">{e.label}</span>
                  {e.detail && (
                    <span style={{ color: 'var(--text-muted)' }}> — {e.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {conclusion.ruledOut.length > 0 && (
        <div>
          <p className="tr-label">Ruled out</p>
          <ul className="space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {conclusion.ruledOut.map((r) => (
              <li key={r.label}>
                <span className="font-medium">{r.label}</span> — {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg p-3" style={{ background: 'var(--bg-inset)' }}>
        <p className="tr-label">Recommended repair</p>
        <p className="text-sm">{conclusion.repair.summary}</p>
        {conclusion.repair.rootCauseWarning && (
          <p className="mt-2 text-sm" style={{ color: 'var(--color-warn-400)' }}>
            {conclusion.repair.rootCauseWarning}
          </p>
        )}
        {conclusion.repair.parts.length > 0 && (
          <>
            <p className="tr-label mt-3">Parts</p>
            <ul className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {conclusion.repair.parts.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {conclusion.caveats.length > 0 && (
        <div className="space-y-1">
          {conclusion.caveats.map((c) => (
            <p key={c} className="text-xs" style={{ color: 'var(--color-warn-400)' }}>
              {c}
            </p>
          ))}
        </div>
      )}

      <Link href={`/reports?session=${sessionId}`} className="tr-btn tr-btn-primary w-full">
        Generate service report
      </Link>
    </Card>
  );
}

function RankingPanel({ view }: { view: SerializedView }) {
  if (!view.ranked.length) {
    return (
      <Card>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Nothing ranked yet. Answer the first question and the ranking will fill in.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <p className="tr-label">What this could be</p>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {view.ranked.map((r) => (
            <ConfidenceRow
              key={r.id}
              label={r.label}
              statement={r.statement}
              posterior={r.posterior}
              support={r.support}
            />
          ))}
        </div>
        <p className="mt-3 text-xs" style={{ color: 'var(--text-dim)' }}>
          Tap any row to see what is driving it. These are the engine&rsquo;s working
          probabilities, not a verdict — nothing gets condemned without a test that confirms it.
        </p>
      </Card>

      {view.differential?.how && (
        <Card>
          <p className="tr-label">Telling the top two apart</p>
          <p className="text-sm font-medium">
            {view.differential.a} vs {view.differential.b}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {view.differential.how}
          </p>
        </Card>
      )}
    </div>
  );
}

function ReadingsPanel({ view }: { view: SerializedView }) {
  return (
    <div className="space-y-3">
      {view.derived.length > 0 ? (
        <Card>
          <p className="tr-label">Calculated from your readings</p>
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {view.derived.map((d) => (
              <li key={d.key} className="py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{d.label}</span>
                  <span className="font-mono text-sm tabular-nums">
                    {d.value ?? '—'} {d.unit}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Severity level={d.severity} />
                  {d.target && (
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                      expected {d.target.low}–{d.target.high}
                    </span>
                  )}
                  {d.mustVerify && (
                    <span className="tr-chip sev-WATCH">Converted</span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
                  {d.explanation}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No readings yet.
          </p>
        </Card>
      )}

      {view.missingReadings.length > 0 && (
        <Card>
          <p className="tr-label">Readings that would help most</p>
          <ul className="space-y-2 text-sm">
            {view.missingReadings.map((m) => (
              <li key={m.key}>
                <span className="font-medium">{m.label}</span>
                <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                  {m.why}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {view.notes.length > 0 && (
        <Card>
          <p className="tr-label">Notes for this system</p>
          <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            {view.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/**
 * Shows exactly what was extracted from free text or voice, so a technician can
 * catch a misheard number before the engine reasons from it. Opinions are shown
 * separately and explicitly excluded from the evidence.
 */
function ExtractionReceipt({
  extraction,
}: {
  extraction: {
    measurements: Array<{ key: string; value: number | null; text: string | null; evidence: string }>;
    technicianOpinion: string[];
    ambiguous: Array<{ text: string; why: string }>;
    warnings: string[];
  };
}) {
  const hasAnything =
    extraction.measurements.length ||
    extraction.technicianOpinion.length ||
    extraction.ambiguous.length ||
    extraction.warnings.length;
  if (!hasAnything) return null;

  return (
    <Card className="text-xs">
      {extraction.measurements.length > 0 && (
        <>
          <p className="tr-label">Recorded from what you said</p>
          <ul className="space-y-0.5">
            {extraction.measurements.map((m) => (
              <li key={m.key} className="flex justify-between gap-2">
                <span style={{ color: 'var(--text-muted)' }}>{m.key.replace(/_/g, ' ')}</span>
                <span className="font-mono">{m.value ?? m.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {extraction.ambiguous.length > 0 && (
        <>
          <p className="tr-label mt-3">Not recorded — unclear which reading</p>
          <ul className="space-y-0.5" style={{ color: 'var(--color-warn-400)' }}>
            {extraction.ambiguous.map((a) => (
              <li key={a.text}>
                &ldquo;{a.text}&rdquo; — {a.why}
              </li>
            ))}
          </ul>
        </>
      )}

      {extraction.technicianOpinion.length > 0 && (
        <>
          <p className="tr-label mt-3">Noted, but not treated as evidence</p>
          <ul style={{ color: 'var(--text-dim)' }}>
            {extraction.technicianOpinion.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </>
      )}

      {extraction.warnings.map((w) => (
        <p key={w} className="mt-2" style={{ color: 'var(--color-warn-400)' }}>
          {w}
        </p>
      ))}
    </Card>
  );
}
