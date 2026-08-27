'use client';

import { useMemo, useState } from 'react';
import {
  MEASUREMENT_MAP,
  type MeasurementDef,
  checkRange,
} from '@/lib/engine/measurements';
import { Spinner } from '@/components/ui';

/**
 * Structured entry for exactly the readings the current test needs.
 *
 * Deliberately not a giant form of every possible measurement. The engine
 * asked for one test; this collects that test's readings and nothing else,
 * because a technician on a ladder should not be scrolling past thirty fields
 * to find the two they were asked for.
 */
export function MeasurementForm({
  keys,
  onSubmit,
  busy,
  submitLabel = 'Submit readings',
}: {
  keys: string[];
  onSubmit: (readings: Array<{ key: string; value?: number | null; text?: string | null; unit?: string | null }>) => void;
  busy?: boolean;
  submitLabel?: string;
}) {
  const defs = useMemo(
    () => keys.map((k) => MEASUREMENT_MAP[k]).filter((d): d is MeasurementDef => Boolean(d)),
    [keys],
  );
  const [values, setValues] = useState<Record<string, string>>({});

  const warnings = defs
    .map((d) => {
      const raw = values[d.key];
      if (d.kind !== 'number' || !raw) return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      return checkRange(d.key, n);
    })
    .filter(Boolean);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const readings = defs
      .map((d) => {
        const raw = values[d.key];
        if (raw === undefined || raw === '') return null;
        if (d.kind === 'number') {
          const n = Number(raw);
          return Number.isFinite(n) ? { key: d.key, value: n, unit: d.unit } : null;
        }
        return { key: d.key, text: raw, unit: d.unit };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (readings.length) onSubmit(readings);
  }

  if (!defs.length) return null;

  const anyEntered = defs.some((d) => values[d.key]);

  return (
    <form onSubmit={submit} className="space-y-3">
      {defs.map((def) => (
        <div key={def.key}>
          <label className="tr-label" htmlFor={`m-${def.key}`}>
            {def.label}
            {def.unit && (
              <span className="ml-1 font-normal" style={{ color: 'var(--text-dim)' }}>
                ({def.unit})
              </span>
            )}
          </label>

          {def.kind === 'choice' ? (
            <select
              id={`m-${def.key}`}
              className="tr-input"
              value={values[def.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))}
            >
              <option value="">Select…</option>
              {def.choices?.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`m-${def.key}`}
              type={def.kind === 'number' ? 'number' : 'text'}
              // A numeric keypad that includes a minus sign — return static is
              // negative and a technician must be able to type it.
              inputMode={def.kind === 'number' ? 'decimal' : 'text'}
              step={def.step ?? 'any'}
              className="tr-input font-mono"
              value={values[def.key] ?? ''}
              placeholder={def.kind === 'number' ? '—' : ''}
              onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))}
            />
          )}

          {def.hint && (
            <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-dim)' }}>
              {def.hint}
            </p>
          )}
        </div>
      ))}

      {warnings.map((w) => (
        <p key={w!.key} className="text-xs" style={{ color: 'var(--color-warn-400)' }}>
          {w!.message}
        </p>
      ))}

      <button type="submit" className="tr-btn tr-btn-primary w-full" disabled={busy || !anyEntered}>
        {busy ? <Spinner label="Analyzing" /> : submitLabel}
      </button>

      <p className="text-center text-xs" style={{ color: 'var(--text-dim)' }}>
        Leave anything you did not measure blank. The engine will ask again if it needs it —
        it will not assume a typical value.
      </p>
    </form>
  );
}
