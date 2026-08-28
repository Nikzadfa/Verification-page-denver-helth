/**
 * Bluetooth SIG Environmental Sensing Service (0x181A).
 *
 * The one wireless-probe protocol that is actually published, so the one this
 * codebase can implement correctly rather than by guesswork. Any probe that
 * advertises 0x181A works with no vendor agreement.
 *
 * Characteristic formats are from the SIG's GATT Specification Supplement:
 *
 *   Temperature    0x2A6E   sint16, 0.01 °C per bit
 *   Humidity       0x2A6F   uint16, 0.01 % per bit
 *   Pressure       0x2A6D   uint32, 0.1 Pa per bit, ABSOLUTE
 *   Battery Level  0x2A19   uint8,  percent (service 0x180F)
 *
 * All little-endian.
 *
 * The pressure conversion carries a caveat worth stating where it happens: the
 * SIG characteristic is absolute pressure, and refrigeration gauges read
 * gauge pressure. Converting one to the other needs the local barometric
 * pressure, and at altitude the standard-atmosphere assumption is wrong by
 * roughly 1 psi per 2,000 ft — enough to shift a superheat calculation. The
 * decoder therefore reports what it assumed rather than hiding it.
 */

import type { ProbeDriver, ProbeQuantity } from '@/lib/probes/types';

export const ESS_SERVICE = '0000181a-0000-1000-8000-00805f9b34fb';
export const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';

export const ESS_TEMPERATURE = '00002a6e-0000-1000-8000-00805f9b34fb';
export const ESS_HUMIDITY = '00002a6f-0000-1000-8000-00805f9b34fb';
export const ESS_PRESSURE = '00002a6d-0000-1000-8000-00805f9b34fb';
export const BATTERY_LEVEL = '00002a19-0000-1000-8000-00805f9b34fb';

/** Standard sea-level atmospheric pressure, in psi. */
export const STANDARD_ATMOSPHERE_PSI = 14.6959;

export interface DecodedValue {
  quantity: ProbeQuantity;
  value: number;
  /** Set when the value rests on an assumption the technician should know. */
  caveat?: string;
}

/**
 * Decode one ESS characteristic value.
 *
 * Returns null for a characteristic this driver does not handle, and for a
 * buffer too short to hold the field — a truncated notification is a dropped
 * packet, not a reading of zero.
 */
export function decodeEss(characteristicUuid: string, data: DataView): DecodedValue | null {
  const uuid = characteristicUuid.toLowerCase();

  if (uuid === ESS_TEMPERATURE) {
    if (data.byteLength < 2) return null;
    const celsius = data.getInt16(0, true) / 100;
    return { quantity: 'TEMPERATURE_F', value: round1(celsius * 9 / 5 + 32) };
  }

  if (uuid === ESS_HUMIDITY) {
    if (data.byteLength < 2) return null;
    return { quantity: 'RELATIVE_HUMIDITY', value: round1(data.getUint16(0, true) / 100) };
  }

  if (uuid === ESS_PRESSURE) {
    if (data.byteLength < 4) return null;
    const pascals = data.getUint32(0, true) / 10;
    const absolutePsi = pascals / 6894.757;
    return {
      quantity: 'PRESSURE_PSIG',
      value: round1(absolutePsi - STANDARD_ATMOSPHERE_PSI),
      caveat:
        'The Bluetooth standard reports absolute pressure. Gauge pressure here assumes a sea-level atmosphere; at altitude, confirm against your manifold before acting on a marginal superheat.',
    };
  }

  return null;
}

export function decodeBattery(data: DataView): number | null {
  if (data.byteLength < 1) return null;
  const percent = data.getUint8(0);
  return percent >= 0 && percent <= 100 ? percent : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Which quantity a characteristic carries, for building the channel list. */
export const ESS_CHANNELS: Array<{ uuid: string; quantity: ProbeQuantity; label: string }> = [
  { uuid: ESS_TEMPERATURE, quantity: 'TEMPERATURE_F', label: 'Temperature' },
  { uuid: ESS_HUMIDITY, quantity: 'RELATIVE_HUMIDITY', label: 'Humidity' },
  { uuid: ESS_PRESSURE, quantity: 'PRESSURE_PSIG', label: 'Pressure' },
];

export const environmentalSensingDriver: ProbeDriver = {
  id: 'ble-environmental-sensing',
  vendor: 'Bluetooth SIG standard',
  label: 'Standard environmental sensing probe',
  supports:
    'Any probe advertising the Bluetooth SIG Environmental Sensing service (0x181A): temperature, humidity and pressure.',
  serviceUuids: [ESS_SERVICE],
  matches(_name, serviceUuids) {
    return serviceUuids.map((u) => u.toLowerCase()).includes(ESS_SERVICE);
  },
};
