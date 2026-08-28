/**
 * Wireless probe pipeline.
 *
 * Two classes of failure are worth a test here, and they are not the same
 * kind of thing.
 *
 * The decoder is arithmetic against a published specification: get the scale
 * factor or the endianness wrong and every reading is silently wrong by a
 * constant, which is exactly the sort of bug that survives a demo.
 *
 * The capture rules are safety. A stale reading, an unassigned clamp, or a
 * simulated probe reaching a customer's service report each turn the feature
 * from a time-saver into a way of recording a number nobody measured.
 */

import { describe, expect, it } from 'vitest';
import {
  decodeBattery,
  decodeEss,
  ESS_HUMIDITY,
  ESS_PRESSURE,
  ESS_TEMPERATURE,
  STANDARD_ATMOSPHERE_PSI,
} from '../src/lib/probes/drivers/environmentalSensing';
import { SCENARIOS, simulate, simulatedDevice } from '../src/lib/probes/drivers/simulated';
import {
  freshness,
  liveChannels,
  liveCircuit,
  measurementKeyFor,
  selectForCapture,
  type LiveChannel,
} from '../src/lib/probes/link';
import { REFUSE_CAPTURE_AFTER_MS, STALE_AFTER_MS, type ProbeReading } from '../src/lib/probes/types';

function view(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

describe('Bluetooth environmental sensing decoder', () => {
  it('reads temperature as little-endian hundredths of a degree Celsius', () => {
    // 2500 = 25.00 °C = 77.0 °F
    const decoded = decodeEss(ESS_TEMPERATURE, view([0xc4, 0x09]));
    expect(decoded?.quantity).toBe('TEMPERATURE_F');
    expect(decoded?.value).toBeCloseTo(77, 1);
  });

  it('reads a temperature below freezing as signed, not as a huge positive', () => {
    // -1000 = -10.00 °C = 14 °F. Reading this field unsigned gives 655.35 °C.
    const decoded = decodeEss(ESS_TEMPERATURE, view([0x18, 0xfc]));
    expect(decoded?.value).toBeCloseTo(14, 1);
  });

  it('reads humidity as hundredths of a percent', () => {
    const decoded = decodeEss(ESS_HUMIDITY, view([0x10, 0x17])); // 5904 = 59.04 %
    expect(decoded?.quantity).toBe('RELATIVE_HUMIDITY');
    expect(decoded?.value).toBeCloseTo(59, 1);
  });

  it('converts absolute pressure to gauge, and says that it assumed an atmosphere', () => {
    // 1013250 tenths of a Pa = 101325 Pa = one standard atmosphere, so gauge
    // pressure at sea level is 0.
    const decoded = decodeEss(ESS_PRESSURE, view([0x42, 0x77, 0x0f, 0x00]));
    expect(decoded?.quantity).toBe('PRESSURE_PSIG');
    expect(decoded?.value).toBeCloseTo(0, 0);
    // The assumption is stated rather than buried — at altitude it is wrong.
    expect(decoded?.caveat).toMatch(/absolute/i);
  });

  it('refuses a truncated notification rather than reading it as zero', () => {
    expect(decodeEss(ESS_TEMPERATURE, view([0x00]))).toBeNull();
    expect(decodeEss(ESS_PRESSURE, view([0x00, 0x00]))).toBeNull();
    expect(decodeBattery(view([]))).toBeNull();
  });

  it('ignores a characteristic it does not handle', () => {
    expect(decodeEss('0000dead-0000-1000-8000-00805f9b34fb', view([0x01, 0x02]))).toBeNull();
  });

  it('sanity-checks the atmosphere constant it subtracts', () => {
    expect(STANDARD_ATMOSPHERE_PSI).toBeCloseTo(14.7, 1);
  });
});

describe('channel to measurement mapping', () => {
  it('needs a position, not just a quantity', () => {
    // The same pipe clamp reads identically on either line. Only the position
    // says which measurement it is.
    expect(measurementKeyFor('TEMPERATURE_F', 'SUCTION')).toBe('suction_line_temp');
    expect(measurementKeyFor('TEMPERATURE_F', 'LIQUID')).toBe('liquid_line_temp');
    expect(measurementKeyFor('TEMPERATURE_F', 'UNASSIGNED')).toBeNull();
  });

  it('does not invent a home for a reading the engine has no use for', () => {
    expect(measurementKeyFor('VACUUM_MICRONS', 'VACUUM')).toBeNull();
  });
});

describe('freshness', () => {
  const reading = (age: number): ProbeReading => ({
    deviceId: 'd',
    channelId: 'c',
    quantity: 'TEMPERATURE_F',
    value: 70,
    at: Date.now() - age,
  });

  it('ages from live through stale to expired', () => {
    expect(freshness(reading(1_000))).toBe('LIVE');
    expect(freshness(reading(STALE_AFTER_MS + 1_000))).toBe('STALE');
    expect(freshness(reading(REFUSE_CAPTURE_AFTER_MS + 1_000))).toBe('EXPIRED');
  });
});

describe('capture rules', () => {
  const base: LiveChannel = {
    deviceId: 'd1',
    channelId: 'c1',
    deviceName: 'Probe',
    channelLabel: 'P1',
    quantity: 'PRESSURE_PSIG',
    position: 'SUCTION',
    measurementKey: 'suction_pressure',
    measurementLabel: 'Suction pressure',
    value: 118.4,
    unit: 'psig',
    at: Date.now(),
    freshness: 'LIVE',
    simulated: false,
    battery: undefined,
  };

  it('captures a live, assigned reading with probe provenance', () => {
    const { readings } = selectForCapture([base]);
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({ key: 'suction_pressure', value: 118.4, source: 'probe' });
    expect(readings[0]?.note).toContain('P1');
  });

  it('never captures a simulated reading into a real diagnosis', () => {
    const { readings, skipped } = selectForCapture([{ ...base, simulated: true }]);
    expect(readings).toHaveLength(0);
    expect(skipped[0]?.reason).toMatch(/simulated/i);
  });

  it('refuses a reading whose probe stopped reporting a minute ago', () => {
    const { readings, skipped } = selectForCapture([{ ...base, freshness: 'EXPIRED' }]);
    expect(readings).toHaveLength(0);
    expect(skipped[0]?.reason).toMatch(/over a minute old/i);
  });

  it('still captures a merely stale reading, but says so on the record', () => {
    // Twelve seconds is a dropped packet, not a dead probe. Refusing it would
    // make the feature useless on a noisy site; hiding it would be worse.
    const { readings } = selectForCapture([{ ...base, freshness: 'STALE' }]);
    expect(readings).toHaveLength(1);
    expect(readings[0]?.note).toMatch(/not fresh/i);
  });

  it('skips an unassigned channel and says what to do about it', () => {
    const { readings, skipped } = selectForCapture([
      { ...base, position: 'UNASSIGNED', measurementKey: null, measurementLabel: null },
    ]);
    expect(readings).toHaveLength(0);
    expect(skipped[0]?.reason).toMatch(/where this probe is clamped/i);
  });

  it('refuses to let two probes claim the same measurement', () => {
    // Two clamps both set to "suction line" is a real mistake on a manifold.
    // Silently taking the second would overwrite the first with no warning.
    const { readings, skipped } = selectForCapture([base, { ...base, channelId: 'c2', channelLabel: 'P2' }]);
    expect(readings).toHaveLength(1);
    expect(skipped[0]?.reason).toMatch(/already assigned/i);
  });

  it('reports every exclusion rather than dropping one quietly', () => {
    const result = selectForCapture([
      base,
      { ...base, channelId: 'c2', channelLabel: 'P2', freshness: 'EXPIRED' },
      { ...base, channelId: 'c3', channelLabel: 'T9', position: 'UNASSIGNED', measurementKey: null },
    ]);
    expect(result.readings).toHaveLength(1);
    expect(result.skipped).toHaveLength(2);
  });
});

describe('live superheat and subcooling', () => {
  const now = Date.now();

  function channelsFrom(readings: ProbeReading[]) {
    return liveChannels(
      [simulatedDevice],
      readings,
      [
        { deviceId: simulatedDevice.id, channelId: 'p-low', position: 'SUCTION' },
        { deviceId: simulatedDevice.id, channelId: 'p-high', position: 'LIQUID' },
        { deviceId: simulatedDevice.id, channelId: 't-suction', position: 'SUCTION' },
        { deviceId: simulatedDevice.id, channelId: 't-liquid', position: 'LIQUID' },
        { deviceId: simulatedDevice.id, channelId: 't-return', position: 'RETURN_AIR' },
        { deviceId: simulatedDevice.id, channelId: 't-supply', position: 'SUPPLY_AIR' },
      ],
      now,
    );
  }

  it('computes nothing at all without a refrigerant, rather than assuming one', () => {
    const circuit = liveCircuit(channelsFrom(simulate('NORMAL', 600_000, now)), null);
    expect(circuit.superheat).toBeNull();
    expect(circuit.subcooling).toBeNull();
    expect(circuit.missing.join(' ')).toMatch(/refrigerant/i);
  });

  // The simulator builds its pressures from the same P/T table the panel reads
  // them back through, so a scenario's stated superheat is recoverable. That
  // makes these a round-trip test of the conversion, not just of the fixture.
  //
  // The band is ±2 °F rather than exact, and deliberately so: the simulator
  // adds a couple of psig of jitter to look like a real probe, and the P/T
  // table is piecewise-linear. Both are worth about a degree. A band this
  // tight still catches what matters — a wrong scale factor or the bubble
  // curve used where the dew curve belongs are both off by ten or more.
  const TOLERANCE_F = 2;
  for (const scenario of ['NORMAL', 'UNDERCHARGE', 'RESTRICTION'] as const) {
    it(`recovers the ${scenario} scenario's superheat and subcooling once settled`, () => {
      const spec = SCENARIOS[scenario];
      const circuit = liveCircuit(channelsFrom(simulate(scenario, 600_000, now)), 'R-410A');
      expect(Math.abs(circuit.superheat! - spec.superheatF)).toBeLessThan(TOLERANCE_F);
      expect(Math.abs(circuit.subcooling! - spec.subcoolingF)).toBeLessThan(TOLERANCE_F);
    });
  }

  it('separates undercharge from restriction on subcooling, which is the whole point', () => {
    const under = liveCircuit(channelsFrom(simulate('UNDERCHARGE', 600_000, now)), 'R-410A');
    const restricted = liveCircuit(channelsFrom(simulate('RESTRICTION', 600_000, now)), 'R-410A');

    // Both run high superheat — that is why they get confused.
    expect(under.superheat!).toBeGreaterThan(18);
    expect(restricted.superheat!).toBeGreaterThan(18);
    // Subcooling is what tells them apart, and it has to be unambiguous.
    expect(under.subcooling!).toBeLessThan(6);
    expect(restricted.subcooling!).toBeGreaterThan(15);
  });

  it('shows superheat settling rather than jumping to steady state', () => {
    const early = liveCircuit(channelsFrom(simulate('NORMAL', 2_000, now)), 'R-410A');
    const later = liveCircuit(channelsFrom(simulate('NORMAL', 600_000, now)), 'R-410A');
    expect(early.superheat!).toBeGreaterThan(later.superheat!);
  });

  it('asks for the probe that is missing rather than reporting a partial number', () => {
    const partial = simulate('NORMAL', 600_000, now).filter((r) => r.channelId !== 't-liquid');
    const circuit = liveCircuit(channelsFrom(partial), 'R-410A');
    expect(circuit.superheat).not.toBeNull();
    expect(circuit.subcooling).toBeNull();
    expect(circuit.missing.join(' ')).toMatch(/liquid line/i);
  });
});
