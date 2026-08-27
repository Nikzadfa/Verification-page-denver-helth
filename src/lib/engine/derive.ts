/**
 * Derivation layer: raw measurements -> engine findings.
 *
 * This is where the HVAC math in src/lib/hvac meets the inference engine. It
 * runs on every state change, so a measurement entered by voice, typed into a
 * form, or read off a photo all reach the engine through the same path and
 * produce the same findings.
 *
 * It is deliberately idempotent: derived findings are regenerated from scratch
 * each pass and replace the previous derived set, so correcting a mistyped
 * reading correctly retracts whatever the old value implied.
 */

import type { EngineState, Finding } from './types';
import { analyzeCircuit, type CircuitInput, type MeteringDevice } from '../hvac/refrigerationAnalysis';
import { analyzeStaticPressure } from '../hvac/airflow';
import { analyzeCoilFreeze } from '../hvac/airflow';
import { analyzeCapacitor, analyzeMotorAmps, analyzeVoltage, analyzeControlVoltage } from '../hvac/electrical';
import { analyzeTemperatureRise } from '../hvac/combustion';
import { normalizeRefrigerantId } from '../hvac/refrigerants';
import type { DerivedValue } from '../hvac/refrigerationAnalysis';

/** Findings produced by this module. Used to retract the previous pass. */
export const DERIVED_SOURCE = 'derived';

function num(state: EngineState, key: string): number | null {
  const m = state.measurements[key];
  if (!m || m.value === null || m.value === undefined) return null;
  return Number.isFinite(m.value) ? m.value : null;
}

function text(state: EngineState, key: string): string | null {
  const m = state.measurements[key];
  return m?.text ?? null;
}

export interface DerivationResult {
  findings: Finding[];
  derived: DerivedValue[];
  /** Readings that would most improve the analysis, ranked. */
  missing: Array<{ key: string; label: string; why: string }>;
  /** Prose the UI shows alongside the numbers (glide, A2L handling, etc.). */
  notes: string[];
  /** Conversions that relied on the approximate P/T tables. */
  verifyNotes: string[];
}

export function derive(state: EngineState): DerivationResult {
  const findings: Finding[] = [];
  const derived: DerivedValue[] = [];
  const missing: DerivationResult['missing'] = [];
  const notes: string[] = [];
  const verifyNotes: string[] = [];
  const now = new Date().toISOString();

  const add = (
    key: string,
    label: string,
    detail: string,
    confidence: number,
    sourceKeys: string[],
  ) => {
    findings.push({
      key,
      label,
      present: true,
      detail,
      confidence,
      sourceMeasurementKeys: sourceKeys,
      sourceTestId: DERIVED_SOURCE,
      observedAt: now,
    });
  };

  // ---- Refrigerant circuit -----------------------------------------------
  const refrigerant =
    normalizeRefrigerantId(text(state, 'refrigerant') ?? state.context.refrigerant ?? null);

  const hasCircuitData =
    num(state, 'suction_pressure') !== null ||
    num(state, 'suction_sat_temp') !== null ||
    num(state, 'liquid_pressure') !== null ||
    num(state, 'liquid_sat_temp') !== null;

  if (refrigerant && hasCircuitData) {
    const metering = (text(state, 'metering_device') ??
      state.context.meteringDevice ??
      'UNKNOWN') as MeteringDevice;

    const input: CircuitInput = {
      refrigerant,
      meteringDevice: metering,
      mode: state.context.mode === 'HEATING' ? 'HEATING' : state.context.mode === 'COOLING' ? 'COOLING' : 'UNKNOWN',
      suctionPsig: num(state, 'suction_pressure'),
      suctionSatTempF: num(state, 'suction_sat_temp'),
      suctionLineTempF: num(state, 'suction_line_temp'),
      liquidPsig: num(state, 'liquid_pressure'),
      liquidSatTempF: num(state, 'liquid_sat_temp'),
      liquidLineTempF: num(state, 'liquid_line_temp'),
      dischargeLineTempF: num(state, 'discharge_temp'),
      outdoorDbF: num(state, 'outdoor_db'),
      returnDbF: num(state, 'return_db'),
      returnWbF: num(state, 'return_wb'),
      returnRhPercent: num(state, 'return_rh'),
      supplyDbF: num(state, 'supply_db'),
      targetSubcoolF: num(state, 'target_subcooling'),
      highEfficiency: state.context.highEfficiency ?? null,
      altitudeFt: num(state, 'altitude_ft') ?? state.context.altitudeFt ?? null,
    };

    const analysis = analyzeCircuit(input);
    derived.push(...analysis.derived);
    missing.push(...analysis.missing);
    notes.push(...analysis.notes);

    for (const c of analysis.conversions) {
      if (c.conversion.mustVerify) {
        verifyNotes.push(`${c.what}: ${c.conversion.note}`);
      }
    }

    for (const cf of analysis.findings) {
      // The circuit analyzer emits some keys that are richer than the engine's
      // finding vocabulary; map them onto engine findings and drop the rest
      // into the derived list where the UI still shows them.
      const mapped = mapCircuitFinding(cf.key);
      if (mapped) add(mapped, cf.label, cf.detail, cf.confidence, ['suction_pressure', 'liquid_pressure']);
    }

    // Normal-range findings must be emitted explicitly. Without them the
    // engine only ever learns from abnormal results and can never conclude
    // that the refrigerant circuit is fine.
    const sh = analysis.derived.find((d) => d.key === 'superheat');
    if (sh?.severity === 'NORMAL' && sh.value !== null) {
      add('superheat_normal', 'Superheat in range', `${sh.value} °F. ${sh.explanation}`, 0.85, ['suction_pressure', 'suction_line_temp']);
    }
    const sc = analysis.derived.find((d) => d.key === 'subcooling');
    if (sc?.severity === 'NORMAL' && sc.value !== null) {
      add('subcooling_normal', 'Subcooling in range', `${sc.value} °F. ${sc.explanation}`, 0.85, ['liquid_pressure', 'liquid_line_temp']);
    }
  } else if (hasCircuitData && !refrigerant) {
    missing.push({
      key: 'refrigerant',
      label: 'Refrigerant type',
      why: 'Pressures mean nothing without knowing the refrigerant. 118 psig is 40 °F on R-410A and about 70 °F on R-22 — opposite conclusions from the same number.',
    });
  }

  // ---- Air side -----------------------------------------------------------
  const staticInput = {
    returnIwc: num(state, 'return_static'),
    supplyIwc: num(state, 'supply_static'),
    totalIwc: num(state, 'total_static'),
    filterDropIwc: num(state, 'filter_drop'),
    coilDropIwc: num(state, 'coil_drop'),
    ratedMaxIwc: num(state, 'rated_max_static'),
  };
  if (
    staticInput.totalIwc !== null ||
    (staticInput.returnIwc !== null && staticInput.supplyIwc !== null)
  ) {
    const sp = analyzeStaticPressure(staticInput);
    for (const cf of sp.findings) {
      add(cf.key, cf.label, cf.detail, cf.confidence, ['total_static', 'return_static', 'supply_static']);
    }
    if (sp.totalIwc !== null) {
      derived.push({
        key: 'total_static',
        label: 'Total external static pressure',
        value: sp.totalIwc,
        unit: 'in. w.c.',
        target: { low: 0, high: sp.ratedMaxIwc, basis: 'Blower table maximum for this unit' },
        severity: sp.severity,
        mustVerify: staticInput.ratedMaxIwc === null,
        explanation: sp.explanation,
      });
      if (sp.severity === 'NORMAL') {
        add('static_pressure_normal', 'Total external static within rating', `${sp.totalIwc} in. w.c. against ${sp.ratedMaxIwc} in. w.c. rated.`, 0.85, ['total_static']);
      }
    }
  }

  const filterCondition = text(state, 'filter_condition');
  if (filterCondition === 'CLEAN') {
    add('filter_clean', 'Filter clean', 'Inspected and passing light.', 0.9, ['filter_condition']);
  } else if (filterCondition === 'DIRTY' || filterCondition === 'BLOCKED') {
    add('filter_dirty', 'Filter loaded', 'Inspected and restricting.', 0.9, ['filter_condition']);
  }

  const evapCondition = text(state, 'evaporator_condition');
  if (evapCondition === 'DIRTY') {
    add('evaporator_dirty', 'Evaporator coil dirty', 'Dirt on the upstream face of the coil.', 0.9, ['evaporator_condition']);
  } else if (evapCondition === 'ICED') {
    add('evaporator_iced', 'Evaporator coil iced', 'Ice on the indoor coil.', 0.95, ['evaporator_condition']);
  }

  const condCondition = text(state, 'condenser_coil_condition');
  if (condCondition === 'CLEAN') {
    add('condenser_coil_clean', 'Condenser coil clean', 'Inspected clean and unobstructed.', 0.9, ['condenser_coil_condition']);
  } else if (condCondition === 'DIRTY' || condCondition === 'OBSTRUCTED') {
    add('condenser_coil_dirty', 'Condenser coil dirty or obstructed', 'Inspected and restricting heat rejection.', 0.9, ['condenser_coil_condition']);
  }

  // Freeze analysis needs the derived superheat, so it runs after the circuit.
  const superheatValue = derived.find((d) => d.key === 'superheat')?.value ?? null;
  const suctionSatValue = derived.find((d) => d.key === 'suction_sat_temp')?.value ?? null;
  if (evapCondition === 'ICED' || suctionSatValue !== null) {
    const freezeFindings = analyzeCoilFreeze({
      suctionSatTempF: suctionSatValue,
      superheatF: superheatValue,
      filterCondition: (filterCondition as 'CLEAN' | 'DIRTY' | 'BLOCKED' | null) ?? null,
      coilCondition: (evapCondition as 'CLEAN' | 'DIRTY' | 'ICED' | null) ?? null,
    });
    for (const cf of freezeFindings) {
      const mapped = mapCircuitFinding(cf.key);
      if (mapped) add(mapped, cf.label, cf.detail, cf.confidence, ['evaporator_condition']);
      else notes.push(cf.detail);
    }
  }

  // ---- Electrical ---------------------------------------------------------
  const capRated = num(state, 'capacitor_rated_uf');
  const capMeasured = num(state, 'capacitor_measured_uf');
  if (capRated !== null && capMeasured !== null && capRated > 0) {
    const cap = analyzeCapacitor({ ratedUf: capRated, measuredUf: capMeasured });
    derived.push({
      key: 'capacitor_deviation',
      label: 'Capacitor deviation from rating',
      value: cap.deviationPercent,
      unit: '%',
      target: { low: -6, high: 6, basis: 'Typical ±6% run-capacitor tolerance' },
      severity: cap.severity,
      mustVerify: false,
      explanation: cap.explanation,
    });
    for (const cf of cap.findings) {
      add(cf.key, cf.label, cf.detail, cf.confidence, ['capacitor_rated_uf', 'capacitor_measured_uf']);
    }
    if (cap.verdict === 'IN_TOLERANCE') {
      add('capacitor_ok', 'Run capacitor within tolerance', `${capMeasured} µF against ${capRated} µF rated (${cap.low}–${cap.high} µF allowed).`, 0.9, ['capacitor_measured_uf']);
    }
  }

  const amps = num(state, 'compressor_amps');
  const rla = num(state, 'compressor_rla');
  if (amps !== null && rla !== null && rla > 0) {
    const motor = analyzeMotorAmps({
      ratedAmps: rla,
      measuredAmps: amps,
      lraAmps: num(state, 'compressor_lra'),
      kind: 'COMPRESSOR',
    });
    derived.push({
      key: 'compressor_amps_pct',
      label: 'Compressor amps as % of RLA',
      value: motor.percentOfRated,
      unit: '%',
      target: { low: 40, high: 115, basis: 'Normal operating band relative to nameplate RLA' },
      severity: motor.severity,
      mustVerify: false,
      explanation: motor.explanation,
    });
    for (const cf of motor.findings) {
      add(cf.key, cf.label, cf.detail, cf.confidence, ['compressor_amps', 'compressor_rla']);
    }
    if (motor.findings.length === 0) {
      add('compressor_amps_normal', 'Compressor amps in range', `${amps} A, ${motor.percentOfRated}% of the ${rla} A nameplate RLA.`, 0.85, ['compressor_amps']);
    }
  }

  const supplyV = num(state, 'supply_voltage');
  const ratedV = num(state, 'rated_voltage');
  if (supplyV !== null && ratedV !== null && ratedV > 0) {
    const v = analyzeVoltage({ measuredVolts: supplyV, ratedVolts: ratedV });
    for (const cf of v.findings) {
      add(cf.key, cf.label, cf.detail, cf.confidence, ['supply_voltage', 'rated_voltage']);
    }
  }

  const controlV = num(state, 'control_voltage');
  if (controlV !== null) {
    const cv = analyzeControlVoltage(controlV, true);
    for (const cf of cv.findings) {
      add(cf.key, cf.label, cf.detail, cf.confidence, ['control_voltage']);
    }
    if (cv.findings.length === 0) {
      add('control_voltage_ok', '24 V control voltage normal', `${controlV} V at the secondary under load.`, 0.9, ['control_voltage']);
    }
  }

  // ---- Combustion ---------------------------------------------------------
  const supplyDb = num(state, 'supply_db');
  const returnDb = num(state, 'return_db');
  if (
    supplyDb !== null &&
    returnDb !== null &&
    supplyDb > returnDb &&
    (state.context.mode === 'HEATING' || num(state, 'rated_rise_max') !== null)
  ) {
    const rise = analyzeTemperatureRise({
      supplyDbF: supplyDb,
      returnDbF: returnDb,
      ratedRiseMinF: num(state, 'rated_rise_min'),
      ratedRiseMaxF: num(state, 'rated_rise_max'),
    });
    derived.push({
      key: 'temperature_rise',
      label: 'Temperature rise',
      value: rise.riseF,
      unit: '°F',
      target: {
        low: num(state, 'rated_rise_min') ?? 30,
        high: num(state, 'rated_rise_max') ?? 60,
        basis: num(state, 'rated_rise_max') !== null ? 'Rating plate' : 'Generic range — enter the rating plate values',
      },
      severity: rise.severity,
      mustVerify: num(state, 'rated_rise_max') === null,
      explanation: rise.explanation,
    });
    for (const cf of rise.findings) {
      add(cf.key, cf.label, cf.detail, cf.confidence, ['supply_db', 'return_db']);
    }
  }

  const flameUa = num(state, 'flame_current_ua');
  const boardMinUa = num(state, 'board_minimum_ua');
  if (flameUa !== null) {
    const minimum = boardMinUa ?? 1.0;
    if (flameUa < minimum) {
      add(
        'flame_current_low',
        'Flame current below the board minimum',
        `${flameUa} µA against a ${boardMinUa !== null ? 'board minimum' : 'assumed minimum'} of ${minimum} µA.${
          boardMinUa === null
            ? ' The real minimum is board specific — confirm it in this board\'s literature before acting on this.'
            : ''
        }`,
        boardMinUa === null ? 0.6 : 0.9,
        ['flame_current_ua'],
      );
    } else {
      add('flame_current_ok', 'Flame current adequate', `${flameUa} µA, at or above the ${minimum} µA minimum.`, boardMinUa === null ? 0.65 : 0.9, ['flame_current_ua']);
    }
  }

  const draft = num(state, 'measured_draft_iwc');
  const setpoint = num(state, 'switch_setpoint_iwc');
  if (draft !== null && setpoint !== null) {
    // Both are negative pressures; "adequate" means the magnitude meets or
    // exceeds the setpoint magnitude.
    const adequate = Math.abs(draft) >= Math.abs(setpoint);
    const switchOpen = state.findings.some((f) => f.key === 'pressure_switch_not_closing' && f.present);
    if (adequate && switchOpen) {
      add(
        'draft_adequate_switch_open',
        'Adequate draft but the switch stays open',
        `Measured ${draft} in. w.c. against a ${setpoint} in. w.c. setpoint. The inducer is producing the draft the switch needs and the switch is not responding.`,
        0.9,
        ['measured_draft_iwc', 'switch_setpoint_iwc'],
      );
    } else if (!adequate) {
      add(
        'draft_inadequate',
        'Measured draft below the switch setpoint',
        `Measured ${draft} in. w.c. against a ${setpoint} in. w.c. setpoint. The switch is doing its job — the restriction or weak draft is real, and the switch is not the fault.`,
        0.9,
        ['measured_draft_iwc', 'switch_setpoint_iwc'],
      );
    }
  }

  return { findings, derived, missing: dedupe(missing), notes, verifyNotes };
}

/**
 * Some analyzer findings are narrative rather than inferential. Only the ones
 * in the engine's finding vocabulary get mapped; the rest are shown to the
 * technician as notes but do not move the ranking.
 */
const CIRCUIT_FINDING_MAP: Record<string, string> = {
  superheat_high: 'superheat_high',
  superheat_low: 'superheat_low',
  superheat_negative: 'superheat_negative',
  subcooling_high: 'subcooling_high',
  subcooling_low: 'subcooling_low',
  condenser_split_high: 'condenser_split_high',
  condenser_split_low: 'condenser_split_low',
  evap_td_high: 'evap_td_high',
  delta_t_high: 'delta_t_high',
  delta_t_low: 'delta_t_low',
  compression_ratio_high: 'compression_ratio_high',
  discharge_temp_high: 'discharge_temp_high',
  floodback_risk: 'floodback_risk',
  noncondensables_suspected: 'noncondensables_suspected',
  pattern_high_sh_low_sc: 'pattern_high_sh_low_sc',
  pattern_high_sh_high_sc: 'pattern_high_sh_high_sc',
  pattern_low_sh_high_sc: 'pattern_low_sh_high_sc',
  pattern_low_sh_low_sc: 'pattern_low_sh_low_sc',
  pattern_charge_normal: 'pattern_charge_normal',
  coil_below_freezing: 'coil_below_freezing',
  static_pressure_high: 'static_pressure_high',
  filter_restriction: 'filter_restriction',
  coil_restriction: 'coil_restriction',
  cfm_per_ton_low: 'cfm_per_ton_low',
  cfm_per_ton_high: 'cfm_per_ton_high',
  freeze_from_airflow: 'static_pressure_high',
  freeze_from_starvation: 'superheat_high',
};

function mapCircuitFinding(key: string): string | null {
  return CIRCUIT_FINDING_MAP[key] ?? null;
}

function dedupe<T extends { key: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}
