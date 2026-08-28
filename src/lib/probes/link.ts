/**
 * From probe channels to engine measurements.
 *
 * Pure. No Bluetooth, no React, no database — which is what makes the mapping
 * rules testable, and they need to be: a pipe clamp on the wrong line produces
 * a confident diagnosis of the wrong fault, and that is the failure this file
 * exists to make impossible to reach by accident.
 *
 * Three rules are enforced here rather than trusted to the UI:
 *
 *  1. A channel feeds a measurement only once the technician has said where it
 *     is clamped. `UNASSIGNED` maps to nothing.
 *  2. A stale reading is never captured. A probe that dropped off Bluetooth
 *     five minutes ago is still showing its last value; writing that into a
 *     diagnosis as current is worse than having no probe at all.
 *  3. A simulated reading is never captured into a real session, whatever the
 *     caller asks for.
 */

import { satTempFromPressure, normalizeRefrigerantId } from '@/lib/hvac/refrigerants';
import type { RefrigerantId } from '@/lib/hvac/refrigerants';
import { MEASUREMENT_MAP } from '@/lib/engine/measurements';
import {
  REFUSE_CAPTURE_AFTER_MS,
  STALE_AFTER_MS,
  type ProbeAssignment,
  type ProbeDevice,
  type ProbePosition,
  type ProbeQuantity,
  type ProbeReading,
} from '@/lib/probes/types';

/**
 * Which measurement key a channel feeds, given where it is clamped.
 *
 * A quantity alone is never enough. A pipe-clamp thermometer reads identically
 * on the suction line and the liquid line; only the position tells them apart,
 * and only the technician can supply it.
 */
const CHANNEL_KEYS: Partial<Record<ProbeQuantity, Partial<Record<ProbePosition, string>>>> = {
  PRESSURE_PSIG: {
    SUCTION: 'suction_pressure',
    LIQUID: 'liquid_pressure',
  },
  TEMPERATURE_F: {
    SUCTION: 'suction_line_temp',
    LIQUID: 'liquid_line_temp',
    DISCHARGE: 'discharge_temp',
    RETURN_AIR: 'return_db',
    SUPPLY_AIR: 'supply_db',
    OUTDOOR_AIR: 'outdoor_db',
  },
  RELATIVE_HUMIDITY: {
    RETURN_AIR: 'return_rh',
  },
  CURRENT_A: {
    ELECTRICAL: 'compressor_amps',
  },
  VOLTAGE_V: {
    ELECTRICAL: 'supply_voltage',
  },
  STATIC_PRESSURE_IWC: {
    DUCT_STATIC: 'total_static',
  },
  // A micron gauge has no home in the diagnostic model: evacuation is a
  // procedure the app documents, not evidence it reasons from. The reading is
  // shown live and is deliberately not capturable, rather than being forced
  // into a key that means something else.
};

/** Positions a channel of this quantity can sensibly be assigned to. */
export function positionsFor(quantity: ProbeQuantity): ProbePosition[] {
  const map = CHANNEL_KEYS[quantity];
  if (!map) return [];
  return Object.keys(map) as ProbePosition[];
}

export function measurementKeyFor(
  quantity: ProbeQuantity,
  position: ProbePosition,
): string | null {
  return CHANNEL_KEYS[quantity]?.[position] ?? null;
}

export type ReadingFreshness = 'LIVE' | 'STALE' | 'EXPIRED';

export function freshness(reading: ProbeReading, now = Date.now()): ReadingFreshness {
  const age = now - reading.at;
  if (age > REFUSE_CAPTURE_AFTER_MS) return 'EXPIRED';
  if (age > STALE_AFTER_MS) return 'STALE';
  return 'LIVE';
}

export interface LiveChannel {
  deviceId: string;
  channelId: string;
  deviceName: string;
  channelLabel: string;
  quantity: ProbeQuantity;
  position: ProbePosition;
  /** Null until the technician assigns the channel to a position. */
  measurementKey: string | null;
  measurementLabel: string | null;
  value: number;
  unit: string | null;
  at: number;
  freshness: ReadingFreshness;
  simulated: boolean;
  battery: number | undefined;
}

const UNITS: Record<ProbeQuantity, string> = {
  PRESSURE_PSIG: 'psig',
  TEMPERATURE_F: '°F',
  RELATIVE_HUMIDITY: '%',
  VACUUM_MICRONS: 'microns',
  CURRENT_A: 'A',
  VOLTAGE_V: 'V',
  STATIC_PRESSURE_IWC: 'in. w.c.',
  AIRFLOW_FPM: 'fpm',
};

export function unitFor(quantity: ProbeQuantity): string {
  return UNITS[quantity];
}

/**
 * The current value of every channel, newest reading per channel.
 *
 * Readings arrive continuously; this is what the panel renders.
 */
export function liveChannels(
  devices: ProbeDevice[],
  readings: ProbeReading[],
  assignments: ProbeAssignment[],
  now = Date.now(),
): LiveChannel[] {
  const latest = new Map<string, ProbeReading>();
  for (const r of readings) {
    const key = `${r.deviceId}:${r.channelId}`;
    const held = latest.get(key);
    if (!held || r.at >= held.at) latest.set(key, r);
  }

  const positionOf = new Map<string, ProbePosition>(
    assignments.map((a) => [`${a.deviceId}:${a.channelId}`, a.position]),
  );

  const out: LiveChannel[] = [];
  for (const device of devices) {
    for (const channel of device.channels) {
      const key = `${device.id}:${channel.id}`;
      const reading = latest.get(key);
      if (!reading) continue;
      const position = positionOf.get(key) ?? 'UNASSIGNED';
      const measurementKey = measurementKeyFor(channel.quantity, position);
      out.push({
        deviceId: device.id,
        channelId: channel.id,
        deviceName: device.name,
        channelLabel: channel.label,
        quantity: channel.quantity,
        position,
        measurementKey,
        measurementLabel: measurementKey ? (MEASUREMENT_MAP[measurementKey]?.label ?? null) : null,
        value: reading.value,
        unit: UNITS[channel.quantity],
        at: reading.at,
        freshness: freshness(reading, now),
        simulated: device.simulated,
        battery: reading.battery,
      });
    }
  }
  return out;
}

export interface CaptureReading {
  key: string;
  value: number;
  unit: string | null;
  source: 'probe';
  /** Which device it came from, kept with the reading for the service report. */
  note: string;
}

export interface CaptureResult {
  readings: CaptureReading[];
  /** Channels deliberately left out, and why — always shown, never silent. */
  skipped: Array<{ channelLabel: string; reason: string }>;
}

/**
 * Choose which live channels are safe to write into the diagnosis.
 *
 * Everything excluded is reported. A capture that silently drops the liquid
 * line because its probe went stale would hand the engine a half-populated
 * circuit and let it conclude from it.
 */
export function selectForCapture(
  channels: LiveChannel[],
  options: { allowSimulated?: boolean } = {},
): CaptureResult {
  const readings: CaptureReading[] = [];
  const skipped: CaptureResult['skipped'] = [];
  const claimed = new Set<string>();

  for (const c of channels) {
    const where = `${c.deviceName} ${c.channelLabel}`;

    if (c.simulated && !options.allowSimulated) {
      skipped.push({ channelLabel: where, reason: 'Simulated probe — not recorded as a measurement.' });
      continue;
    }
    if (!c.measurementKey) {
      skipped.push({
        channelLabel: where,
        reason:
          c.position === 'UNASSIGNED'
            ? 'Not assigned yet — say where this probe is clamped.'
            : 'Nothing in the diagnosis uses this reading.',
      });
      continue;
    }
    if (c.freshness === 'EXPIRED') {
      skipped.push({ channelLabel: where, reason: 'Last reading is over a minute old — reconnect the probe.' });
      continue;
    }
    if (!Number.isFinite(c.value)) {
      skipped.push({ channelLabel: where, reason: 'No usable value.' });
      continue;
    }
    if (claimed.has(c.measurementKey)) {
      skipped.push({
        channelLabel: where,
        reason: `Another probe is already assigned to ${c.measurementLabel ?? c.measurementKey}.`,
      });
      continue;
    }

    claimed.add(c.measurementKey);
    readings.push({
      key: c.measurementKey,
      value: Math.round(c.value * 10) / 10,
      unit: c.unit,
      source: 'probe',
      note: `${where}${c.freshness === 'STALE' ? ' (reading was not fresh)' : ''}`,
    });
  }

  return { readings, skipped };
}

export interface LiveCircuit {
  superheat: number | null;
  subcooling: number | null;
  suctionSat: number | null;
  liquidSat: number | null;
  /** True when the P/T conversion is from approximate data. */
  mustVerify: boolean;
  /** What is still missing, phrased as the probe still to be clamped on. */
  missing: string[];
}

/**
 * Superheat and subcooling from whatever is currently clamped on.
 *
 * Computed live rather than at capture time, because watching superheat settle
 * is how a technician knows the system has stabilised — a single snapshot
 * taken two minutes after startup is a reading of the transient, not the
 * system.
 *
 * Returns nulls rather than guesses. Without a refrigerant there is no P/T
 * curve, and inventing one would be a fabricated number a technician acts on.
 */
export function liveCircuit(
  channels: LiveChannel[],
  refrigerant: string | null | undefined,
): LiveCircuit {
  const missing: string[] = [];
  const id: RefrigerantId | null = normalizeRefrigerantId(refrigerant ?? null);

  const valueFor = (key: string): number | null => {
    const c = channels.find((x) => x.measurementKey === key && x.freshness !== 'EXPIRED');
    return c ? c.value : null;
  };

  if (!id) missing.push('the refrigerant this system runs');

  const suctionP = valueFor('suction_pressure');
  const suctionT = valueFor('suction_line_temp');
  const liquidP = valueFor('liquid_pressure');
  const liquidT = valueFor('liquid_line_temp');

  let superheat: number | null = null;
  let subcooling: number | null = null;
  let suctionSat: number | null = null;
  let liquidSat: number | null = null;
  let mustVerify = false;

  if (id && suctionP !== null) {
    // Dew point on the low side: that is what superheat is referenced to, and
    // on a zeotropic blend the bubble point is off by the full glide.
    const sat = satTempFromPressure(id, suctionP, 'dew');
    suctionSat = sat.value;
    mustVerify = mustVerify || sat.mustVerify;
    if (suctionT !== null) superheat = Math.round((suctionT - sat.value) * 10) / 10;
    else missing.push('a clamp on the suction line');
  } else if (id) {
    missing.push('a pressure probe on the low side');
  }

  if (id && liquidP !== null) {
    const sat = satTempFromPressure(id, liquidP, 'bubble');
    liquidSat = sat.value;
    mustVerify = mustVerify || sat.mustVerify;
    if (liquidT !== null) subcooling = Math.round((sat.value - liquidT) * 10) / 10;
    else missing.push('a clamp on the liquid line');
  } else if (id) {
    missing.push('a pressure probe on the high side');
  }

  return { superheat, subcooling, suctionSat, liquidSat, mustVerify, missing };
}
