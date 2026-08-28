/**
 * Web Bluetooth transport.
 *
 * Works in Chrome and Edge on Android, Windows, macOS and ChromeOS. It does
 * NOT work in Safari, in Firefox, or inside an iOS WKWebView — Apple has not
 * shipped Web Bluetooth and shows no sign of doing so, so the iOS app reaches
 * the same probes through a native plugin behind this same interface. Nothing
 * above the transport layer changes between the two.
 *
 * Two browser rules shape the code:
 *
 *  - `requestDevice` must be called from a user gesture. It cannot be
 *    retried automatically or called on page load.
 *  - Only services listed in `optionalServices` can be read afterwards, so the
 *    filter list has to name everything any driver might want.
 */

import { decodeBattery, decodeEss, ESS_CHANNELS, BATTERY_LEVEL, BATTERY_SERVICE } from '@/lib/probes/drivers/environmentalSensing';
import { driverFor, pickerServices } from '@/lib/probes/registry';
import type {
  ProbeConnectionState,
  ProbeDevice,
  ProbeReading,
  ProbeTransport,
} from '@/lib/probes/types';

/* Minimal shape of the Web Bluetooth API. Typed here rather than pulled in as
   a dependency, and deliberately narrow: only what this file touches. */
interface BluetoothCharacteristic extends EventTarget {
  uuid: string;
  value?: DataView;
  startNotifications(): Promise<BluetoothCharacteristic>;
  readValue(): Promise<DataView>;
}
interface BluetoothService {
  getCharacteristic(uuid: string): Promise<BluetoothCharacteristic>;
  getCharacteristics(): Promise<BluetoothCharacteristic[]>;
}
interface BluetoothServer {
  connected: boolean;
  getPrimaryService(uuid: string): Promise<BluetoothService>;
  disconnect(): void;
}
interface BluetoothDeviceLike extends EventTarget {
  id: string;
  name?: string;
  gatt?: { connect(): Promise<BluetoothServer>; connected: boolean; disconnect(): void };
}
interface BluetoothLike {
  requestDevice(options: {
    filters?: Array<{ services?: string[]; namePrefix?: string }>;
    optionalServices?: string[];
    acceptAllDevices?: boolean;
  }): Promise<BluetoothDeviceLike>;
  getAvailability?(): Promise<boolean>;
}

function bluetooth(): BluetoothLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as unknown as { bluetooth?: BluetoothLike }).bluetooth ?? null;
}

export class WebBluetoothTransport implements ProbeTransport {
  readonly id = 'web-bluetooth';

  private readers = new Set<(reading: ProbeReading) => void>();
  private states = new Set<(deviceId: string, state: ProbeConnectionState) => void>();
  private connected = new Map<string, BluetoothDeviceLike>();

  available(): boolean {
    return bluetooth() !== null;
  }

  unavailableReason(): string | null {
    if (this.available()) return null;
    if (typeof navigator === 'undefined') return 'Bluetooth is not available here.';

    const ua = navigator.userAgent;
    // Every iOS browser is WebKit underneath, so "use Chrome instead" is wrong
    // advice on an iPhone and worth not giving.
    if (/iPhone|iPad|iPod/.test(ua)) {
      return 'iOS does not support Bluetooth from a web page, in any browser. Use the ThermoRivet app from the App Store to connect probes, or enter readings by hand.';
    }
    if (/Firefox/.test(ua)) {
      return 'Firefox does not support Web Bluetooth. Chrome or Edge will connect to probes.';
    }
    if (/Safari/.test(ua)) {
      return 'Safari does not support Web Bluetooth. Chrome or Edge will connect to probes.';
    }
    return 'This browser does not support Bluetooth. Chrome or Edge on Android, Windows or macOS will connect to probes.';
  }

  async connect(): Promise<ProbeDevice> {
    const ble = bluetooth();
    if (!ble) throw new Error(this.unavailableReason() ?? 'Bluetooth is not available.');

    const services = pickerServices();
    const device = await ble.requestDevice({
      filters: services.map((s) => ({ services: [s] })),
      optionalServices: [...services, BATTERY_SERVICE],
    });

    const name = device.name ?? null;
    const driver = driverFor(name, services);
    if (!driver) {
      throw new Error(
        `${name ?? 'That device'} is not a probe this app knows how to read. See the supported list under Probes.`,
      );
    }

    this.emitState(device.id, 'CONNECTING');
    const server = await device.gatt?.connect();
    if (!server) {
      this.emitState(device.id, 'ERROR');
      throw new Error(`Could not connect to ${name ?? 'the probe'}.`);
    }

    device.addEventListener('gattserverdisconnected', () => {
      this.connected.delete(device.id);
      this.emitState(device.id, 'DISCONNECTED');
    });

    const channels: ProbeDevice['channels'] = [];

    for (const spec of ESS_CHANNELS) {
      try {
        const service = await server.getPrimaryService(driver.serviceUuids[0]!);
        const characteristic = await service.getCharacteristic(spec.uuid);
        channels.push({ id: spec.uuid, quantity: spec.quantity, label: spec.label });

        characteristic.addEventListener('characteristicvaluechanged', (event) => {
          const target = event.target as BluetoothCharacteristic;
          if (!target.value) return;
          const decoded = decodeEss(target.uuid, target.value);
          if (!decoded) return;
          this.emitReading({
            deviceId: device.id,
            channelId: spec.uuid,
            quantity: decoded.quantity,
            value: decoded.value,
            at: Date.now(),
          });
        });

        await characteristic.startNotifications();
      } catch {
        // A probe that reports temperature but not pressure is normal. A
        // missing characteristic means this device has no such channel, which
        // is information, not a failure.
      }
    }

    if (channels.length === 0) {
      device.gatt?.disconnect();
      this.emitState(device.id, 'ERROR');
      throw new Error(
        `${name ?? 'That probe'} connected but reported no readable channels. It may use a vendor protocol this app cannot read yet.`,
      );
    }

    // Battery is optional and never fatal.
    void (async () => {
      try {
        const service = await server.getPrimaryService(BATTERY_SERVICE);
        const characteristic = await service.getCharacteristic(BATTERY_LEVEL);
        const value = await characteristic.readValue();
        const percent = decodeBattery(value);
        if (percent !== null && channels[0]) {
          this.emitReading({
            deviceId: device.id,
            channelId: channels[0].id,
            quantity: channels[0].quantity,
            value: Number.NaN,
            at: Date.now(),
            battery: percent,
          });
        }
      } catch {
        /* No battery service. Nothing to report. */
      }
    })();

    this.connected.set(device.id, device);
    this.emitState(device.id, 'CONNECTED');

    return {
      id: device.id,
      name: name ?? 'Probe',
      driverId: driver.id,
      vendor: driver.vendor,
      model: null,
      channels,
      simulated: false,
    };
  }

  async disconnect(deviceId: string): Promise<void> {
    const device = this.connected.get(deviceId);
    device?.gatt?.disconnect();
    this.connected.delete(deviceId);
    this.emitState(deviceId, 'DISCONNECTED');
  }

  subscribe(handler: (reading: ProbeReading) => void): () => void {
    this.readers.add(handler);
    return () => this.readers.delete(handler);
  }

  onStateChange(handler: (deviceId: string, state: ProbeConnectionState) => void): () => void {
    this.states.add(handler);
    return () => this.states.delete(handler);
  }

  private emitReading(reading: ProbeReading) {
    for (const r of this.readers) r(reading);
  }

  private emitState(deviceId: string, state: ProbeConnectionState) {
    for (const s of this.states) s(deviceId, state);
  }
}
