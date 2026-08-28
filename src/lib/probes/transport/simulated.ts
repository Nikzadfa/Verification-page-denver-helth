/**
 * Simulated transport.
 *
 * Drives the software probe set on a timer so the panel behaves exactly as it
 * does with real hardware — same interface, same reading cadence, same
 * staleness rules. Selected explicitly by the technician; it never appears
 * from a Bluetooth scan.
 */

import { SIMULATED_DEVICE_ID, simulate, simulatedDevice, type SimulatedScenario } from '@/lib/probes/drivers/simulated';
import type {
  ProbeConnectionState,
  ProbeDevice,
  ProbeReading,
  ProbeTransport,
} from '@/lib/probes/types';

/** Real probes report roughly this often; matching it keeps the demo honest. */
const SAMPLE_INTERVAL_MS = 2_000;

export class SimulatedTransport implements ProbeTransport {
  readonly id = 'simulated';

  private readers = new Set<(reading: ProbeReading) => void>();
  private states = new Set<(deviceId: string, state: ProbeConnectionState) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private scenario: SimulatedScenario = 'UNDERCHARGE';

  available(): boolean {
    return true;
  }

  unavailableReason(): string | null {
    return null;
  }

  setScenario(scenario: SimulatedScenario): void {
    this.scenario = scenario;
    // Restart the settling transient so the change is visible rather than
    // appearing as an instant jump to a new steady state.
    this.startedAt = Date.now();
  }

  async connect(): Promise<ProbeDevice> {
    this.startedAt = Date.now();
    this.emitState(SIMULATED_DEVICE_ID, 'CONNECTED');

    const tick = () => {
      for (const reading of simulate(this.scenario, Date.now() - this.startedAt)) {
        for (const r of this.readers) r(reading);
      }
    };
    tick();
    this.timer = setInterval(tick, SAMPLE_INTERVAL_MS);

    return simulatedDevice;
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.emitState(SIMULATED_DEVICE_ID, 'DISCONNECTED');
  }

  subscribe(handler: (reading: ProbeReading) => void): () => void {
    this.readers.add(handler);
    return () => this.readers.delete(handler);
  }

  onStateChange(handler: (deviceId: string, state: ProbeConnectionState) => void): () => void {
    this.states.add(handler);
    return () => this.states.delete(handler);
  }

  private emitState(deviceId: string, state: ProbeConnectionState) {
    for (const s of this.states) s(deviceId, state);
  }
}
