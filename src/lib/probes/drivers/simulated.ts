/**
 * A simulated probe set.
 *
 * Exists for two reasons, both practical. It lets the whole wireless-gauge
 * path — pairing, assignment, live superheat, capture into a diagnosis — be
 * tested and demonstrated without a $600 probe kit on the bench. And it gives
 * a technician evaluating the app something to look at that behaves like a
 * real system instead of an empty panel.
 *
 * It is built out of the app's own P/T tables rather than from invented
 * numbers, so the pressures and line temperatures are mutually consistent: a
 * superheat computed from these readings is the superheat the scenario says it
 * is. That makes it a fixture worth testing against.
 *
 * Every device it produces is flagged `simulated`, and the capture path
 * refuses those readings. This must never become a way to put made-up numbers
 * into a customer's service report.
 */

import { pressureFromSatTemp } from '@/lib/hvac/refrigerants';
import type { ProbeDevice, ProbeDriver, ProbeReading } from '@/lib/probes/types';

export type SimulatedScenario =
  | 'NORMAL'
  | 'UNDERCHARGE'
  | 'RESTRICTION'
  | 'OVERCHARGE'
  | 'DIRTY_CONDENSER';

interface ScenarioSpec {
  label: string;
  /** What a technician would find, so the panel can say what it is showing. */
  description: string;
  evaporatorSatF: number;
  condenserSatF: number;
  superheatF: number;
  subcoolingF: number;
  returnDbF: number;
  supplyDbF: number;
  outdoorDbF: number;
}

export const SCENARIOS: Record<SimulatedScenario, ScenarioSpec> = {
  NORMAL: {
    label: 'Operating correctly',
    description: 'A healthy R-410A split system on a 92 °F day.',
    evaporatorSatF: 40,
    condenserSatF: 110,
    superheatF: 10,
    subcoolingF: 10,
    returnDbF: 76,
    supplyDbF: 56,
    outdoorDbF: 92,
  },
  UNDERCHARGE: {
    label: 'Low charge with a leak',
    description: 'High superheat with low subcooling — the classic undercharge signature.',
    evaporatorSatF: 28,
    condenserSatF: 99,
    superheatF: 23,
    subcoolingF: 3,
    returnDbF: 78,
    supplyDbF: 68,
    outdoorDbF: 92,
  },
  RESTRICTION: {
    label: 'Liquid-line restriction',
    description: 'High superheat with HIGH subcooling — a plugged drier, not a low charge.',
    evaporatorSatF: 28,
    condenserSatF: 118,
    superheatF: 21,
    subcoolingF: 19,
    returnDbF: 78,
    supplyDbF: 69,
    outdoorDbF: 92,
  },
  OVERCHARGE: {
    label: 'Overcharged',
    description: 'Low superheat with high subcooling and a high head.',
    evaporatorSatF: 48,
    condenserSatF: 126,
    superheatF: 3,
    subcoolingF: 18,
    returnDbF: 77,
    supplyDbF: 63,
    outdoorDbF: 92,
  },
  DIRTY_CONDENSER: {
    label: 'Dirty condenser coil',
    description: 'High head with a wide condenser split — heat is not leaving the coil.',
    evaporatorSatF: 47,
    condenserSatF: 132,
    superheatF: 9,
    subcoolingF: 11,
    returnDbF: 78,
    supplyDbF: 64,
    outdoorDbF: 92,
  },
};

export const SIMULATED_DEVICE_ID = 'sim-manifold';

/** Two pressure probes, two pipe clamps and an air pair — a typical kit. */
export const simulatedDevice: ProbeDevice = {
  id: SIMULATED_DEVICE_ID,
  name: 'Simulated probe set',
  driverId: 'simulated',
  vendor: 'ThermoRivet',
  model: 'Demo',
  simulated: true,
  channels: [
    { id: 'p-low', quantity: 'PRESSURE_PSIG', label: 'P1 low side' },
    { id: 'p-high', quantity: 'PRESSURE_PSIG', label: 'P2 high side' },
    { id: 't-suction', quantity: 'TEMPERATURE_F', label: 'T1 clamp' },
    { id: 't-liquid', quantity: 'TEMPERATURE_F', label: 'T2 clamp' },
    { id: 't-return', quantity: 'TEMPERATURE_F', label: 'T3 return air' },
    { id: 't-supply', quantity: 'TEMPERATURE_F', label: 'T4 supply air' },
  ],
};

/**
 * Readings for one sample.
 *
 * `elapsedMs` drives a startup transient: for the first ninety seconds the
 * system is still pulling down, so superheat runs high and settles. Watching
 * it settle is the thing a live gauge gives you that a typed snapshot cannot,
 * and a demo that jumps straight to steady state would not show it.
 */
export function simulate(
  scenario: SimulatedScenario,
  elapsedMs: number,
  now = Date.now(),
): ProbeReading[] {
  const spec = SCENARIOS[scenario];

  // Exponential settle, ~40 s time constant.
  const settle = 1 - Math.exp(-elapsedMs / 40_000);
  const startupSuperheat = spec.superheatF + 14 * (1 - settle);
  const evaporatorSat = spec.evaporatorSatF + 6 * (1 - settle);
  const condenserSat = spec.condenserSatF - 8 * (1 - settle);
  const supply = spec.supplyDbF + (spec.returnDbF - spec.supplyDbF) * (1 - settle);

  // Pressures come from the real P/T table, so what the panel computes back
  // out of them matches the scenario rather than drifting from it.
  const lowPsig = pressureFromSatTemp('R-410A', evaporatorSat, 'dew').value;
  const highPsig = pressureFromSatTemp('R-410A', condenserSat, 'bubble').value;

  const jitter = (amplitude: number, phase: number) =>
    amplitude * Math.sin(now / 3_000 + phase);

  const reading = (channelId: string, quantity: ProbeReading['quantity'], value: number): ProbeReading => ({
    deviceId: SIMULATED_DEVICE_ID,
    channelId,
    quantity,
    value: Math.round(value * 10) / 10,
    at: now,
    battery: 87,
  });

  return [
    reading('p-low', 'PRESSURE_PSIG', lowPsig + jitter(1.2, 0)),
    reading('p-high', 'PRESSURE_PSIG', highPsig + jitter(3, 1)),
    reading('t-suction', 'TEMPERATURE_F', evaporatorSat + startupSuperheat + jitter(0.4, 2)),
    reading('t-liquid', 'TEMPERATURE_F', condenserSat - spec.subcoolingF + jitter(0.4, 3)),
    reading('t-return', 'TEMPERATURE_F', spec.returnDbF + jitter(0.3, 4)),
    reading('t-supply', 'TEMPERATURE_F', supply + jitter(0.3, 5)),
  ];
}

export const simulatedDriver: ProbeDriver = {
  id: 'simulated',
  vendor: 'ThermoRivet',
  label: 'Simulated probe set',
  supports: 'A software-generated R-410A system. For trying the feature out — readings are never recorded.',
  serviceUuids: [],
  matches() {
    // Never matched from a Bluetooth advertisement; only chosen deliberately.
    return false;
  },
};
