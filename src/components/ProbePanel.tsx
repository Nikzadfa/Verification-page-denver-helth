'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, ErrorNote, Spinner } from '@/components/ui';
import {
  liveCircuit,
  liveChannels,
  positionsFor,
  selectForCapture,
  type LiveChannel,
} from '@/lib/probes/link';
import { VENDORS } from '@/lib/probes/registry';
import { SCENARIOS, type SimulatedScenario } from '@/lib/probes/drivers/simulated';
import { SimulatedTransport } from '@/lib/probes/transport/simulated';
import { WebBluetoothTransport } from '@/lib/probes/transport/webBluetooth';
import type {
  ProbeAssignment,
  ProbeDevice,
  ProbePosition,
  ProbeReading,
  ProbeTransport,
} from '@/lib/probes/types';

/**
 * Wireless gauges.
 *
 * The panel a technician has open while the gauges are on the system. It does
 * three things: shows what each probe is reading right now, computes superheat
 * and subcooling live from those readings, and hands them to the diagnosis in
 * one tap instead of six typed numbers.
 *
 * Live is the point. A single snapshot typed after the fact is a reading of
 * whatever the system happened to be doing; watching superheat settle is how
 * you know it has stabilised enough for the number to mean anything.
 */

const POSITION_LABELS: Record<ProbePosition, string> = {
  SUCTION: 'Suction line',
  LIQUID: 'Liquid line',
  DISCHARGE: 'Discharge line',
  RETURN_AIR: 'Return air',
  SUPPLY_AIR: 'Supply air',
  OUTDOOR_AIR: 'Outdoor air',
  VACUUM: 'Vacuum',
  ELECTRICAL: 'Electrical',
  DUCT_STATIC: 'Duct static',
  UNASSIGNED: 'Not assigned',
};

export interface ProbePanelProps {
  refrigerant: string | null;
  /** Sends the captured readings into the diagnosis. */
  onCapture: (
    readings: Array<{ key: string; value: number; unit: string | null; source: 'probe'; note: string }>,
  ) => Promise<void> | void;
  busy?: boolean;
}

export function ProbePanel({ refrigerant, onCapture, busy }: ProbePanelProps) {
  const [transport, setTransport] = useState<ProbeTransport | null>(null);
  const [devices, setDevices] = useState<ProbeDevice[]>([]);
  const [readings, setReadings] = useState<ProbeReading[]>([]);
  const [assignments, setAssignments] = useState<ProbeAssignment[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<SimulatedScenario>('UNDERCHARGE');
  const [showVendors, setShowVendors] = useState(false);
  const [captureNote, setCaptureNote] = useState<string | null>(null);

  // Re-render on a timer so "live / stale" ages even when no packet arrives —
  // a probe that silently stopped reporting must not keep looking current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 2_000);
    return () => clearInterval(t);
  }, []);

  const web = useRef<WebBluetoothTransport | null>(null);
  if (web.current === null && typeof window !== 'undefined') {
    web.current = new WebBluetoothTransport();
  }
  const sim = useRef<SimulatedTransport | null>(null);
  if (sim.current === null) sim.current = new SimulatedTransport();

  const attach = useCallback((t: ProbeTransport) => {
    setTransport(t);
    const off = t.subscribe((reading) => {
      // Battery-only frames carry NaN so they never become a reading.
      if (!Number.isFinite(reading.value)) return;
      setReadings((prev) => {
        // Bounded: one screen only ever renders the newest per channel.
        const next = [...prev, reading];
        return next.length > 400 ? next.slice(-200) : next;
      });
    });
    return off;
  }, []);

  const connectBluetooth = useCallback(async () => {
    const t = web.current;
    if (!t) return;
    const reason = t.unavailableReason();
    if (reason) {
      setError(reason);
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const device = await t.connect();
      attach(t);
      setDevices((prev) => [...prev.filter((d) => d.id !== device.id), device]);
    } catch (e) {
      // A dismissed picker throws too, and is not worth an error banner.
      const message = e instanceof Error ? e.message : 'Could not connect.';
      if (!/cancell?ed|User cancelled/i.test(message)) setError(message);
    } finally {
      setConnecting(false);
    }
  }, [attach]);

  const connectSimulated = useCallback(async () => {
    const t = sim.current;
    if (!t) return;
    setError(null);
    t.setScenario(scenario);
    const device = await t.connect();
    attach(t);
    setDevices((prev) => [...prev.filter((d) => d.id !== device.id), device]);
    // A simulated set is only useful pre-assigned; a technician evaluating the
    // feature should not have to guess the mapping to see it work.
    setAssignments([
      { deviceId: device.id, channelId: 'p-low', position: 'SUCTION' },
      { deviceId: device.id, channelId: 'p-high', position: 'LIQUID' },
      { deviceId: device.id, channelId: 't-suction', position: 'SUCTION' },
      { deviceId: device.id, channelId: 't-liquid', position: 'LIQUID' },
      { deviceId: device.id, channelId: 't-return', position: 'RETURN_AIR' },
      { deviceId: device.id, channelId: 't-supply', position: 'SUPPLY_AIR' },
    ]);
  }, [attach, scenario]);

  const disconnectAll = useCallback(async () => {
    for (const device of devices) {
      await transport?.disconnect(device.id).catch(() => undefined);
    }
    setDevices([]);
    setReadings([]);
    setAssignments([]);
    setTransport(null);
  }, [devices, transport]);

  const assign = useCallback((deviceId: string, channelId: string, position: ProbePosition) => {
    setAssignments((prev) => [
      ...prev.filter((a) => !(a.deviceId === deviceId && a.channelId === channelId)),
      ...(position === 'UNASSIGNED' ? [] : [{ deviceId, channelId, position }]),
    ]);
  }, []);

  const channels = useMemo(
    () => liveChannels(devices, readings, assignments),
    [devices, readings, assignments],
  );
  const circuit = useMemo(() => liveCircuit(channels, refrigerant), [channels, refrigerant]);
  const capture = useMemo(() => selectForCapture(channels), [channels]);

  const simulated = devices.some((d) => d.simulated);
  const bluetoothReason = web.current?.unavailableReason() ?? null;

  async function send() {
    setCaptureNote(null);
    if (capture.readings.length === 0) return;
    await onCapture(capture.readings);
    setCaptureNote(`Sent ${capture.readings.length} reading${capture.readings.length === 1 ? '' : 's'} to the diagnosis.`);
  }

  return (
    <div className="space-y-4">
      <ErrorNote>{error}</ErrorNote>

      {devices.length === 0 ? (
        <Card className="space-y-3">
          <h2 className="text-sm font-bold">Connect your gauges</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Pair a wireless probe and its readings go straight into the diagnosis — no typing, and
            superheat and subcooling update while you watch.
          </p>

          <button
            type="button"
            className="tr-btn tr-btn-primary w-full"
            onClick={connectBluetooth}
            disabled={connecting || bluetoothReason !== null}
          >
            {connecting ? <Spinner label="Looking for probes" /> : 'Connect a probe'}
          </button>

          {bluetoothReason && (
            <p className="text-xs" style={{ color: 'var(--color-warn-400)' }}>
              {bluetoothReason}
            </p>
          )}

          <div className="border-t pt-3">
            <label className="tr-label" htmlFor="sim-scenario">
              No probes to hand? Try it against a simulated system
            </label>
            <select
              id="sim-scenario"
              className="tr-input"
              value={scenario}
              onChange={(e) => setScenario(e.target.value as SimulatedScenario)}
            >
              {(Object.keys(SCENARIOS) as SimulatedScenario[]).map((key) => (
                <option key={key} value={key}>
                  {SCENARIOS[key].label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
              {SCENARIOS[scenario].description}
            </p>
            <button type="button" className="tr-btn tr-btn-secondary mt-2 w-full" onClick={connectSimulated}>
              Start simulated probes
            </button>
          </div>

          <button
            type="button"
            className="tr-btn tr-btn-ghost w-full text-sm"
            onClick={() => setShowVendors((v) => !v)}
            aria-expanded={showVendors}
          >
            {showVendors ? 'Hide' : 'Which probes work?'}
          </button>

          {showVendors && (
            <ul className="space-y-2 border-t pt-3">
              {VENDORS.map((v) => (
                <li key={v.vendor}>
                  <div className="flex items-start gap-2">
                    <span
                      className={`tr-chip shrink-0 ${
                        v.state === 'SUPPORTED' ? 'sev-NORMAL' : 'sev-WATCH'
                      }`}
                    >
                      {v.state === 'SUPPORTED' ? 'Works' : 'Not yet'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{v.vendor}</p>
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                        {v.products}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {v.note}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <>
          {simulated && (
            <div
              className="rounded-lg px-3 py-2 text-sm font-semibold"
              role="status"
              style={{
                border: '1px solid var(--color-warn-500)',
                background: 'color-mix(in srgb, var(--color-warn-500) 14%, transparent)',
                color: 'var(--color-warn-400)',
              }}
            >
              Simulated probes — {SCENARIOS[scenario].label.toLowerCase()}. These readings are
              generated, and will not be recorded on the job.
            </div>
          )}

          <Card className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-bold">Live circuit</h2>
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {refrigerant ?? 'refrigerant not set'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Derived label="Superheat" value={circuit.superheat} unit="°F" sat={circuit.suctionSat} />
              <Derived label="Subcooling" value={circuit.subcooling} unit="°F" sat={circuit.liquidSat} />
            </div>

            {circuit.missing.length > 0 && (
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                Still needs {circuit.missing.join(', ')}.
              </p>
            )}
            {circuit.mustVerify && (
              <p className="text-xs" style={{ color: 'var(--color-warn-400)' }}>
                Saturation temperatures come from approximate P/T data. Confirm against the
                refrigerant manufacturer&rsquo;s chart before acting on a marginal reading.
              </p>
            )}
          </Card>

          <section aria-label="Probe readings" className="space-y-2">
            {channels.map((c) => (
              <ChannelRow
                key={`${c.deviceId}:${c.channelId}`}
                channel={c}
                onAssign={(position) => assign(c.deviceId, c.channelId, position)}
              />
            ))}
          </section>

          {capture.skipped.length > 0 && (
            <Card>
              <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                Not being sent
              </p>
              <ul className="mt-1 space-y-1">
                {capture.skipped.map((s) => (
                  <li key={s.channelLabel} className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    <span className="font-semibold">{s.channelLabel}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {captureNote && (
            <p className="text-sm" role="status" style={{ color: 'var(--color-good-400)' }}>
              {captureNote}
            </p>
          )}

          <button
            type="button"
            className="tr-btn tr-btn-primary w-full"
            onClick={send}
            disabled={busy || capture.readings.length === 0}
          >
            {busy ? (
              <Spinner label="Sending" />
            ) : capture.readings.length === 0 ? (
              // Saying why beats a vague "nothing to send": with a simulated
              // set the button is permanently disabled by design, and a
              // technician trying the feature out deserves to know that is the
              // rule rather than a bug they are failing to work around.
              simulated
                ? 'Simulated readings are never recorded'
                : 'Assign a probe to send its reading'
            ) : (
              `Send ${capture.readings.length} reading${capture.readings.length === 1 ? '' : 's'} to the diagnosis`
            )}
          </button>

          <button type="button" className="tr-btn tr-btn-ghost w-full text-sm" onClick={disconnectAll}>
            Disconnect
          </button>
        </>
      )}
    </div>
  );
}

function Derived({
  label,
  value,
  unit,
  sat,
}: {
  label: string;
  value: number | null;
  unit: string;
  sat: number | null;
}) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--bg-inset)' }}>
      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
        {label}
      </p>
      <p className="font-mono text-2xl font-bold tabular-nums">
        {value === null ? '—' : `${value.toFixed(1)}`}
        {value !== null && <span className="ml-1 text-sm font-normal">{unit}</span>}
      </p>
      {sat !== null && (
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          sat {sat.toFixed(1)} °F
        </p>
      )}
    </div>
  );
}

function ChannelRow({
  channel,
  onAssign,
}: {
  channel: LiveChannel;
  onAssign: (position: ProbePosition) => void;
}) {
  const options = positionsFor(channel.quantity);
  const tone =
    channel.freshness === 'LIVE'
      ? 'var(--color-good-400)'
      : channel.freshness === 'STALE'
        ? 'var(--color-warn-400)'
        : 'var(--color-alert-400)';

  return (
    <div className="tr-card p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{channel.channelLabel}</p>
          <p className="truncate text-xs" style={{ color: 'var(--text-dim)' }}>
            {channel.deviceName}
            {channel.battery !== undefined ? ` · battery ${channel.battery}%` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-xl font-bold tabular-nums">
            {channel.value.toFixed(1)}
            <span className="ml-1 text-xs font-normal" style={{ color: 'var(--text-dim)' }}>
              {channel.unit}
            </span>
          </p>
          {/* Freshness is a word as well as a colour. */}
          <p className="text-xs font-semibold" style={{ color: tone }}>
            {channel.freshness === 'LIVE' ? 'Live' : channel.freshness === 'STALE' ? 'Not fresh' : 'Lost'}
          </p>
        </div>
      </div>

      <label className="tr-label mt-2" htmlFor={`pos-${channel.deviceId}-${channel.channelId}`}>
        Clamped on
      </label>
      <select
        id={`pos-${channel.deviceId}-${channel.channelId}`}
        className="tr-input"
        value={channel.position}
        onChange={(e) => onAssign(e.target.value as ProbePosition)}
      >
        <option value="UNASSIGNED">{POSITION_LABELS.UNASSIGNED}</option>
        {options.map((p) => (
          <option key={p} value={p}>
            {POSITION_LABELS[p]}
          </option>
        ))}
      </select>
      {channel.measurementLabel ? (
        <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
          Feeds {channel.measurementLabel}
        </p>
      ) : (
        // Said on the row itself, not only in the skipped list. With a
        // simulated set every channel is refused for being simulated, so the
        // assignment guidance would otherwise never be visible while trying
        // the feature out — which is exactly when it is being learned.
        <p className="mt-1 text-xs" style={{ color: 'var(--color-warn-400)' }}>
          Say where this one is clamped and it will feed the diagnosis.
        </p>
      )}
    </div>
  );
}
