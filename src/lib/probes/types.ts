/**
 * Wireless probes.
 *
 * A technician working with a wireless manifold — Fieldpiece JobLink, Testo
 * Smart Probes, Yellow Jacket ManTooth, Navac, Accutools — already has the
 * numbers this app spends most of its questions asking for. Reading them
 * directly removes the transcription step, which is where readings get
 * transposed, and it means superheat and subcooling update live instead of
 * being computed once from a snapshot the technician typed from memory in the
 * van.
 *
 * WHAT THIS LAYER IS
 *
 * A vendor-neutral shape for "a device that reports readings over time", plus
 * the mapping from a probe channel onto the measurement keys the diagnostic
 * engine already understands. Nothing here knows about Bluetooth; transports
 * and per-vendor decoding live in `transport.ts` and `drivers/`.
 *
 * The separation is the point. Web Bluetooth does not exist in iOS Safari or
 * in a WKWebView, so the iOS build has to reach the same probes through a
 * native plugin. Both sit behind `ProbeTransport`, and everything above this
 * line is identical either way.
 *
 * PROVENANCE
 *
 * A probe reading is not a manual reading and is never recorded as one. It
 * carries the device it came from, the moment it was sampled, and — for a
 * simulated device — an unmistakable flag, because a number a technician might
 * act on has to say where it came from.
 */

/** What a channel measures. Determines units and which key it can feed. */
export type ProbeQuantity =
  | 'PRESSURE_PSIG'
  | 'TEMPERATURE_F'
  | 'RELATIVE_HUMIDITY'
  | 'VACUUM_MICRONS'
  | 'CURRENT_A'
  | 'VOLTAGE_V'
  | 'STATIC_PRESSURE_IWC'
  | 'AIRFLOW_FPM';

/**
 * Where on the system a channel is clamped.
 *
 * This is the part a technician has to get right and the part software cannot
 * infer: a pipe-clamp thermometer reads the same whether it is on the suction
 * line or the liquid line, and swapping them turns a healthy system into a
 * diagnosis. It is set by the technician, never guessed.
 */
export type ProbePosition =
  | 'SUCTION'
  | 'LIQUID'
  | 'DISCHARGE'
  | 'RETURN_AIR'
  | 'SUPPLY_AIR'
  | 'OUTDOOR_AIR'
  | 'VACUUM'
  | 'ELECTRICAL'
  | 'DUCT_STATIC'
  | 'UNASSIGNED';

export interface ProbeChannel {
  /** Stable within a device. */
  id: string;
  quantity: ProbeQuantity;
  /** As the vendor labels it, e.g. "P1", "T2", "Low side". */
  label: string;
}

export interface ProbeReading {
  deviceId: string;
  channelId: string;
  quantity: ProbeQuantity;
  value: number;
  /** Epoch milliseconds when the device sampled it, as best we can tell. */
  at: number;
  /**
   * Reported battery percentage, when the device sends one. A probe about to
   * die mid-charge-check is worth knowing about before the gauges are on.
   */
  battery?: number;
}

export type ProbeConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface ProbeDevice {
  id: string;
  name: string;
  /** The driver that produced it. */
  driverId: string;
  vendor: string;
  model: string | null;
  channels: ProbeChannel[];
  /**
   * True when the device is generated in software rather than measured.
   *
   * Everything downstream keys off this: simulated readings are labelled in
   * the UI, refused by the capture path, and never written to a session as if
   * they came off equipment.
   */
  simulated: boolean;
}

/** A device plus what the technician has told us it is clamped to. */
export interface ProbeAssignment {
  deviceId: string;
  channelId: string;
  position: ProbePosition;
}

export interface ProbeSnapshot {
  devices: ProbeDevice[];
  readings: ProbeReading[];
  assignments: ProbeAssignment[];
}

/**
 * A transport that can find devices and stream their readings.
 *
 * Implemented once over Web Bluetooth for Android and desktop Chrome, and
 * again over a native plugin for iOS. Neither one decodes anything: they hand
 * bytes to a driver.
 */
export interface ProbeTransport {
  readonly id: string;
  /** Whether this transport can run at all in the current shell. */
  available(): boolean;
  /** Why it is unavailable, in words a technician can act on. */
  unavailableReason(): string | null;
  /** Opens the platform's device picker and connects what the user chooses. */
  connect(): Promise<ProbeDevice>;
  disconnect(deviceId: string): Promise<void>;
  /** Fires for every decoded reading. Returns an unsubscribe function. */
  subscribe(handler: (reading: ProbeReading) => void): () => void;
  onStateChange(handler: (deviceId: string, state: ProbeConnectionState) => void): () => void;
}

/**
 * Turns a device's raw notifications into readings.
 *
 * One per protocol, not one per product: several vendors ship the same
 * Bluetooth SIG profile, and one driver serves all of them.
 */
export interface ProbeDriver {
  readonly id: string;
  readonly vendor: string;
  readonly label: string;
  /** Human-readable statement of what this driver is known to work with. */
  readonly supports: string;
  /** GATT service UUIDs to filter the device picker on. */
  readonly serviceUuids: string[];
  /** True when this driver recognises the advertised device. */
  matches(name: string | null, serviceUuids: string[]): boolean;
}

/** How far out of date a reading may be before it stops being shown as live. */
export const STALE_AFTER_MS = 12_000;

/** Older than this and it is not offered for capture at all. */
export const REFUSE_CAPTURE_AFTER_MS = 60_000;
