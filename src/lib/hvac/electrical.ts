/**
 * Electrical analysis.
 *
 * Capacitors, motors, contactors, transformers and 24 V control circuits.
 * Same contract as the refrigeration module: produce findings with a
 * confidence, never a verdict.
 */

import type { CircuitFinding, Severity } from './refrigerationAnalysis';

export interface CapacitorInput {
  /** Printed rating on the can, µF. For a dual round, the side under test. */
  ratedUf: number;
  /** Measured capacitance with the capacitor discharged and disconnected. */
  measuredUf: number;
  /** Manufacturer tolerance, defaults to the usual ±6% on run capacitors. */
  tolerancePercent?: number;
  /** Visible bulge, vent, or oil residue. */
  physicalDamage?: boolean;
}

export interface CapacitorResult {
  ratedUf: number;
  measuredUf: number;
  deviationPercent: number;
  low: number;
  high: number;
  verdict: 'IN_TOLERANCE' | 'OUT_OF_TOLERANCE' | 'FAILED';
  severity: Severity;
  findings: CircuitFinding[];
  explanation: string;
}

export function analyzeCapacitor(input: CapacitorInput): CapacitorResult {
  const tol = input.tolerancePercent ?? 6;
  const low = round1(input.ratedUf * (1 - tol / 100));
  const high = round1(input.ratedUf * (1 + tol / 100));
  const deviation = round1(((input.measuredUf - input.ratedUf) / input.ratedUf) * 100);

  const failed = input.measuredUf < input.ratedUf * 0.5;
  const outOfTolerance = input.measuredUf < low || input.measuredUf > high;

  const findings: CircuitFinding[] = [];
  if (failed) {
    findings.push({
      key: 'capacitor_failed',
      label: 'Run capacitor failed',
      severity: 'ABNORMAL',
      detail: `Measured ${input.measuredUf} µF against a ${input.ratedUf} µF rating — under half of rated. A motor on this capacitor will draw locked-rotor amps and trip on its internal overload.`,
      confidence: 0.95,
    });
  } else if (outOfTolerance) {
    findings.push({
      key: 'capacitor_out_of_tolerance',
      label: 'Run capacitor out of tolerance',
      severity: 'ABNORMAL',
      detail: `Measured ${input.measuredUf} µF, ${deviation > 0 ? '+' : ''}${deviation}% from the ${input.ratedUf} µF rating (±${tol}% allowed, ${low}–${high} µF). A weak capacitor raises motor amp draw and running temperature.`,
      confidence: 0.9,
    });
  }
  if (input.physicalDamage) {
    findings.push({
      key: 'capacitor_physical_damage',
      label: 'Capacitor physically damaged',
      severity: 'ABNORMAL',
      detail:
        'A bulged, vented or leaking capacitor is a replacement regardless of what it measures. Note that a capacitor that vents repeatedly is a symptom — check for a shorted motor winding or sustained high head pressure before assuming the capacitor was simply defective.',
      confidence: 0.95,
    });
  }

  return {
    ratedUf: input.ratedUf,
    measuredUf: input.measuredUf,
    deviationPercent: deviation,
    low,
    high,
    verdict: failed ? 'FAILED' : outOfTolerance ? 'OUT_OF_TOLERANCE' : 'IN_TOLERANCE',
    severity: failed || outOfTolerance ? 'ABNORMAL' : 'NORMAL',
    findings,
    explanation:
      'Capacitance must be measured with the capacitor discharged and at least one lead disconnected. A capacitor holds a lethal charge after power is removed — discharge it through a resistor, not a screwdriver.',
  };
}

export interface MotorInput {
  /** Nameplate rated load amps (compressor RLA, or motor FLA). */
  ratedAmps: number;
  measuredAmps: number;
  /** Nameplate locked rotor amps, when printed. */
  lraAmps?: number | null;
  kind: 'COMPRESSOR' | 'CONDENSER_FAN' | 'BLOWER_PSC' | 'BLOWER_ECM' | 'INDUCER' | 'PUMP';
}

export function analyzeMotorAmps(input: MotorInput): {
  percentOfRated: number;
  severity: Severity;
  findings: CircuitFinding[];
  explanation: string;
} {
  const pct = round1((input.measuredAmps / input.ratedAmps) * 100);
  const findings: CircuitFinding[] = [];

  const nearLra =
    input.lraAmps != null && input.measuredAmps >= input.lraAmps * 0.85;

  if (nearLra) {
    findings.push({
      key: 'motor_locked_rotor',
      label: 'Motor drawing locked-rotor amps',
      severity: 'CRITICAL',
      detail: `${input.measuredAmps} A against an LRA of ${input.lraAmps} A. The rotor is not turning. Kill power now — a stalled motor overheats in seconds. Check the run capacitor, the start components, and whether the shaft turns freely before condemning the motor.`,
      confidence: 0.9,
    });
  } else if (pct > 115) {
    findings.push({
      key: 'motor_amps_high',
      label: 'Motor amp draw above rating',
      severity: 'ABNORMAL',
      detail: `${input.measuredAmps} A is ${pct}% of the ${input.ratedAmps} A rating. On a compressor, high amps usually mean high head pressure or a failing capacitor, not a bad compressor. Verify head pressure and capacitance before condemning it.`,
      confidence: 0.8,
    });
  } else if (pct < 40 && input.kind === 'COMPRESSOR') {
    findings.push({
      key: 'compressor_amps_low',
      label: 'Compressor amp draw well below rating',
      severity: 'ABNORMAL',
      detail: `${input.measuredAmps} A is only ${pct}% of RLA. A compressor that is running but not pumping draws low amps and produces low subcooling with a narrow condenser split. Confirm with a pressure differential test before condemning it — an undercharged system also runs low amps.`,
      confidence: 0.7,
    });
  }

  return {
    percentOfRated: pct,
    severity: findings.some((f) => f.severity === 'CRITICAL')
      ? 'CRITICAL'
      : findings.length
        ? 'ABNORMAL'
        : 'NORMAL',
    findings,
    explanation:
      input.kind === 'BLOWER_ECM'
        ? 'An ECM blower varies its own current to hold a commanded torque or airflow, so amp draw alone says very little. Compare commanded CFM against measured static pressure instead.'
        : 'Compare against the nameplate rating for this specific unit, not a generic figure.',
  };
}

export interface VoltageInput {
  /** Line-to-line supply voltage under load. */
  measuredVolts: number;
  /** Nameplate rated voltage: 208, 230, 240, 460, 115. */
  ratedVolts: number;
  /** For three-phase: all three line-to-line readings. */
  threePhase?: [number, number, number] | null;
}

export function analyzeVoltage(input: VoltageInput): {
  severity: Severity;
  deviationPercent: number;
  imbalancePercent: number | null;
  findings: CircuitFinding[];
} {
  const findings: CircuitFinding[] = [];
  const deviation = round1(((input.measuredVolts - input.ratedVolts) / input.ratedVolts) * 100);

  if (Math.abs(deviation) > 10) {
    findings.push({
      key: 'supply_voltage_out_of_range',
      label: 'Supply voltage outside ±10%',
      severity: 'ABNORMAL',
      detail: `${input.measuredVolts} V against a ${input.ratedVolts} V rating (${deviation > 0 ? '+' : ''}${deviation}%). Most equipment is rated for ±10%. Sustained low voltage raises amp draw and overheats windings; this is a supply problem, not an equipment problem.`,
      confidence: 0.85,
    });
  }

  let imbalance: number | null = null;
  if (input.threePhase) {
    const [a, b, c] = input.threePhase;
    const avg = (a + b + c) / 3;
    const maxDev = Math.max(Math.abs(a - avg), Math.abs(b - avg), Math.abs(c - avg));
    imbalance = round1((maxDev / avg) * 100);
    if (imbalance > 2) {
      findings.push({
        key: 'voltage_imbalance',
        label: 'Three-phase voltage imbalance',
        severity: imbalance > 3 ? 'CRITICAL' : 'ABNORMAL',
        detail: `${imbalance}% imbalance. NEMA limits continuous operation to 1% and most compressor manufacturers to 2%. A 2% voltage imbalance can produce a 15% or greater current imbalance and will cook a motor winding. Do not run the equipment until the supply is corrected.`,
        confidence: 0.9,
      });
    }
  }

  return {
    severity: findings.some((f) => f.severity === 'CRITICAL')
      ? 'CRITICAL'
      : findings.length
        ? 'ABNORMAL'
        : 'NORMAL',
    deviationPercent: deviation,
    imbalancePercent: imbalance,
    findings,
  };
}

/**
 * 24 V control circuit. The most common no-heat/no-cool cause after the
 * obvious ones, and the one most often misdiagnosed as a bad board.
 */
export function analyzeControlVoltage(volts: number, loaded: boolean): {
  severity: Severity;
  findings: CircuitFinding[];
  interpretation: string;
} {
  const findings: CircuitFinding[] = [];
  if (volts < 1) {
    findings.push({
      key: 'control_voltage_absent',
      label: 'No 24 V control voltage',
      severity: 'ABNORMAL',
      detail:
        'Nothing on the secondary. Work back: transformer primary voltage, the low-voltage fuse or breaker on the board, then the secondary itself. A blown low-voltage fuse is almost always a short in the field wiring — find the short before replacing the fuse, or the new one goes too.',
      confidence: 0.9,
    });
  } else if (volts < 20) {
    findings.push({
      key: 'control_voltage_low',
      label: 'Low control voltage',
      severity: 'ABNORMAL',
      detail: `${volts} V. Below about 20 V a contactor or gas valve may chatter or fail to pull in. ${
        loaded
          ? 'Because this was measured under load, an overloaded or failing transformer and a partially shorted coil both fit.'
          : 'Measured unloaded, this points at the transformer itself.'
      }`,
      confidence: 0.85,
    });
  } else if (volts > 30) {
    findings.push({
      key: 'control_voltage_high',
      label: 'High control voltage',
      severity: 'WATCH',
      detail: `${volts} V. Check that the transformer primary is landed on the correct tap for the supply voltage (a 208 V supply on a 240 V tap, or the reverse, shows up here).`,
      confidence: 0.7,
    });
  }
  return {
    severity: findings.length ? (findings[0]!.severity) : 'NORMAL',
    findings,
    interpretation:
      'Measure across the transformer secondary (R to C) with the call energized. A reading that is fine unloaded and collapses under load means the transformer cannot carry the circuit — that is a load problem or a shorted coil, not automatically a bad transformer.',
  };
}

/**
 * Resistance/continuity helper for windings and heaters.
 * Deliberately conservative: an ohm reading alone rarely condemns a component.
 */
export function analyzeWindingResistance(params: {
  commonToStart: number;
  commonToRun: number;
  startToRun: number;
  megohmToGround?: number | null;
}): { findings: CircuitFinding[]; sumCheckOk: boolean } {
  const findings: CircuitFinding[] = [];
  const sum = params.commonToStart + params.commonToRun;
  const sumCheckOk = Math.abs(sum - params.startToRun) <= Math.max(0.5, params.startToRun * 0.1);

  if (!sumCheckOk) {
    findings.push({
      key: 'winding_sum_mismatch',
      label: 'Winding resistances do not add up',
      severity: 'ABNORMAL',
      detail: `Common-to-start (${params.commonToStart} Ω) plus common-to-run (${params.commonToRun} Ω) should equal start-to-run (${params.startToRun} Ω). It does not, which indicates a shorted turn or a bad reading. Re-check with the leads off and the meter zeroed before drawing a conclusion.`,
      confidence: 0.6,
    });
  }
  if (params.commonToRun === 0 || params.commonToStart === 0) {
    findings.push({
      key: 'winding_shorted',
      label: 'Shorted winding',
      severity: 'ABNORMAL',
      detail: 'A zero-ohm winding is shorted. Confirm with a second meter before condemning.',
      confidence: 0.8,
    });
  }
  if (!Number.isFinite(params.commonToRun) || params.commonToRun > 1e6) {
    findings.push({
      key: 'winding_open',
      label: 'Open winding',
      severity: 'ABNORMAL',
      detail:
        'An open winding on a hermetic compressor may be a tripped internal overload rather than a failure. Let the compressor cool to ambient and re-check before condemning it — internal overloads can take several hours to reset.',
      confidence: 0.7,
    });
  }
  if (params.megohmToGround != null && params.megohmToGround < 1) {
    findings.push({
      key: 'winding_grounded',
      label: 'Winding grounded',
      severity: 'CRITICAL',
      detail: `${params.megohmToGround} MΩ to ground. Below 1 MΩ the motor is grounding. Confirm with a megohmmeter at the compressor terminals with all leads removed, and check for refrigerant/oil contamination before replacing.`,
      confidence: 0.85,
    });
  }
  return { findings, sumCheckOk };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
