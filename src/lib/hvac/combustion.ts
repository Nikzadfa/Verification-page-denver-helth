/**
 * Gas heating analysis: temperature rise, input clocking, and the ignition
 * sequence of operations.
 *
 * Combustion work carries carbon monoxide and gas-leak risk, so every result
 * from this module carries hazard ids that the UI must render before the
 * instruction, not after it.
 */

import type { CircuitFinding, Severity } from './refrigerationAnalysis';

export interface TemperatureRiseInput {
  supplyDbF: number;
  returnDbF: number;
  /** Range printed on the furnace rating plate, e.g. "30-60". */
  ratedRiseMinF?: number | null;
  ratedRiseMaxF?: number | null;
}

export function analyzeTemperatureRise(input: TemperatureRiseInput): {
  riseF: number;
  severity: Severity;
  findings: CircuitFinding[];
  hazardIds: string[];
  explanation: string;
} {
  const rise = round1(input.supplyDbF - input.returnDbF);
  const min = input.ratedRiseMinF ?? 30;
  const max = input.ratedRiseMaxF ?? 60;
  const findings: CircuitFinding[] = [];

  if (rise > max) {
    findings.push({
      key: 'temp_rise_high',
      label: 'Temperature rise above the rating plate',
      severity: rise > max + 15 ? 'CRITICAL' : 'ABNORMAL',
      detail: `${rise} °F against a rated ${min}–${max} °F. Not enough air is moving across the heat exchanger. Sustained operation above the rated rise overheats the exchanger, trips the limit, and cracks the exchanger over time. Find the airflow restriction — do not simply raise the blower speed and walk away without checking static pressure, and do not raise it above what the blower table allows.`,
      confidence: 0.9,
    });
  } else if (rise < min) {
    findings.push({
      key: 'temp_rise_low',
      label: 'Temperature rise below the rating plate',
      severity: 'ABNORMAL',
      detail: `${rise} °F against a rated ${min}–${max} °F. Too much air, or the burner is not producing rated input. Low rise on a condensing furnace can also mean the unit is running a reduced-capacity stage — confirm which stage it is in before adjusting anything.`,
      confidence: 0.85,
    });
  }

  return {
    riseF: rise,
    severity: findings.length ? findings[0]!.severity : 'NORMAL',
    findings,
    hazardIds: ['co-exposure', 'hot-surfaces'],
    explanation:
      'Measure the supply temperature out of the line of sight of the heat exchanger so radiant heat does not bias the probe, and let the furnace run at least 10 minutes at steady state first. Compare against the rise range on this furnace\'s rating plate, not a generic range.',
  };
}

/**
 * Clock the gas meter to get actual input. The only field method that proves
 * a furnace is firing at its rated input.
 */
export function clockGasMeter(params: {
  /** Dial size in cubic feet — usually 1/2, 1, or 2. */
  dialSizeCuFt: number;
  /** Seconds for one full revolution with only this appliance firing. */
  secondsPerRevolution: number;
  /** Local heating value; 1,000 BTU/ft³ is the usual default for natural gas. */
  heatingValueBtuPerCuFt?: number;
  ratedInputBtuh?: number | null;
  /** Above ~2,000 ft the input must be derated per the manufacturer. */
  altitudeFt?: number | null;
}): {
  inputBtuh: number;
  percentOfRated: number | null;
  findings: CircuitFinding[];
  hazardIds: string[];
  note: string;
} {
  const hv = params.heatingValueBtuPerCuFt ?? 1000;
  const inputBtuh = Math.round((3600 / params.secondsPerRevolution) * params.dialSizeCuFt * hv);
  const findings: CircuitFinding[] = [];
  let pct: number | null = null;

  if (params.ratedInputBtuh) {
    pct = round1((inputBtuh / params.ratedInputBtuh) * 100);
    if (pct > 105) {
      findings.push({
        key: 'gas_overfired',
        label: 'Furnace overfired',
        severity: 'CRITICAL',
        detail: `Clocked at ${inputBtuh.toLocaleString()} BTU/h against a rated ${params.ratedInputBtuh.toLocaleString()} BTU/h (${pct}%). Overfiring overheats the heat exchanger and can produce carbon monoxide. Check the manifold pressure against the rating plate and correct it before leaving.`,
        confidence: 0.9,
      });
    } else if (pct < 90) {
      findings.push({
        key: 'gas_underfired',
        label: 'Furnace underfired',
        severity: 'ABNORMAL',
        detail: `Clocked at ${inputBtuh.toLocaleString()} BTU/h against a rated ${params.ratedInputBtuh.toLocaleString()} BTU/h (${pct}%). Check the gas supply pressure under load, the manifold pressure, and whether the meter or piping is undersized for the total connected load.`,
        confidence: 0.85,
      });
    }
  }

  const notes = [
    'Every other gas appliance in the building must be off while clocking, or the reading includes them.',
    'Confirm the local heating value with the gas utility — 1,000 BTU/ft³ is a default, not a fact.',
  ];
  if ((params.altitudeFt ?? 0) > 2000) {
    notes.push(
      `At ${params.altitudeFt} ft the furnace must be derated per the manufacturer's high-altitude instructions, so the target input is below the sea-level rating plate value.`,
    );
  }

  return {
    inputBtuh,
    percentOfRated: pct,
    findings,
    hazardIds: ['natural-gas', 'co-exposure'],
    note: notes.join(' '),
  };
}

/**
 * The sequence of operations for a hot-surface-ignition furnace, expressed as
 * checkpoints. The engine walks these in order: the first checkpoint that
 * fails localizes the fault far faster than jumping to the flame sensor
 * because "it's usually the flame sensor".
 */
export interface IgnitionCheckpoint {
  n: number;
  stage: string;
  observable: string;
  ifAbsent: string;
  hazardIds: string[];
  /** Hypothesis ids this checkpoint failing should boost. */
  implicates: string[];
}

export const HSI_SEQUENCE: IgnitionCheckpoint[] = [
  {
    n: 1,
    stage: 'Call for heat',
    observable: '24 V present between W and C at the control board with the thermostat calling.',
    ifAbsent:
      'The furnace is not being told to run. Check the thermostat, the R-to-W path, and the low-voltage fuse on the board. A blown low-voltage fuse means a short in the field wiring — find it before replacing the fuse.',
    hazardIds: ['electrical-shock'],
    implicates: ['thermostat-fault', 'low-voltage-short', 'transformer-fault'],
  },
  {
    n: 2,
    stage: 'Pre-purge / inducer start',
    observable: 'Inducer energizes and comes up to speed within a few seconds.',
    ifAbsent:
      'Check line voltage to the inducer at the board, then the inducer motor itself. If the board is not sending voltage, verify the board has passed its self-check and that the limit string is closed — most boards will not start the inducer with an open limit.',
    hazardIds: ['electrical-shock', 'moving-parts'],
    implicates: ['inducer-motor-fault', 'control-board-fault', 'limit-circuit-open'],
  },
  {
    n: 3,
    stage: 'Pressure switch proves draft',
    observable:
      'Pressure switch closes after the inducer is at speed. Measured negative pressure at the switch port meets or exceeds the setpoint printed on the switch.',
    ifAbsent:
      'Measure the actual pressure at the switch hose with a manometer and compare it to the switch setpoint. If the draft is there and the switch will not close, the switch is bad. If the draft is not there, the cause is upstream: blocked or disconnected hose, condensate blocking the trap or drain, a plugged inlet/exhaust, a cracked inducer housing, or a weak inducer. Never jumper a pressure switch to run the furnace — it is the only thing proving the flue is clear, and defeating it can vent combustion products into the house.',
    hazardIds: ['co-exposure', 'natural-gas'],
    implicates: [
      'pressure-switch-fault',
      'blocked-flue',
      'condensate-blockage',
      'inducer-motor-fault',
    ],
  },
  {
    n: 4,
    stage: 'Ignitor warm-up',
    observable: 'Hot surface ignitor glows bright orange within its warm-up period.',
    ifAbsent:
      'Check for line voltage at the ignitor during warm-up. Voltage present and no glow means the ignitor is open — confirm with a resistance check (a silicon nitride ignitor reads very differently from a silicon carbide one, so use the value for the part actually installed). No voltage means the board or its ignitor relay. Never touch a hot ignitor and never handle a silicon carbide element with bare fingers.',
    hazardIds: ['electrical-shock', 'hot-surfaces'],
    implicates: ['ignitor-fault', 'control-board-fault'],
  },
  {
    n: 5,
    stage: 'Gas valve opens',
    observable: '24 V at the gas valve terminals and burners light across the manifold.',
    ifAbsent:
      'If 24 V is present at the valve and no gas flows, verify inlet gas pressure under load and confirm the manual valve is open, then suspect the valve. If there is no 24 V at the valve, the board did not command it — recheck the earlier checkpoints. If gas flows but does not light, look at ignitor position and burner alignment. If you smell gas at any point, stop, evacuate, and do not operate any electrical switch.',
    hazardIds: ['natural-gas', 'combustion', 'burns'],
    implicates: ['gas-valve-fault', 'gas-supply-pressure', 'ignitor-position'],
  },
  {
    n: 6,
    stage: 'Flame proving',
    observable:
      'Flame rectification current at or above the board minimum, typically around 0.5–1.0 µA minimum with 2–6 µA usual. Read the actual minimum from this board\'s literature.',
    ifAbsent:
      'Burners light and then drop out after a few seconds — the classic flame-sense failure. Put a meter in series with the flame sensor lead and read the microamps. Low current: clean the sensor with a non-abrasive pad (never sandpaper, which leaves a residue), verify the sensor is in the flame, and confirm the burner ground. If a clean sensor in a good flame still reads low, the problem is the ground path or the board.',
    hazardIds: ['natural-gas', 'combustion', 'hot-surfaces'],
    implicates: ['flame-sensor-fault', 'poor-burner-ground', 'control-board-fault', 'gas-valve-fault'],
  },
  {
    n: 7,
    stage: 'Blower on delay',
    observable: 'Indoor blower energizes after the on-delay and the temperature rise settles into the rated range.',
    ifAbsent:
      'If the blower never starts, check the board blower relay and the blower itself. If the furnace runs and then trips on the limit before the blower starts, the on-delay is too long or the blower is not moving air.',
    hazardIds: ['electrical-shock', 'moving-parts'],
    implicates: ['blower-motor-fault', 'control-board-fault', 'limit-circuit-open'],
  },
];

/**
 * Given the last stage the technician observed, return the checkpoint that
 * failed. This is what makes the heating workflow a decision tree rather than
 * a list of parts to swap.
 */
export function localizeIgnitionFailure(lastObservedStage: number): IgnitionCheckpoint | null {
  return HSI_SEQUENCE.find((c) => c.n === lastObservedStage + 1) ?? null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
