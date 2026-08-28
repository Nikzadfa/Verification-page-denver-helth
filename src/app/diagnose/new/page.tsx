'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { EquipmentType } from '@prisma/client';
import { ApiError, AppHeader, Card, ErrorNote, Spinner, api } from '@/components/ui';
import { VoiceInput } from '@/components/VoiceInput';
import { REFRIGERANT_IDS } from '@/lib/hvac/refrigerants';

const EQUIPMENT_LABELS: Partial<Record<EquipmentType, string>> = {
  CENTRAL_AC: 'Central AC',
  HEAT_PUMP: 'Heat pump',
  GAS_FURNACE: 'Gas furnace',
  ELECTRIC_FURNACE: 'Electric furnace',
  AIR_HANDLER: 'Air handler',
  PACKAGE_UNIT: 'Package unit',
  ROOFTOP_UNIT: 'Rooftop unit',
  MINI_SPLIT: 'Mini split',
  DUCTLESS_MULTI: 'Ductless multi-zone',
  VRF: 'VRF / VRV',
  DUAL_FUEL: 'Dual fuel',
  GEOTHERMAL: 'Geothermal',
  BOILER: 'Boiler',
  HYDRONIC: 'Hydronic',
  COMMERCIAL_SPLIT: 'Commercial split',
  REFRIGERATION: 'Refrigeration',
  WATER_HEATER: 'Water heater',
  VENTILATION: 'Ventilation',
  UNKNOWN: 'Not sure yet',
};

const MANUFACTURERS = [
  'Carrier', 'Bryant', 'Trane', 'American Standard', 'Lennox', 'Goodman',
  'Amana', 'Rheem', 'Ruud', 'York', 'Daikin', 'Mitsubishi Electric',
];

function NewDiagnosisForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Arriving from a scan or a fault-code lookup: prefill what is already known
  // and open the details panel so the technician can see it was carried over
  // rather than wondering whether it was lost.
  const prefilled = {
    modelNumber: params.get('model') ?? '',
    serialNumber: params.get('serial') ?? '',
    manufacturer: params.get('manufacturer') ?? '',
    faultCode: params.get('code') ?? '',
  };
  const hasPrefill = Object.values(prefilled).some(Boolean);

  const [showDetails, setShowDetails] = useState(hasPrefill);
  const [form, setForm] = useState({
    complaint: '',
    equipmentType: (params.get('equipmentType') as EquipmentType | null) ?? ('UNKNOWN' as EquipmentType),
    manufacturer: prefilled.manufacturer,
    modelNumber: prefilled.modelNumber,
    serialNumber: prefilled.serialNumber,
    controlBoard: params.get('board') ?? '',
    refrigerant: params.get('refrigerant') ?? '',
    meteringDevice: 'UNKNOWN',
    mode: 'UNKNOWN',
    faultCode: prefilled.faultCode,
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ sessionId: string }>('/api/diagnose', {
        method: 'POST',
        body: JSON.stringify({
          complaint: form.complaint,
          equipmentType: form.equipmentType,
          manufacturer: form.manufacturer || null,
          modelNumber: form.modelNumber || null,
          serialNumber: form.serialNumber || null,
          controlBoard: form.controlBoard || null,
          refrigerant: form.refrigerant || null,
          meteringDevice: form.meteringDevice,
          mode: form.mode,
          faultCode: form.faultCode || null,
        }),
      });
      router.push(`/diagnose/${result.sessionId}`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 402
            ? `${e.message} Visit Pricing to upgrade.`
            : e.message
          : 'Could not start the diagnosis.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <AppHeader title="New diagnosis" back="/" />

      <form onSubmit={submit} className="space-y-4 px-3 py-4">
        <Card className="space-y-3">
          <div>
            <label className="tr-label" htmlFor="complaint">
              What is the customer reporting?
            </label>
            <textarea
              id="complaint"
              required
              rows={3}
              className="tr-input"
              style={{ resize: 'vertical' }}
              placeholder='e.g. "AC is running but not cooling" or "No heat, furnace lights then shuts off"'
              value={form.complaint}
              onChange={set('complaint')}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
              Their words are fine. The engine works out what to ask first.
            </p>
          </div>
          <VoiceInput
            onTranscript={(t) => setForm((f) => ({ ...f, complaint: `${f.complaint} ${t}`.trim() }))}
            disabled={busy}
          />
        </Card>

        <Card className="space-y-3">
          <div>
            <label className="tr-label" htmlFor="equipmentType">
              Equipment
            </label>
            <select id="equipmentType" className="tr-input" value={form.equipmentType} onChange={set('equipmentType')}>
              {Object.values(EquipmentType).map((t) => (
                <option key={t} value={t}>
                  {EQUIPMENT_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="tr-label" htmlFor="mode">
                Running in
              </label>
              <select id="mode" className="tr-input" value={form.mode} onChange={set('mode')}>
                <option value="UNKNOWN">Not sure</option>
                <option value="COOLING">Cooling</option>
                <option value="HEATING">Heating</option>
                <option value="DEFROST">Defrost</option>
                <option value="IDLE">Not running</option>
              </select>
            </div>
            <div>
              <label className="tr-label" htmlFor="refrigerant">
                Refrigerant
              </label>
              <select id="refrigerant" className="tr-input" value={form.refrigerant} onChange={set('refrigerant')}>
                <option value="">Not sure</option>
                {REFRIGERANT_IDS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            className="tr-btn tr-btn-ghost w-full text-sm"
            onClick={() => setShowDetails(!showDetails)}
            aria-expanded={showDetails}
          >
            {showDetails ? 'Hide equipment details' : 'Add model, board or fault code'}
          </button>

          {showDetails && (
            <div className="space-y-3 border-t pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="tr-label" htmlFor="manufacturer">
                    Manufacturer
                  </label>
                  <input
                    id="manufacturer"
                    list="manufacturers"
                    className="tr-input"
                    value={form.manufacturer}
                    onChange={set('manufacturer')}
                  />
                  <datalist id="manufacturers">
                    {MANUFACTURERS.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="tr-label" htmlFor="faultCode">
                    Fault code
                  </label>
                  <input id="faultCode" className="tr-input font-mono" value={form.faultCode} onChange={set('faultCode')} />
                </div>
              </div>

              <div>
                <label className="tr-label" htmlFor="modelNumber">
                  Model number
                </label>
                <input
                  id="modelNumber"
                  className="tr-input font-mono"
                  autoCapitalize="characters"
                  value={form.modelNumber}
                  onChange={set('modelNumber')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="tr-label" htmlFor="serialNumber">
                    Serial number
                  </label>
                  <input
                    id="serialNumber"
                    className="tr-input font-mono"
                    autoCapitalize="characters"
                    value={form.serialNumber}
                    onChange={set('serialNumber')}
                  />
                </div>
                <div>
                  <label className="tr-label" htmlFor="controlBoard">
                    Control board
                  </label>
                  <input
                    id="controlBoard"
                    className="tr-input font-mono"
                    autoCapitalize="characters"
                    value={form.controlBoard}
                    onChange={set('controlBoard')}
                  />
                </div>
              </div>

              <div>
                <label className="tr-label" htmlFor="meteringDevice">
                  Metering device
                </label>
                <select id="meteringDevice" className="tr-input" value={form.meteringDevice} onChange={set('meteringDevice')}>
                  <option value="UNKNOWN">Not sure</option>
                  <option value="TXV">TXV</option>
                  <option value="EEV">EEV</option>
                  <option value="FIXED_ORIFICE">Fixed orifice / piston</option>
                  <option value="CAPILLARY">Capillary tube</option>
                </select>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                  Decides whether the system is charged by superheat or by subcooling. If you
                  don&rsquo;t know it yet, the engine will ask before it interprets a superheat
                  reading.
                </p>
              </div>

              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                A fault code is only interpreted once it is scoped to the model or the board.
                Manufacturers reuse code numbers across board generations, so an unscoped code
                comes back with every meaning rather than a guess.
              </p>
            </div>
          )}
        </Card>

        <ErrorNote>{error}</ErrorNote>

        <button type="submit" className="tr-btn tr-btn-primary w-full" disabled={busy || !form.complaint.trim()}>
          {busy ? <Spinner label="Starting" /> : 'Start diagnosis'}
        </button>
      </form>
    </div>
  );
}

export default function NewDiagnosisPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-3 py-4">
          <Spinner label="Loading" />
        </div>
      }
    >
      <NewDiagnosisForm />
    </Suspense>
  );
}
