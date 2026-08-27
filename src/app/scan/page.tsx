'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ApiError, AppHeader, Card, ErrorNote, Spinner, api } from '@/components/ui';
import type { VisionResult } from '@/lib/vision/analyze';
import type { DecodedModel } from '@/lib/decoder/types';
import { DecodeResult } from '@/components/DecodeResult';
import { renderWithUncertainty } from '@/lib/vision/analyze';

interface ScanResponse {
  photoId: string;
  analysis: VisionResult;
  decoded: {
    decoded: DecodedModel;
    summary: {
      verified: Array<{ label: string; value: string }>;
      estimated: Array<{ label: string; value: string; note?: string }>;
      notDetermined: string[];
    };
  } | null;
}

export default function ScanPage() {
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setPreview(URL.createObjectURL(file));

    const body = new FormData();
    body.append('file', file);
    body.append('kind', 'NAMEPLATE');

    try {
      setResult(await api<ScanResponse>('/api/photos', { method: 'POST', body }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not analyze the photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <AppHeader title="Scan equipment" back="/" />

      <div className="space-y-4 px-3 py-4">
        <Card className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Photograph the rating plate, a control board, or a fault display. Anything that
            cannot be read character by character comes back blank rather than guessed — a model
            number with one wrong character sends you to the wrong parts list.
          </p>

          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />

          <button
            type="button"
            className="tr-btn tr-btn-primary w-full"
            style={{ minHeight: '3.5rem' }}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? <Spinner label="Reading the label" /> : '📷 Take or choose a photo'}
          </button>
        </Card>

        <ErrorNote>{error}</ErrorNote>

        {preview && (
          <Card>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="The equipment photo you just captured"
              className="w-full rounded-lg"
              style={{ maxHeight: '18rem', objectFit: 'contain', background: 'var(--bg-inset)' }}
            />
          </Card>
        )}

        {result && <ScanResult result={result} />}
      </div>
    </div>
  );
}

function ScanResult({ result }: { result: ScanResponse }) {
  const a = result.analysis;
  const fields: Array<{ label: string; field: VisionResult['modelNumber'] }> = [
    { label: 'Manufacturer', field: a.manufacturer },
    { label: 'Model number', field: a.modelNumber },
    { label: 'Serial number', field: a.serialNumber },
    { label: 'Refrigerant', field: a.refrigerant },
    { label: 'Control board', field: a.controlBoard },
    { label: 'Fault display', field: a.faultDisplay },
  ];

  return (
    <div className="space-y-3">
      <Card>
        <p className="tr-label">What I could read</p>
        <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          {a.summary}
        </p>

        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {fields.map(({ label, field }) => (
            <li key={label} className="flex items-baseline justify-between gap-3 py-2">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {label}
              </span>
              {field.legible ? (
                <span className="text-right">
                  <span className="font-mono text-sm font-bold">{renderWithUncertainty(field)}</span>
                  {field.uncertainCharacters?.length ? (
                    <span className="block text-xs" style={{ color: 'var(--color-warn-400)' }}>
                      Bracketed characters are ambiguous — check them on the label.
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="tr-chip sev-INFO">Not legible</span>
              )}
            </li>
          ))}
        </ul>

        {a.nameplateData.length > 0 && (
          <>
            <p className="tr-label mt-4">Other nameplate values</p>
            <ul className="text-sm">
              {a.nameplateData.map((n) => (
                <li key={n.label} className="flex justify-between gap-3 py-0.5">
                  <span style={{ color: 'var(--text-muted)' }}>{n.label}</span>
                  <span className="font-mono">{n.value}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {a.imageQualityProblem && (
        <Card>
          <p className="tr-label" style={{ color: 'var(--color-warn-400)' }}>
            Take a better photo
          </p>
          {a.qualityIssues.length > 0 && (
            <ul className="mb-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              {a.qualityIssues.map((q) => (
                <li key={q}>• {q}</li>
              ))}
            </ul>
          )}
          <ul className="space-y-1.5 text-sm">
            {a.retakeGuidance.map((g) => (
              <li key={g} className="flex gap-2">
                <span aria-hidden>→</span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result.decoded && <DecodeResult summary={result.decoded.summary} warnings={result.decoded.decoded.warnings} />}

      {a.wiringObservations.length > 0 && (
        <Card>
          <p className="tr-label">Wiring observations</p>
          <ul className="space-y-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {a.wiringObservations.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
        </Card>
      )}

      {a.modelNumber.legible && (
        <Link
          href={`/diagnose/new?${new URLSearchParams(
            Object.entries({
              model: a.modelNumber.value ?? '',
              serial: a.serialNumber.legible ? (a.serialNumber.value ?? '') : '',
              manufacturer: a.manufacturer.legible ? (a.manufacturer.value ?? '') : '',
              refrigerant: a.refrigerant.legible ? (a.refrigerant.value ?? '') : '',
              board: a.controlBoard.legible ? (a.controlBoard.value ?? '') : '',
            }).filter(([, v]) => v),
          ).toString()}`}
          className="tr-btn tr-btn-primary w-full"
        >
          Start a diagnosis on this unit
        </Link>
      )}
    </div>
  );
}
