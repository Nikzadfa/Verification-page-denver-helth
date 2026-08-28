/**
 * Airflow analysis.
 *
 * Total external static pressure is the measurement that separates a real
 * airflow problem from a guess, so this module is built around it. ΔT is
 * treated as a screening indicator only (see refrigerationAnalysis.ts).
 */

import type { CircuitFinding, Severity } from './refrigerationAnalysis';

export interface StaticPressureInput {
  /** Return-side static, measured between the filter and the blower. Negative. */
  returnIwc?: number | null;
  /** Supply-side static, measured after the blower and after the coil. Positive. */
  supplyIwc?: number | null;
  /** Or the total directly, if the tech already summed the magnitudes. */
  totalIwc?: number | null;
  /** Pressure drop across the filter alone. */
  filterDropIwc?: number | null;
  /** Pressure drop across the indoor coil alone. */
  coilDropIwc?: number | null;
  /** Nameplate maximum ESP for the air handler/furnace, usually 0.5 in. w.c. */
  ratedMaxIwc?: number | null;
  blowerType?: 'PSC' | 'ECM' | 'UNKNOWN';
}

export interface StaticPressureResult {
  totalIwc: number | null;
  ratedMaxIwc: number;
  percentOfRated: number | null;
  severity: Severity;
  findings: CircuitFinding[];
  /** What to measure next to localize the restriction. */
  nextSteps: string[];
  explanation: string;
}

export function analyzeStaticPressure(input: StaticPressureInput): StaticPressureResult {
  const rated = input.ratedMaxIwc ?? 0.5;
  const findings: CircuitFinding[] = [];
  const nextSteps: string[] = [];

  let total = numeric(input.totalIwc);
  const ret = numeric(input.returnIwc);
  const sup = numeric(input.supplyIwc);
  if (total === null && ret !== null && sup !== null) {
    // Return static is negative; total external static is the sum of magnitudes.
    total = round2(Math.abs(ret) + Math.abs(sup));
  }

  if (total === null) {
    return {
      totalIwc: null,
      ratedMaxIwc: rated,
      percentOfRated: null,
      severity: 'WATCH',
      findings,
      nextSteps: [
        'Drill or use existing test ports: one on the return side between the filter and the blower, one on the supply side downstream of the blower and the indoor coil.',
        'Read each with a manometer while the blower runs at the speed used for the failing mode, then add the magnitudes.',
      ],
      explanation:
        'Total external static pressure is the only field measurement that shows whether the duct system is within what the blower was designed for. Without it, "low airflow" is an assumption.',
    };
  }

  const pct = round1((total / rated) * 100);
  const severity: Severity = total > rated * 1.6 ? 'CRITICAL' : total > rated ? 'ABNORMAL' : total < rated * 0.3 ? 'WATCH' : 'NORMAL';

  if (total > rated) {
    findings.push({
      key: 'static_pressure_high',
      label: 'Total external static pressure above rating',
      severity,
      detail: `${total} in. w.c. against a ${rated} in. w.c. rating (${pct}%). The blower cannot move its rated air against this. On a PSC blower, airflow falls as static rises — capacity drops and the coil can freeze. On an ECM, the motor compensates by increasing torque, so it may still move air while drawing more power, running hotter and eventually failing.`,
      confidence: 0.9,
    });
    nextSteps.push(
      'Split the total: read the drop across the filter and across the indoor coil separately. Whichever is disproportionate is where the restriction is.',
      'If neither the filter nor the coil accounts for it, the ductwork itself is undersized or restricted — check for closed dampers, crushed flex, undersized returns, and a filter grille that is too small.',
    );
  } else if (total < rated * 0.3) {
    findings.push({
      key: 'static_pressure_very_low',
      label: 'Suspiciously low static pressure',
      severity: 'WATCH',
      detail: `${total} in. w.c. is very low. Either the duct system is unusually generous, the blower is not running at the expected speed, or a probe is not actually in the airstream. Verify the blower is at the speed for the failing mode and that the probes are seated.`,
      confidence: 0.5,
    });
  }

  const filterDrop = numeric(input.filterDropIwc);
  if (filterDrop !== null && filterDrop > 0.25) {
    findings.push({
      key: 'filter_restriction',
      label: 'Excessive filter pressure drop',
      severity: filterDrop > 0.4 ? 'ABNORMAL' : 'WATCH',
      detail: `${filterDrop} in. w.c. across the filter. A clean 1-inch filter in a correctly sized grille normally drops under 0.1 in. w.c. This is either a loaded filter or a high-MERV filter in a grille with far too little face area. Replacing a dirty filter fixes it today; the undersized filter grille brings it back in a month.`,
      confidence: 0.85,
    });
  }

  const coilDrop = numeric(input.coilDropIwc);
  if (coilDrop !== null && coilDrop > 0.3) {
    findings.push({
      key: 'coil_restriction',
      label: 'Excessive indoor coil pressure drop',
      severity: 'ABNORMAL',
      detail: `${coilDrop} in. w.c. across the indoor coil. A clean A-coil typically drops 0.15–0.30 in. w.c. at rated airflow. A dirty coil or one that has been iced and refrozen reads higher. Inspect the upstream face of the coil — dirt collects there and is invisible from the downstream side.`,
      confidence: 0.85,
    });
  }

  if (input.blowerType === 'ECM' && total > rated) {
    findings.push({
      key: 'ecm_compensating',
      label: 'ECM blower masking a duct problem',
      severity: 'WATCH',
      detail:
        'A constant-airflow ECM will hold CFM against high static by working harder, so the technician sees normal ΔT and normal capacity right up until the motor module fails. High static on an ECM system is still a duct defect that needs correcting.',
      confidence: 0.7,
    });
  }

  return {
    totalIwc: total,
    ratedMaxIwc: rated,
    percentOfRated: pct,
    severity,
    findings,
    nextSteps,
    explanation:
      'Total external static is the pressure the blower has to work against, excluding the equipment cabinet itself. Compare it to the maximum on the blower table for this unit, not to a generic 0.5 in. w.c.',
  };
}

/**
 * Estimated airflow from the sensible heat equation. Requires a known sensible
 * capacity, which in practice means either a manufacturer performance table or
 * a measured electric-heat kW.
 */
export function estimateCfmFromSensible(sensibleBtuh: number, deltaTF: number): number | null {
  if (deltaTF <= 0) return null;
  return Math.round(sensibleBtuh / (1.08 * deltaTF));
}

/**
 * The most reliable field airflow check on an electric-heat air handler:
 * energize the strips, measure the actual kW, and read the temperature rise.
 */
export function cfmFromElectricHeat(params: {
  volts: number;
  amps: number;
  temperatureRiseF: number;
}): { cfm: number | null; watts: number; note: string } {
  const watts = Math.round(params.volts * params.amps);
  if (params.temperatureRiseF <= 0) {
    return { cfm: null, watts, note: 'Temperature rise must be positive.' };
  }
  const btuh = watts * 3.412;
  const cfm = Math.round(btuh / (1.08 * params.temperatureRiseF));
  return {
    cfm,
    watts,
    note: 'Measure amps on every heater leg and sum them. Take the supply temperature far enough downstream that radiant heat from the elements does not hit the probe, or the reading will read high and the CFM low.',
  };
}

/** CFM per ton — the number that says whether the coil is getting its design air. */
export function cfmPerTon(cfm: number, tons: number): {
  value: number;
  severity: Severity;
  findings: CircuitFinding[];
} {
  const value = Math.round(cfm / tons);
  const findings: CircuitFinding[] = [];
  if (value < 325) {
    findings.push({
      key: 'cfm_per_ton_low',
      label: 'Low CFM per ton',
      severity: value < 275 ? 'CRITICAL' : 'ABNORMAL',
      detail: `${value} CFM/ton. Design is typically 350–400 for comfort cooling (and often 300–350 where dehumidification is the priority). Below about 325 the coil runs colder, superheat climbs, capacity drops, and the coil will eventually freeze.`,
      confidence: 0.85,
    });
  } else if (value > 450) {
    findings.push({
      key: 'cfm_per_ton_high',
      label: 'High CFM per ton',
      severity: 'ABNORMAL',
      detail: `${value} CFM/ton. Too much air raises coil temperature, kills latent capacity, and leaves the space cool but clammy. It also drives superheat down on a fixed-orifice system.`,
      confidence: 0.8,
    });
  }
  return { value, severity: findings.length ? findings[0]!.severity : 'NORMAL', findings };
}

export interface CoilFreezeInput {
  suctionSatTempF: number | null;
  superheatF: number | null;
  filterCondition?: 'CLEAN' | 'DIRTY' | 'BLOCKED' | null;
  coilCondition?: 'CLEAN' | 'DIRTY' | 'ICED' | null;
  indoorBlowerRunning?: boolean | null;
}

/**
 * A frozen evaporator is a symptom with exactly two families of cause: not
 * enough heat getting to the coil (airflow), or not enough refrigerant in it
 * (charge/metering). This ranks them from the readings available.
 */
export function analyzeCoilFreeze(input: CoilFreezeInput): CircuitFinding[] {
  const findings: CircuitFinding[] = [];
  const sat = input.suctionSatTempF;

  if (sat !== null && sat < 32) {
    findings.push({
      key: 'coil_below_freezing',
      label: 'Evaporator operating below freezing',
      severity: 'ABNORMAL',
      detail: `Suction saturation is ${sat} °F. Any moisture condensing on the coil freezes instead of draining, and the ice progressively blocks what airflow is left — so the problem accelerates once it starts.`,
      confidence: 0.9,
    });
  }

  if (input.coilCondition === 'ICED' || input.filterCondition === 'BLOCKED') {
    findings.push({
      key: 'must_thaw_before_readings',
      label: 'System must be thawed before refrigerant readings mean anything',
      severity: 'ABNORMAL',
      detail:
        'Pressures taken on an iced coil are meaningless — the ice is throttling the air and dragging the suction down on its own. Run the blower with the compressor off until the coil is completely clear, then take readings. Adjusting charge on a frozen system is how a correctly charged system ends up overcharged.',
      confidence: 0.95,
    });
  }

  if (input.superheatF !== null && input.superheatF > 20 && input.filterCondition === 'CLEAN') {
    findings.push({
      key: 'freeze_from_starvation',
      label: 'Freeze pattern consistent with refrigerant starvation',
      severity: 'ABNORMAL',
      detail:
        'High superheat with a clean filter shifts the weight toward undercharge or a restriction rather than airflow. On a starved coil the ice usually forms at the inlet end and the outlet end stays clear — check where the ice starts.',
      confidence: 0.7,
    });
  }
  if (input.superheatF !== null && input.superheatF < 8 && input.filterCondition !== 'CLEAN') {
    findings.push({
      key: 'freeze_from_airflow',
      label: 'Freeze pattern consistent with low airflow',
      severity: 'ABNORMAL',
      detail:
        'Low superheat with a restricted filter points at airflow. On an airflow-starved coil the ice forms evenly across the whole face. Confirm with total external static pressure rather than assuming.',
      confidence: 0.75,
    });
  }

  return findings;
}

function numeric(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
