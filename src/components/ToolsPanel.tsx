'use client';

import { useMemo, useState } from 'react';
import { Card, HazardBanner, Severity } from '@/components/ui';
import {
  REFRIGERANT_IDS,
  type RefrigerantId,
  getRefrigerant,
  glideAt,
  pressureFromSatTemp,
  satTempFromPressure,
} from '@/lib/hvac/refrigerants';
import { analyzeCircuit, type MeteringDevice } from '@/lib/hvac/refrigerationAnalysis';
import { analyzeCapacitor, analyzeMotorAmps, analyzeVoltage } from '@/lib/hvac/electrical';
import { analyzeStaticPressure, cfmFromElectricHeat, cfmPerTon } from '@/lib/hvac/airflow';
import { analyzeTemperatureRise, clockGasMeter, HSI_SEQUENCE } from '@/lib/hvac/combustion';
import { wetBulbF, dewPointF } from '@/lib/hvac/psychrometrics';
import { getHazards } from '@/lib/safety/hazards';

export type ToolCategory = 'electrical' | 'refrigeration' | 'heating' | 'airflow';

/**
 * Field calculators.
 *
 * These run entirely in the browser against the same library the diagnostic
 * engine uses, so a technician in a basement with no signal can still work out
 * a superheat. Nothing here is a diagnosis — every panel says what the number
 * means and what it does not settle.
 */
export function ToolsPanel({ category }: { category: ToolCategory }) {
  return (
    <div className="space-y-4 px-3 py-4">
      {category === 'refrigeration' && <RefrigerationTools />}
      {category === 'electrical' && <ElectricalTools />}
      {category === 'heating' && <HeatingTools />}
      {category === 'airflow' && <AirflowTools />}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Shared inputs
 * ------------------------------------------------------------------------ */

function NumField({
  label,
  unit,
  value,
  onChange,
  hint,
  step = 'any',
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  step?: string | number;
}) {
  const id = useMemo(() => `f-${label.replace(/\W+/g, '-').toLowerCase()}`, [label]);
  return (
    <div>
      <label className="tr-label" htmlFor={id}>
        {label}
        {unit && (
          <span className="ml-1 font-normal" style={{ color: 'var(--text-dim)' }}>
            ({unit})
          </span>
        )}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        className="tr-input font-mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && (
        <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-dim)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Result({
  label,
  value,
  unit,
  severity,
  note,
}: {
  label: string;
  value: string | number;
  unit?: string;
  severity?: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--bg-inset)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <span className="font-mono text-lg font-bold tabular-nums">
          {value}
          {unit ? <span className="ml-1 text-sm font-normal">{unit}</span> : null}
        </span>
      </div>
      {severity && (
        <div className="mt-1.5">
          <Severity level={severity} />
        </div>
      )}
      {note && (
        <p className="mt-1.5 text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
          {note}
        </p>
      )}
    </div>
  );
}

const num = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

/* --------------------------------------------------------------------------
 * Refrigeration
 * ------------------------------------------------------------------------ */

function RefrigerationTools() {
  const [refrigerant, setRefrigerant] = useState<RefrigerantId>('R-410A');
  const [metering, setMetering] = useState<MeteringDevice>('TXV');
  const [f, setF] = useState({
    suctionPsig: '',
    suctionLine: '',
    liquidPsig: '',
    liquidLine: '',
    outdoorDb: '',
    returnDb: '',
    returnWb: '',
    supplyDb: '',
    targetSubcool: '',
    discharge: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const analysis = useMemo(
    () =>
      analyzeCircuit({
        refrigerant,
        meteringDevice: metering,
        mode: 'COOLING',
        suctionPsig: num(f.suctionPsig),
        suctionLineTempF: num(f.suctionLine),
        liquidPsig: num(f.liquidPsig),
        liquidLineTempF: num(f.liquidLine),
        outdoorDbF: num(f.outdoorDb),
        returnDbF: num(f.returnDb),
        returnWbF: num(f.returnWb),
        supplyDbF: num(f.supplyDb),
        targetSubcoolF: num(f.targetSubcool),
        dischargeLineTempF: num(f.discharge),
      }),
    [refrigerant, metering, f],
  );

  const info = getRefrigerant(refrigerant);

  return (
    <>
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="tr-label" htmlFor="ref">
              Refrigerant
            </label>
            <select
              id="ref"
              className="tr-input"
              value={refrigerant}
              onChange={(e) => setRefrigerant(e.target.value as RefrigerantId)}
            >
              {REFRIGERANT_IDS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="tr-label" htmlFor="met">
              Metering device
            </label>
            <select
              id="met"
              className="tr-input"
              value={metering}
              onChange={(e) => setMetering(e.target.value as MeteringDevice)}
            >
              <option value="TXV">TXV</option>
              <option value="EEV">EEV</option>
              <option value="FIXED_ORIFICE">Fixed orifice</option>
              <option value="CAPILLARY">Capillary</option>
              <option value="UNKNOWN">Not sure</option>
            </select>
          </div>
        </div>

        <div
          className="rounded-lg p-3 text-xs leading-relaxed"
          style={{ background: 'var(--bg-inset)', color: 'var(--text-muted)' }}
        >
          <p className="font-bold" style={{ color: 'var(--text)' }}>
            {info.name}
          </p>
          <p className="mt-1">
            {info.blend === 'ZEOTROPIC'
              ? `Zeotropic, about ${info.nominalGlideF} °F glide. Superheat uses the dew point, subcooling the bubble point.`
              : info.blend === 'NEAR_AZEOTROPIC'
                ? 'Near-azeotropic — glide is small enough to ignore in the field.'
                : 'Single component — no glide.'}
          </p>
          {info.notes.map((n) => (
            <p key={n} className="mt-1">
              • {n}
            </p>
          ))}
        </div>

        {info.flammable && <HazardBanner hazards={getHazards(['a2l-flammable'])} />}
      </Card>

      <Card className="space-y-3">
        <p className="tr-label">Low side</p>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Suction pressure" unit="psig" value={f.suctionPsig} onChange={set('suctionPsig')} />
          <NumField label="Suction line temp" unit="°F" value={f.suctionLine} onChange={set('suctionLine')} />
        </div>

        <p className="tr-label pt-2">High side</p>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Liquid pressure" unit="psig" value={f.liquidPsig} onChange={set('liquidPsig')} />
          <NumField label="Liquid line temp" unit="°F" value={f.liquidLine} onChange={set('liquidLine')} />
        </div>

        <p className="tr-label pt-2">Air side</p>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Outdoor dry bulb" unit="°F" value={f.outdoorDb} onChange={set('outdoorDb')} />
          <NumField label="Return dry bulb" unit="°F" value={f.returnDb} onChange={set('returnDb')} />
          <NumField
            label="Return wet bulb"
            unit="°F"
            value={f.returnWb}
            onChange={set('returnWb')}
            hint="Needed for a fixed-orifice target superheat."
          />
          <NumField label="Supply dry bulb" unit="°F" value={f.supplyDb} onChange={set('supplyDb')} />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <NumField
            label="Target subcooling"
            unit="°F"
            value={f.targetSubcool}
            onChange={set('targetSubcool')}
            hint="From the unit nameplate."
          />
          <NumField label="Discharge line temp" unit="°F" value={f.discharge} onChange={set('discharge')} />
        </div>
      </Card>

      {analysis.derived.length > 0 && (
        <Card className="space-y-2">
          <p className="tr-label">Results</p>
          {analysis.derived.map((d) => (
            <Result
              key={d.key}
              label={d.label}
              value={d.value ?? '—'}
              unit={d.unit}
              severity={d.severity}
              note={`${d.target ? `Expected ${d.target.low}–${d.target.high}. ` : ''}${d.explanation}${
                d.mustVerify ? ' Converted from pressure — confirm against your P/T chart if marginal.' : ''
              }`}
            />
          ))}
        </Card>
      )}

      {analysis.findings.length > 0 && (
        <Card className="space-y-2">
          <p className="tr-label">What this pattern means</p>
          {analysis.findings.map((x) => (
            <div key={x.key} className="rounded-lg p-3" style={{ background: 'var(--bg-inset)' }}>
              <div className="flex items-center gap-2">
                <Severity level={x.severity} />
                <span className="text-sm font-bold">{x.label}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {x.detail}
              </p>
            </div>
          ))}
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            These are readings, not a diagnosis. Start a guided diagnosis to have the engine weigh
            them against the alternatives and tell you which test separates them.
          </p>
        </Card>
      )}

      {analysis.missing.length > 0 && (
        <Card>
          <p className="tr-label">Add these for a fuller picture</p>
          <ul className="space-y-2 text-sm">
            {analysis.missing.map((m) => (
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

      <PtChart refrigerant={refrigerant} />
    </>
  );
}

function PtChart({ refrigerant }: { refrigerant: RefrigerantId }) {
  const [mode, setMode] = useState<'p2t' | 't2p'>('p2t');
  const [value, setValue] = useState('');
  const [curve, setCurve] = useState<'dew' | 'bubble'>('dew');

  const n = num(value);
  const result =
    n === null
      ? null
      : mode === 'p2t'
        ? satTempFromPressure(refrigerant, n, curve)
        : pressureFromSatTemp(refrigerant, n, curve);

  return (
    <Card className="space-y-3">
      <p className="tr-label">P/T converter</p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="tr-btn tr-btn-secondary text-sm"
          style={mode === 'p2t' ? { borderColor: 'var(--accent)' } : undefined}
          onClick={() => setMode('p2t')}
          aria-pressed={mode === 'p2t'}
        >
          Pressure → temp
        </button>
        <button
          type="button"
          className="tr-btn tr-btn-secondary text-sm"
          style={mode === 't2p' ? { borderColor: 'var(--accent)' } : undefined}
          onClick={() => setMode('t2p')}
          aria-pressed={mode === 't2p'}
        >
          Temp → pressure
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumField
          label={mode === 'p2t' ? 'Pressure' : 'Saturation temp'}
          unit={mode === 'p2t' ? 'psig' : '°F'}
          value={value}
          onChange={setValue}
        />
        <div>
          <label className="tr-label" htmlFor="curve">
            Curve
          </label>
          <select
            id="curve"
            className="tr-input"
            value={curve}
            onChange={(e) => setCurve(e.target.value as 'dew' | 'bubble')}
          >
            <option value="dew">Dew (suction / superheat)</option>
            <option value="bubble">Bubble (liquid / subcooling)</option>
          </select>
        </div>
      </div>

      {result && (
        <Result
          label={mode === 'p2t' ? 'Saturation temperature' : 'Saturation pressure'}
          value={result.value}
          unit={mode === 'p2t' ? '°F' : 'psig'}
          note={`${result.note}${result.outOfRange ? ' Value was clamped to the end of the table.' : ''}`}
        />
      )}

      {getRefrigerant(refrigerant).blend !== 'SINGLE_COMPONENT' && n !== null && mode === 't2p' && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Glide at {n} °F is about {glideAt(refrigerant, n)} °F.
        </p>
      )}

      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
        These tables are field approximations, accurate enough to tell one failure pattern from
        another but not a substitute for the refrigerant manufacturer&rsquo;s P/T chart. If your
        manifold reads saturation directly, use that number instead.
      </p>
    </Card>
  );
}

/* --------------------------------------------------------------------------
 * Electrical
 * ------------------------------------------------------------------------ */

function ElectricalTools() {
  const [cap, setCap] = useState({ rated: '', measured: '' });
  const [motor, setMotor] = useState({ amps: '', rla: '', lra: '' });
  const [volts, setVolts] = useState({ measured: '', rated: '240', a: '', b: '', c: '' });

  const capResult =
    num(cap.rated) && num(cap.measured) !== null
      ? analyzeCapacitor({ ratedUf: num(cap.rated)!, measuredUf: num(cap.measured)! })
      : null;

  const motorResult =
    num(motor.amps) !== null && num(motor.rla)
      ? analyzeMotorAmps({
          ratedAmps: num(motor.rla)!,
          measuredAmps: num(motor.amps)!,
          lraAmps: num(motor.lra),
          kind: 'COMPRESSOR',
        })
      : null;

  const three =
    num(volts.a) !== null && num(volts.b) !== null && num(volts.c) !== null
      ? ([num(volts.a)!, num(volts.b)!, num(volts.c)!] as [number, number, number])
      : null;

  const voltResult =
    num(volts.measured) !== null && num(volts.rated)
      ? analyzeVoltage({
          measuredVolts: num(volts.measured)!,
          ratedVolts: num(volts.rated)!,
          threePhase: three,
        })
      : null;

  return (
    <>
      <HazardBanner hazards={getHazards(['electrical-shock', 'capacitor-stored-charge'])} />

      <Card className="space-y-3">
        <p className="tr-label">Run capacitor</p>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Rated" unit="µF" value={cap.rated} onChange={(v) => setCap((c) => ({ ...c, rated: v }))} />
          <NumField
            label="Measured"
            unit="µF"
            value={cap.measured}
            onChange={(v) => setCap((c) => ({ ...c, measured: v }))}
            hint="Discharge it first, with a lead disconnected."
          />
        </div>
        {capResult && (
          <>
            <Result
              label="Deviation from rating"
              value={`${capResult.deviationPercent > 0 ? '+' : ''}${capResult.deviationPercent}`}
              unit="%"
              severity={capResult.severity}
              note={`In-tolerance range ${capResult.low}–${capResult.high} µF. ${capResult.explanation}`}
            />
            {capResult.findings.map((x) => (
              <p key={x.key} className="text-sm" style={{ color: 'var(--color-warn-400)' }}>
                {x.detail}
              </p>
            ))}
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="tr-label">Compressor amp draw</p>
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Measured" unit="A" value={motor.amps} onChange={(v) => setMotor((m) => ({ ...m, amps: v }))} />
          <NumField label="RLA" unit="A" value={motor.rla} onChange={(v) => setMotor((m) => ({ ...m, rla: v }))} />
          <NumField label="LRA" unit="A" value={motor.lra} onChange={(v) => setMotor((m) => ({ ...m, lra: v }))} />
        </div>
        {motorResult && (
          <>
            <Result
              label="Percent of RLA"
              value={motorResult.percentOfRated}
              unit="%"
              severity={motorResult.severity}
              note={motorResult.explanation}
            />
            {motorResult.findings.map((x) => (
              <p key={x.key} className="text-sm" style={{ color: 'var(--color-warn-400)' }}>
                {x.detail}
              </p>
            ))}
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="tr-label">Supply voltage</p>
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="Measured"
            unit="V"
            value={volts.measured}
            onChange={(v) => setVolts((s) => ({ ...s, measured: v }))}
          />
          <NumField label="Nameplate" unit="V" value={volts.rated} onChange={(v) => setVolts((s) => ({ ...s, rated: v }))} />
        </div>

        <p className="tr-label pt-1">Three phase (optional)</p>
        <div className="grid grid-cols-3 gap-2">
          <NumField label="L1–L2" unit="V" value={volts.a} onChange={(v) => setVolts((s) => ({ ...s, a: v }))} />
          <NumField label="L2–L3" unit="V" value={volts.b} onChange={(v) => setVolts((s) => ({ ...s, b: v }))} />
          <NumField label="L1–L3" unit="V" value={volts.c} onChange={(v) => setVolts((s) => ({ ...s, c: v }))} />
        </div>

        {voltResult && (
          <>
            <Result
              label="Deviation"
              value={`${voltResult.deviationPercent > 0 ? '+' : ''}${voltResult.deviationPercent}`}
              unit="%"
              severity={voltResult.severity}
              note="Most equipment is rated for ±10%."
            />
            {voltResult.imbalancePercent !== null && (
              <Result
                label="Phase imbalance"
                value={voltResult.imbalancePercent}
                unit="%"
                severity={voltResult.imbalancePercent > 2 ? 'CRITICAL' : 'NORMAL'}
                note="NEMA limits continuous operation to 1%, most compressor manufacturers to 2%."
              />
            )}
            {voltResult.findings.map((x) => (
              <p key={x.key} className="text-sm" style={{ color: 'var(--color-warn-400)' }}>
                {x.detail}
              </p>
            ))}
          </>
        )}
      </Card>
    </>
  );
}

/* --------------------------------------------------------------------------
 * Heating
 * ------------------------------------------------------------------------ */

function HeatingTools() {
  const [rise, setRise] = useState({ supply: '', ret: '', min: '', max: '' });
  const [gas, setGas] = useState({ dial: '1', seconds: '', hv: '1000', rated: '', altitude: '' });

  const riseResult =
    num(rise.supply) !== null && num(rise.ret) !== null
      ? analyzeTemperatureRise({
          supplyDbF: num(rise.supply)!,
          returnDbF: num(rise.ret)!,
          ratedRiseMinF: num(rise.min),
          ratedRiseMaxF: num(rise.max),
        })
      : null;

  const gasResult =
    num(gas.seconds) && num(gas.dial)
      ? clockGasMeter({
          dialSizeCuFt: num(gas.dial)!,
          secondsPerRevolution: num(gas.seconds)!,
          heatingValueBtuPerCuFt: num(gas.hv) ?? 1000,
          ratedInputBtuh: num(gas.rated),
          altitudeFt: num(gas.altitude),
        })
      : null;

  return (
    <>
      <HazardBanner hazards={getHazards(['natural-gas', 'co-exposure', 'hot-surfaces'])} />

      <Card className="space-y-3">
        <p className="tr-label">Temperature rise</p>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Supply" unit="°F" value={rise.supply} onChange={(v) => setRise((r) => ({ ...r, supply: v }))} />
          <NumField label="Return" unit="°F" value={rise.ret} onChange={(v) => setRise((r) => ({ ...r, ret: v }))} />
          <NumField label="Rated min" unit="°F" value={rise.min} onChange={(v) => setRise((r) => ({ ...r, min: v }))} />
          <NumField label="Rated max" unit="°F" value={rise.max} onChange={(v) => setRise((r) => ({ ...r, max: v }))} />
        </div>
        {riseResult && (
          <>
            <Result
              label="Temperature rise"
              value={riseResult.riseF}
              unit="°F"
              severity={riseResult.severity}
              note={riseResult.explanation}
            />
            {riseResult.findings.map((x) => (
              <p key={x.key} className="text-sm" style={{ color: 'var(--color-warn-400)' }}>
                {x.detail}
              </p>
            ))}
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="tr-label">Clock the gas meter</p>
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="Dial size"
            unit="ft³"
            value={gas.dial}
            onChange={(v) => setGas((g) => ({ ...g, dial: v }))}
            hint="Usually ½, 1 or 2."
          />
          <NumField
            label="Seconds per revolution"
            value={gas.seconds}
            onChange={(v) => setGas((g) => ({ ...g, seconds: v }))}
            hint="Every other gas appliance off."
          />
          <NumField
            label="Heating value"
            unit="BTU/ft³"
            value={gas.hv}
            onChange={(v) => setGas((g) => ({ ...g, hv: v }))}
            hint="Confirm with the utility — 1,000 is a default, not a fact."
          />
          <NumField
            label="Rated input"
            unit="BTU/h"
            value={gas.rated}
            onChange={(v) => setGas((g) => ({ ...g, rated: v }))}
          />
          <NumField
            label="Altitude"
            unit="ft"
            value={gas.altitude}
            onChange={(v) => setGas((g) => ({ ...g, altitude: v }))}
          />
        </div>
        {gasResult && (
          <>
            <Result
              label="Actual input"
              value={gasResult.inputBtuh.toLocaleString()}
              unit="BTU/h"
              severity={gasResult.findings.length ? gasResult.findings[0]!.severity : 'NORMAL'}
              note={`${gasResult.percentOfRated !== null ? `${gasResult.percentOfRated}% of rated. ` : ''}${gasResult.note}`}
            />
            {gasResult.findings.map((x) => (
              <p key={x.key} className="text-sm" style={{ color: 'var(--color-warn-400)' }}>
                {x.detail}
              </p>
            ))}
          </>
        )}
      </Card>

      <Card>
        <p className="tr-label">Ignition sequence of operations</p>
        <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Watch the sequence and find the first checkpoint that fails. That localizes the fault far
          faster than swapping the part that usually fails.
        </p>
        <ol className="space-y-2">
          {HSI_SEQUENCE.map((c) => (
            <li key={c.n} className="rounded-lg p-3" style={{ background: 'var(--bg-inset)' }}>
              <p className="text-sm font-bold">
                {c.n}. {c.stage}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="font-semibold">Look for: </span>
                {c.observable}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-warn-400)' }}>
                <span className="font-semibold">If it does not happen: </span>
                {c.ifAbsent}
              </p>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}

/* --------------------------------------------------------------------------
 * Airflow
 * ------------------------------------------------------------------------ */

function AirflowTools() {
  const [sp, setSp] = useState({ ret: '', sup: '', rated: '0.5', filter: '', coil: '' });
  const [heat, setHeat] = useState({ volts: '', amps: '', rise: '' });
  const [perTon, setPerTon] = useState({ cfm: '', tons: '' });
  const [psy, setPsy] = useState({ db: '', rh: '' });

  const spResult = analyzeStaticPressure({
    returnIwc: num(sp.ret),
    supplyIwc: num(sp.sup),
    ratedMaxIwc: num(sp.rated),
    filterDropIwc: num(sp.filter),
    coilDropIwc: num(sp.coil),
  });

  const heatResult =
    num(heat.volts) && num(heat.amps) && num(heat.rise)
      ? cfmFromElectricHeat({
          volts: num(heat.volts)!,
          amps: num(heat.amps)!,
          temperatureRiseF: num(heat.rise)!,
        })
      : null;

  const perTonResult =
    num(perTon.cfm) && num(perTon.tons) ? cfmPerTon(num(perTon.cfm)!, num(perTon.tons)!) : null;

  const psyResult =
    num(psy.db) !== null && num(psy.rh) !== null
      ? { wb: wetBulbF(num(psy.db)!, num(psy.rh)!), dp: dewPointF(num(psy.db)!, num(psy.rh)!) }
      : null;

  return (
    <>
      <HazardBanner hazards={getHazards(['moving-parts'])} />

      <Card className="space-y-3">
        <p className="tr-label">Total external static pressure</p>
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="Return static"
            unit="in. w.c."
            value={sp.ret}
            onChange={(v) => setSp((s) => ({ ...s, ret: v }))}
            hint="Between the filter and the blower. Negative."
            step="0.01"
          />
          <NumField
            label="Supply static"
            unit="in. w.c."
            value={sp.sup}
            onChange={(v) => setSp((s) => ({ ...s, sup: v }))}
            hint="After the blower and the coil."
            step="0.01"
          />
          <NumField
            label="Rated max"
            unit="in. w.c."
            value={sp.rated}
            onChange={(v) => setSp((s) => ({ ...s, rated: v }))}
            hint="From this unit's blower table."
            step="0.01"
          />
          <NumField
            label="Filter drop"
            unit="in. w.c."
            value={sp.filter}
            onChange={(v) => setSp((s) => ({ ...s, filter: v }))}
            step="0.01"
          />
          <NumField
            label="Coil drop"
            unit="in. w.c."
            value={sp.coil}
            onChange={(v) => setSp((s) => ({ ...s, coil: v }))}
            step="0.01"
          />
        </div>

        {spResult.totalIwc !== null ? (
          <Result
            label="Total external static"
            value={spResult.totalIwc}
            unit="in. w.c."
            severity={spResult.severity}
            note={`${spResult.percentOfRated}% of the ${spResult.ratedMaxIwc} in. w.c. rating. ${spResult.explanation}`}
          />
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {spResult.explanation}
          </p>
        )}

        {spResult.findings.map((x) => (
          <p key={x.key} className="text-sm" style={{ color: 'var(--color-warn-400)' }}>
            {x.detail}
          </p>
        ))}

        {spResult.nextSteps.length > 0 && (
          <ul className="space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {spResult.nextSteps.map((s) => (
              <li key={s}>→ {s}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="tr-label">Airflow from electric heat</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          The most reliable field airflow measurement on an electric-heat air handler.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Volts" unit="V" value={heat.volts} onChange={(v) => setHeat((h) => ({ ...h, volts: v }))} />
          <NumField
            label="Amps"
            unit="A"
            value={heat.amps}
            onChange={(v) => setHeat((h) => ({ ...h, amps: v }))}
            hint="Sum all legs."
          />
          <NumField label="Rise" unit="°F" value={heat.rise} onChange={(v) => setHeat((h) => ({ ...h, rise: v }))} />
        </div>
        {heatResult?.cfm && (
          <Result
            label="Calculated airflow"
            value={heatResult.cfm.toLocaleString()}
            unit="CFM"
            note={`${heatResult.watts.toLocaleString()} W measured. ${heatResult.note}`}
          />
        )}
      </Card>

      <Card className="space-y-3">
        <p className="tr-label">CFM per ton</p>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Airflow" unit="CFM" value={perTon.cfm} onChange={(v) => setPerTon((p) => ({ ...p, cfm: v }))} />
          <NumField label="Capacity" unit="tons" value={perTon.tons} onChange={(v) => setPerTon((p) => ({ ...p, tons: v }))} />
        </div>
        {perTonResult && (
          <>
            <Result
              label="CFM per ton"
              value={perTonResult.value}
              severity={perTonResult.severity}
              note="Design is typically 350–400 for comfort cooling, often 300–350 where dehumidification matters."
            />
            {perTonResult.findings.map((x) => (
              <p key={x.key} className="text-sm" style={{ color: 'var(--color-warn-400)' }}>
                {x.detail}
              </p>
            ))}
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="tr-label">Wet bulb and dew point</p>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Dry bulb" unit="°F" value={psy.db} onChange={(v) => setPsy((p) => ({ ...p, db: v }))} />
          <NumField label="Relative humidity" unit="%" value={psy.rh} onChange={(v) => setPsy((p) => ({ ...p, rh: v }))} />
        </div>
        {psyResult && (
          <div className="grid grid-cols-2 gap-2">
            <Result label="Wet bulb" value={psyResult.wb} unit="°F" />
            <Result label="Dew point" value={psyResult.dp} unit="°F" />
          </div>
        )}
      </Card>
    </>
  );
}
