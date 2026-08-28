'use client';

import { useEffect, useState } from 'react';
import { EquipmentType } from '@prisma/client';
import { ApiError, AppHeader, Card, ErrorNote, Spinner, api } from '@/components/ui';

interface Doc {
  id: string;
  title: string;
  type: string;
  status: string;
  statusError: string | null;
  chunkCount: number;
  publication: string | null;
  modelSeries: string[];
  createdAt: string;
  manufacturer: { name: string } | null;
}

const DOC_TYPES = [
  'SERVICE_MANUAL',
  'INSTALLATION_MANUAL',
  'TROUBLESHOOTING_GUIDE',
  'WIRING_DIAGRAM',
  'TECHNICAL_BULLETIN',
  'FAULT_CODE_SHEET',
  'SPECIFICATION',
  'TRAINING',
  'OTHER',
] as const;

export default function AdminKnowledgePage() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    type: 'SERVICE_MANUAL' as (typeof DOC_TYPES)[number],
    manufacturerSlug: '',
    publication: '',
    modelSeries: '',
    equipmentType: '' as EquipmentType | '',
    text: '',
  });

  const load = () =>
    api<{ documents: Doc[] }>('/api/admin/knowledge')
      .then((r) => setDocs(r.documents))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load documents.'));

  useEffect(() => {
    void load();
  }, []);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<{ chunks: number; error?: string }>('/api/admin/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          type: form.type,
          manufacturerSlug: form.manufacturerSlug || null,
          publication: form.publication || null,
          modelSeries: form.modelSeries ? form.modelSeries.split(',').map((s) => s.trim()).filter(Boolean) : [],
          equipmentTypes: form.equipmentType ? [form.equipmentType] : [],
          text: form.text,
          companyPrivate: false,
        }),
      });
      setResult(r.error ? `Stored, but ingestion failed: ${r.error}` : `Indexed into ${r.chunks} chunks.`);
      setForm((f) => ({ ...f, title: '', text: '', publication: '' }));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <AppHeader title="Knowledge base" back="/admin" />

      <div className="space-y-4 px-3 py-4">
        <Card>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Documents indexed here are what let the assistant cite a manufacturer source instead of
            hedging. Paste the extracted text of a manual — scanned PDFs need OCR first, and the
            ingester will tell you if it finds no usable text.
          </p>
        </Card>

        <ErrorNote>{error}</ErrorNote>
        {result && (
          <p className="text-sm" style={{ color: 'var(--color-good-400)' }}>
            {result}
          </p>
        )}

        <form onSubmit={upload}>
          <Card className="space-y-3">
            <div>
              <label className="tr-label" htmlFor="t">
                Title
              </label>
              <input id="t" required className="tr-input" value={form.title} onChange={set('title')} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="tr-label" htmlFor="ty">
                  Type
                </label>
                <select id="ty" className="tr-input" value={form.type} onChange={set('type')}>
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="tr-label" htmlFor="mf">
                  Manufacturer slug
                </label>
                <input id="mf" className="tr-input font-mono" placeholder="carrier" value={form.manufacturerSlug} onChange={set('manufacturerSlug')} />
              </div>
              <div>
                <label className="tr-label" htmlFor="pub">
                  Publication no.
                </label>
                <input id="pub" className="tr-input font-mono" value={form.publication} onChange={set('publication')} />
              </div>
              <div>
                <label className="tr-label" htmlFor="eq">
                  Equipment type
                </label>
                <select id="eq" className="tr-input" value={form.equipmentType} onChange={set('equipmentType')}>
                  <option value="">Any</option>
                  {Object.values(EquipmentType).map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="tr-label" htmlFor="ms">
                Model series (comma separated)
              </label>
              <input id="ms" className="tr-input font-mono" placeholder="58MVC, 58TP" value={form.modelSeries} onChange={set('modelSeries')} />
            </div>

            <div>
              <label className="tr-label" htmlFor="tx">
                Document text
              </label>
              <textarea
                id="tx"
                required
                rows={8}
                className="tr-input font-mono text-sm"
                style={{ resize: 'vertical' }}
                placeholder="Paste the extracted text. Page markers in the form [[page 12]] are preserved as citations."
                value={form.text}
                onChange={set('text')}
              />
            </div>

            <button type="submit" className="tr-btn tr-btn-primary w-full" disabled={busy || !form.text.trim()}>
              {busy ? <Spinner label="Chunking and embedding" /> : 'Index document'}
            </button>
          </Card>
        </form>

        <Card>
          <p className="tr-label">Indexed documents</p>
          {docs === null ? (
            <Spinner label="Loading" />
          ) : docs.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Nothing indexed yet. Until a manufacturer document is here, the assistant will refuse
              to state a manufacturer specification and will tell technicians to read it off the
              rating plate.
            </p>
          ) : (
            <ul className="divide-y text-sm" style={{ borderColor: 'var(--border)' }}>
              {docs.map((d) => (
                <li key={d.id} className="py-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{d.title}</span>
                      <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
                        {d.manufacturer?.name ?? 'Unassigned'} · {d.type.replace(/_/g, ' ').toLowerCase()}
                        {d.publication ? ` · ${d.publication}` : ''} · {d.chunkCount} chunks
                      </span>
                      {d.statusError && (
                        <span className="block text-xs" style={{ color: 'var(--color-alert-400)' }}>
                          {d.statusError}
                        </span>
                      )}
                    </span>
                    <span
                      className={`tr-chip shrink-0 ${
                        d.status === 'READY' ? 'sev-NORMAL' : d.status === 'FAILED' ? 'sev-CRITICAL' : 'sev-WATCH'
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
