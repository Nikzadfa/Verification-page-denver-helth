'use client';

import { useEffect, useState } from 'react';
import { EquipmentType } from '@prisma/client';
import { ApiError, AppHeader, Card, ErrorNote, Spinner, api } from '@/components/ui';
import type { FaultCodeRecord, FaultCodeResolution } from '@/lib/faultcodes/types';

export default function FaultCodesPage() {
  const [manufacturers, setManufacturers] = useState<Array<{ name: string; slug: string }>>([]);
  const [form, setForm] = useState({
    manufacturer: 'carrier',
    code: '',
    equipmentType: 'GAS_FURNACE' as EquipmentType,
    modelNumber: '',
    controlBoard: '',
  });
  const [resolution, setResolution] = useState<FaultCodeResolution | null>(null);
  const [citations, setCitations] = useState<Array<{ documentTitle: string; page?: number | null }>>([]);
  const [browse, setBrowse] = useState<FaultCodeRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ codes: FaultCodeRecord[]; manufacturers: Array<{ name: string; slug: string }> }>(
      '/api/fault-codes/search?limit=40',
    )
      .then((r) => {
        setManufacturers(r.manufacturers);
        setBrowse(r.codes);
      })
      .catch(() => setError('Could not load the fault-code database.'));
  }, []);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResolution(null);
    try {
      const r = await api<{
        resolution: FaultCodeResolution;
        citations: Array<{ documentTitle: string; page?: number | null }>;
      }>('/api/fault-codes/resolve', {
        method: 'POST',
        body: JSON.stringify({
          manufacturer: form.manufacturer,
          code: form.code,
          equipmentType: form.equipmentType,
          modelNumber: form.modelNumber || null,
          controlBoard: form.controlBoard || null,
        }),
      });
      setResolution(r.resolution);
      setCitations(r.citations);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Lookup failed.');
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <AppHeader title="Fault codes" back="/" />

      <div className="space-y-4 px-3 py-4">
        <form onSubmit={lookup}>
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="tr-label" htmlFor="mfr">
                  Manufacturer
                </label>
                <select id="mfr" className="tr-input" value={form.manufacturer} onChange={set('manufacturer')}>
                  {manufacturers.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="tr-label" htmlFor="code">
                  Code
                </label>
                <input
                  id="code"
                  required
                  className="tr-input font-mono"
                  placeholder="31"
                  value={form.code}
                  onChange={set('code')}
                />
              </div>
            </div>

            <div>
              <label className="tr-label" htmlFor="eq">
                Equipment
              </label>
              <select id="eq" className="tr-input" value={form.equipmentType} onChange={set('equipmentType')}>
                {Object.values(EquipmentType).map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="tr-label" htmlFor="model">
                  Model number
                </label>
                <input
                  id="model"
                  className="tr-input font-mono"
                  autoCapitalize="characters"
                  value={form.modelNumber}
                  onChange={set('modelNumber')}
                />
              </div>
              <div>
                <label className="tr-label" htmlFor="board">
                  Control board
                </label>
                <input
                  id="board"
                  className="tr-input font-mono"
                  autoCapitalize="characters"
                  placeholder="HK42FZ"
                  value={form.controlBoard}
                  onChange={set('controlBoard')}
                />
              </div>
            </div>

            <p className="text-xs leading-snug" style={{ color: 'var(--text-dim)' }}>
              The board part number is what makes a code mean one thing. Without it, a code that
              has several meanings comes back with all of them rather than a guess.
            </p>

            <button type="submit" className="tr-btn tr-btn-primary w-full" disabled={busy || !form.code.trim()}>
              {busy ? <Spinner label="Looking up" /> : 'Look up code'}
            </button>
          </Card>
        </form>

        <ErrorNote>{error}</ErrorNote>

        {resolution && <ResolutionView resolution={resolution} citations={citations} />}

        {!resolution && browse.length > 0 && (
          <Card>
            <p className="tr-label">Browse the database</p>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {browse.map((c) => (
                <li key={c.id} className="py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-bold">{c.code}</span>
                    <span className="text-sm">{c.title}</span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    {c.manufacturer}
                    {c.controlBoard ? ` · board ${c.controlBoard}` : c.modelSeries ? ` · ${c.modelSeries}` : ' · brand-level'}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

const STATE_COPY: Record<string, { title: string; tone: string }> = {
  EXACT: { title: 'Resolved to this control board', tone: 'sev-NORMAL' },
  MODEL_SCOPED: { title: 'Matched to the model series — confirm the board', tone: 'sev-WATCH' },
  AMBIGUOUS: { title: 'This code has more than one meaning', tone: 'sev-ABNORMAL' },
  BRAND_FALLBACK: { title: 'Brand-level entry only', tone: 'sev-WATCH' },
  NOT_FOUND: { title: 'Not in the database', tone: 'sev-INFO' },
};

function ResolutionView({
  resolution,
  citations,
}: {
  resolution: FaultCodeResolution;
  citations: Array<{ documentTitle: string; page?: number | null }>;
}) {
  const copy = STATE_COPY[resolution.state] ?? { title: resolution.state, tone: 'sev-INFO' };

  return (
    <div className="space-y-3">
      <Card>
        <span className={`tr-chip ${copy.tone}`}>{copy.title}</span>
        {resolution.disclaimer && (
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {resolution.disclaimer}
          </p>
        )}
        {resolution.needed.length > 0 && (
          <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--bg-inset)' }}>
            {resolution.needed.map((n) => (
              <p key={n.field} className="text-sm">
                <span className="font-bold">
                  {n.field === 'controlBoard' ? 'Get the board part number.' : 'Get the full model number.'}
                </span>{' '}
                <span style={{ color: 'var(--text-muted)' }}>{n.why}</span>
              </p>
            ))}
          </div>
        )}
      </Card>

      {resolution.candidates.map((c) => (
        <CodeCard key={c.id} record={c} solo={resolution.state === 'EXACT'} />
      ))}

      {citations.length > 0 && (
        <Card className="text-xs">
          <p className="tr-label">Manufacturer documents in the knowledge base</p>
          <ul style={{ color: 'var(--text-muted)' }}>
            {citations.map((c, i) => (
              <li key={`${c.documentTitle}-${i}`}>
                {c.documentTitle}
                {c.page ? `, p.${c.page}` : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function CodeCard({ record, solo }: { record: FaultCodeRecord; solo: boolean }) {
  const [openSteps, setOpenSteps] = useState(solo);

  return (
    <Card className="space-y-3">
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-lg font-bold">{record.code}</span>
          <h2 className="text-base font-bold">{record.title}</h2>
        </div>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-dim)' }}>
          {record.manufacturer}
          {record.controlBoard
            ? ` · board ${record.controlBoard}`
            : record.modelSeries
              ? ` · ${record.modelSeries} series`
              : ' · brand-level'}
          {record.displayCode ? ` · shown as: ${record.displayCode}` : ''}
        </p>
      </div>

      <section>
        <p className="tr-label">What it means</p>
        <p className="text-sm leading-relaxed">{record.meaning}</p>
      </section>

      <section>
        <p className="tr-label">What triggers it</p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {record.triggerConditions}
        </p>
      </section>

      <section>
        <p className="tr-label">Possible causes</p>
        <ul className="space-y-1.5 text-sm">
          {record.possibleCauses.map((c) => (
            <li key={c.cause} className="flex gap-2">
              <span
                className={`tr-chip shrink-0 ${
                  c.likelihood === 'COMMON' ? 'sev-ABNORMAL' : c.likelihood === 'OCCASIONAL' ? 'sev-WATCH' : 'sev-INFO'
                }`}
              >
                {c.likelihood.toLowerCase()}
              </span>
              <span>
                {c.cause}
                {c.note && (
                  <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
                    {c.note}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {record.testSequence.length > 0 && (
        <section>
          <button
            type="button"
            className="tr-btn tr-btn-secondary w-full text-sm"
            onClick={() => setOpenSteps(!openSteps)}
            aria-expanded={openSteps}
          >
            {openSteps ? 'Hide test sequence' : `Test sequence (${record.testSequence.length} steps)`}
          </button>

          {openSteps && (
            <ol className="mt-3 space-y-3">
              {record.testSequence.map((s) => (
                <li key={s.step} className="rounded-lg p-3" style={{ background: 'var(--bg-inset)' }}>
                  <p className="text-sm font-bold">
                    {s.step}. {s.action}
                  </p>
                  <p className="mt-1.5 text-xs">
                    <span className="font-semibold" style={{ color: 'var(--text-dim)' }}>
                      Expected:{' '}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{s.expected}</span>
                  </p>
                  <p className="mt-1 text-xs">
                    <span className="font-semibold" style={{ color: 'var(--color-good-400)' }}>
                      If it passes:{' '}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{s.ifPass}</span>
                  </p>
                  <p className="mt-1 text-xs">
                    <span className="font-semibold" style={{ color: 'var(--color-warn-400)' }}>
                      If it fails:{' '}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{s.ifFail}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {record.repairNotes && (
        <section className="rounded-lg p-3" style={{ background: 'var(--bg-inset)' }}>
          <p className="tr-label">Before you order parts</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {record.repairNotes}
          </p>
        </section>
      )}

      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
        Verification status: <span className="font-semibold">{record.verification}</span>
        {record.sourceCitation ? ` · ${record.sourceCitation}` : ''}
      </p>
    </Card>
  );
}
