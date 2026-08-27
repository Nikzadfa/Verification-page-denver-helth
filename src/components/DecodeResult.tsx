'use client';

import { Card } from '@/components/ui';

/**
 * Renders a decoded model number with its provenance intact: what was read out
 * of the nomenclature, what was inferred from a cross-brand convention, and
 * what could not be determined at all. Keeping those three visually distinct
 * is the whole point -- a guessed tonnage that looks like a decoded one will
 * eventually put the wrong part in a van.
 */
export function DecodeResult({
  summary,
  warnings,
}: {
  summary: {
    verified: Array<{ label: string; value: string }>;
    estimated: Array<{ label: string; value: string; note?: string }>;
    notDetermined: string[];
  };
  warnings: string[];
}) {
  return (
    <Card className="space-y-4">
      <div>
        <p className="tr-label">
          <span className="tr-chip sev-NORMAL mr-2">Decoded</span>
          Read from the model number
        </p>
        {summary.verified.length ? (
          <ul className="text-sm">
            {summary.verified.map((v) => (
              <li key={v.label} className="flex justify-between gap-3 py-0.5">
                <span style={{ color: 'var(--text-muted)' }}>{v.label}</span>
                <span className="font-medium">{v.value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Nothing could be decoded from the nomenclature.
          </p>
        )}
      </div>

      {summary.estimated.length > 0 && (
        <div>
          <p className="tr-label">
            <span className="tr-chip sev-WATCH mr-2">Estimated</span>
            Inferred, not read — confirm on the rating plate
          </p>
          <ul className="text-sm">
            {summary.estimated.map((v) => (
              <li key={v.label} className="py-1">
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--text-muted)' }}>{v.label}</span>
                  <span className="font-medium">{v.value}</span>
                </div>
                {v.note && (
                  <p className="mt-0.5 text-xs leading-snug" style={{ color: 'var(--text-dim)' }}>
                    {v.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.notDetermined.length > 0 && (
        <div>
          <p className="tr-label">Not determined</p>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            {summary.notDetermined.join(', ')}
          </p>
        </div>
      )}

      {warnings.map((w) => (
        <p key={w} className="text-xs" style={{ color: 'var(--color-warn-400)' }}>
          {w}
        </p>
      ))}
    </Card>
  );
}
