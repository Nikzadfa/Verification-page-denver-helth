/**
 * Which wireless gauges this app can actually talk to.
 *
 * Written as a support matrix rather than a list of logos, because the honest
 * answer differs per vendor and a technician deciding whether to buy a probe
 * set deserves the real one.
 *
 * THE SITUATION, PLAINLY
 *
 * Fieldpiece JobLink, Testo Smart Probes, Yellow Jacket ManTooth and Accutools
 * all speak Bluetooth Low Energy, and none of them publish their protocol.
 * Each uses a vendor-specific GATT service whose characteristic layout is not
 * documented anywhere public. There is no SDK to license against and no
 * specification to implement from, so a driver for any of them requires either
 * the vendor's cooperation or the protocol worked out against real hardware.
 * This codebase has neither, and a driver written from guesswork would decode
 * garbage into numbers a technician then acts on — which is worse than saying
 * the probe is unsupported.
 *
 * What IS implemented is everything around that gap: the transport, the
 * reading pipeline, the assignment rules, live superheat and subcooling, and
 * capture into the diagnosis. Adding a vendor is one file implementing
 * `ProbeDriver` — see `drivers/environmentalSensing.ts` for the shape.
 *
 * The Bluetooth SIG Environmental Sensing profile IS documented, and the
 * driver for it is real: any probe that advertises service 0x181A works today
 * without further work.
 */

import type { ProbeDriver } from '@/lib/probes/types';
import { environmentalSensingDriver } from '@/lib/probes/drivers/environmentalSensing';
import { simulatedDriver } from '@/lib/probes/drivers/simulated';

export type VendorState =
  /** A driver exists and decodes this device's readings. */
  | 'SUPPORTED'
  /** Speaks BLE, protocol undocumented. Needs the vendor or the hardware. */
  | 'NEEDS_PROTOCOL'
  /** No wireless output at all — the readings have to be typed. */
  | 'NO_WIRELESS';

export interface VendorEntry {
  vendor: string;
  products: string;
  state: VendorState;
  note: string;
}

/**
 * The support matrix, shown in the app so nobody discovers the gap by pairing
 * a probe and watching nothing happen.
 */
export const VENDORS: VendorEntry[] = [
  {
    vendor: 'Any probe using the Bluetooth standard profile',
    products: 'Environmental Sensing service (0x181A)',
    state: 'SUPPORTED',
    note: 'Temperature, humidity and pressure decode from the published Bluetooth SIG layout. No vendor agreement needed.',
  },
  {
    vendor: 'Fieldpiece',
    products: 'JobLink probes — JL3KH2, JL3PR2, JL3RH, SM480V manifold',
    state: 'NEEDS_PROTOCOL',
    note: 'JobLink uses a vendor-specific BLE service that Fieldpiece does not publish, and offers no public SDK. A driver needs either their developer programme or the protocol established against real probes.',
  },
  {
    vendor: 'Testo',
    products: 'Smart Probes 549i, 605i, 115i, 405i',
    state: 'NEEDS_PROTOCOL',
    note: 'Same position as Fieldpiece. Testo publishes an app but not the BLE characteristic layout.',
  },
  {
    vendor: 'Yellow Jacket',
    products: 'ManTooth P51-870, P51-TITAN',
    state: 'NEEDS_PROTOCOL',
    note: 'Vendor-specific service. Some ManTooth models also expose a serial profile, which would be the shorter route if you have one to test against.',
  },
  {
    vendor: 'Accutools / Navac / Elitech',
    products: 'BluVac, NMG series, wireless probes',
    state: 'NEEDS_PROTOCOL',
    note: 'Not investigated. Any of them advertising 0x181A would work today with no new code.',
  },
];

export const DRIVERS: ProbeDriver[] = [environmentalSensingDriver, simulatedDriver];

export function driverFor(name: string | null, serviceUuids: string[]): ProbeDriver | null {
  return DRIVERS.find((d) => d.matches(name, serviceUuids)) ?? null;
}

/** Every GATT service the device picker should offer to filter on. */
export function pickerServices(): string[] {
  return [...new Set(DRIVERS.flatMap((d) => d.serviceUuids))];
}
