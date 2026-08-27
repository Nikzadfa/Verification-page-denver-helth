/**
 * Refrigeration circuit analysis.
 *
 * Turns raw gauge/thermometer readings into the derived quantities a senior
 * technician actually reasons about — superheat, subcooling, condenser split,
 * evaporator TD, compression ratio, target superheat — and then into discrete
 * findings that the inference engine can consume.
 *
 * Two rules are enforced everywhere in this file:
 *
 *  1. If a technician supplied a saturation temperature directly, we use it.
 *     We only fall back to converting a pressure through the approximate P/T
 *     tables when we have no measured saturation temperature, and we propagate
 *     the `mustVerify` flag so the UI can say so.
 *
 *  2. Nothing here condemns a component. It produces evidence with a
 *     confidence, and the engine weighs that evidence against competing
 *     hypotheses. "High superheat" is a finding; "low on charge" is a
 *     conclusion the engine may only reach after the evidence supports it over
 *     the alternatives (restriction, poor airflow, undersized metering device).
 */

import {
  type Conversion,
  type RefrigerantId,
  getRefrigerant,
  pressureFromSatTemp,
  satTempFromPressure,
} from './refrigerants';
import { wetBulbF } from './psychrometrics';

export type MeteringDevice = 'TXV' | 'EEV' | 'FIXED_ORIFICE' | 'CAPILLARY' | 'UNKNOWN';
export type SystemMode = 'COOLING' | 'HEATING' | 'UNKNOWN';

export interface CircuitInput {
  refrigerant: RefrigerantId;
  meteringDevice: MeteringDevice;
  mode: SystemMode;

  /** Low side. Provide the pressure, the saturation temperature, or both. */
  suctionPsig?: number | null;
  suctionSatTempF?: number | null;
  suctionLineTempF?: number | null;

  /** High side. */
  liquidPsig?: number | null;
  liquidSatTempF?: number | null;
  liquidLineTempF?: number | null;
  dischargeLineTempF?: number | null;

  /** Air side. */
  outdoorDbF?: number | null;
  returnDbF?: number | null;
  returnWbF?: number | null;
  returnRhPercent?: number | null;
  supplyDbF?: number | null;

  /** Nameplate/manufacturer targets when the tech has them from the label. */
  targetSubcoolF?: number | null;
  /** Equipment SEER tier changes the expected condenser split. */
  highEfficiency?: boolean | null;
  altitudeFt?: number | null;
}

export type Severity = 'NORMAL' | 'WATCH' | 'ABNORMAL' | 'CRITICAL';

export interface DerivedValue {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  /** Range considered acceptable, when one is defined. */
  target?: { low: number; high: number; basis: string };
  severity: Severity;
  /** True when the value depends on the approximate P/T tables. */
  mustVerify: boolean;
  explanation: string;
}

export interface CircuitFinding {
  /** Stable id consumed by the inference engine. See engine/findings.ts. */
  key: string;
  label: string
  severity: Severity;
  detail: string;
  /** 0..1 — how sure we are the finding is real, given input completeness. */
  confidence: number;
}

export interface CircuitAnalysis {
  derived: DerivedValue[];
  findings: CircuitFinding[];
  /** Readings the analysis still needs, ranked by how much they would help. */
  missing: Array<{ key: string; label: string; why: string }>;
  /** Any conversion that leaned on the approximate tables. */
  conversions: Array<{ what: string; conversion: Conversion }>;
  notes: string[];
}

/** Superheat is referenced to the DEW point; subcooling to the BUBBLE point. */
export function analyzeCircuit(input: CircuitInput): CircuitAnalysis {
  const derived: DerivedValue[] = [];
  const findings: CircuitFinding[] = [];
  const missing: CircuitAnalysis['missing'] = [];
  const conversions: CircuitAnalysis['conversions'] = [];
  const notes: string[] = [];

  const refrigerant = getRefrigerant(input.refrigerant);
  if (refrigerant.blend === 'ZEOTROPIC') {
    notes.push(
      `${refrigerant.id} has about ${refrigerant.nominalGlideF} °F of glide. Superheat is taken from the dew point and subcooling from the bubble point; using one curve for both would bias the readings by most of the glide.`,
    );
  }
  if (refrigerant.flammable) {
    notes.push(
      `${refrigerant.id} is an A2L (mildly flammable) refrigerant. Follow the equipment manufacturer's service procedure and use A2L-rated recovery, leak detection and tooling.`,
    );
  }

  // ---- Saturation temperatures -------------------------------------------
  let suctionSat: number | null = numeric(input.suctionSatTempF);
  let suctionSatVerified = suctionSat !== null;
  if (suctionSat === null && numeric(input.suctionPsig) !== null) {
    const c = satTempFromPressure(input.refrigerant, input.suctionPsig!, 'dew');
    suctionSat = c.value;
    conversions.push({ what: 'Suction saturation temperature (dew point)', conversion: c });
  }

  let liquidSat: number | null = numeric(input.liquidSatTempF);
  let liquidSatVerified = liquidSat !== null;
  if (liquidSat === null && numeric(input.liquidPsig) !== null) {
    const c = satTempFromPressure(input.refrigerant, input.liquidPsig!, 'bubble');
    liquidSat = c.value;
    conversions.push({ what: 'Liquid saturation temperature (bubble point)', conversion: c });
  }

  // If the tech gave a saturation temperature but no pressure, back out the
  // pressure so the report and the compression-ratio check still work.
  let suctionPsig = numeric(input.suctionPsig);
  if (suctionPsig === null && suctionSat !== null && suctionSatVerified) {
    suctionPsig = pressureFromSatTemp(input.refrigerant, suctionSat, 'dew').value;
  }
  let liquidPsig = numeric(input.liquidPsig);
  if (liquidPsig === null && liquidSat !== null && liquidSatVerified) {
    liquidPsig = pressureFromSatTemp(input.refrigerant, liquidSat, 'bubble').value;
  }

  const satMustVerify = conversions.some((c) => c.conversion.mustVerify);

  if (suctionSat !== null) {
    derived.push({
      key: 'suction_sat_temp',
      label: 'Suction saturation temp',
      value: round1(suctionSat),
      unit: '°F',
      severity: 'NORMAL',
      mustVerify: !suctionSatVerified && satMustVerify,
      explanation: suctionSatVerified
        ? 'Read directly from the manifold.'
        : `Converted from ${input.suctionPsig} psig using the ${refrigerant.id} dew-point curve.`,
    });
  }
  if (liquidSat !== null) {
    derived.push({
      key: 'liquid_sat_temp',
      label: 'Liquid saturation temp',
      value: round1(liquidSat),
      unit: '°F',
      severity: 'NORMAL',
      mustVerify: !liquidSatVerified && satMustVerify,
      explanation: liquidSatVerified
        ? 'Read directly from the manifold.'
        : `Converted from ${input.liquidPsig} psig using the ${refrigerant.id} bubble-point curve.`,
    });
  }

  // ---- Superheat ----------------------------------------------------------
  const suctionLine = numeric(input.suctionLineTempF);
  let superheat: number | null = null;
  if (suctionSat !== null && suctionLine !== null) {
    superheat = round1(suctionLine - suctionSat);
  } else if (suctionSat === null) {
    missing.push({
      key: 'suction_pressure',
      label: 'Suction pressure (or suction saturation temp)',
      why: 'Without it there is no superheat, and superheat is the single most informative refrigerant-side reading.',
    });
  } else {
    missing.push({
      key: 'suction_line_temp',
      label: 'Suction line temperature at the service valve',
      why: 'Needed to complete superheat. Clamp the probe to a clean, insulated section of the suction line within about 6 inches of the service valve.',
    });
  }

  // ---- Subcooling ---------------------------------------------------------
  const liquidLine = numeric(input.liquidLineTempF);
  let subcooling: number | null = null;
  if (liquidSat !== null && liquidLine !== null) {
    subcooling = round1(liquidSat - liquidLine);
  } else if (liquidSat === null) {
    missing.push({
      key: 'liquid_pressure',
      label: 'Liquid pressure (or liquid saturation temp)',
      why: 'Subcooling separates undercharge from a liquid-line restriction, and the two look identical on superheat alone.',
    });
  } else {
    missing.push({
      key: 'liquid_line_temp',
      label: 'Liquid line temperature at the service valve',
      why: 'Needed to complete subcooling.',
    });
  }

  // ---- Target superheat (fixed orifice) -----------------------------------
  const outdoorDb = numeric(input.outdoorDbF);
  const returnDb = numeric(input.returnDbF);
  let returnWb = numeric(input.returnWbF);
  if (returnWb === null && returnDb !== null && numeric(input.returnRhPercent) !== null) {
    returnWb = wetBulbF(returnDb, input.returnRhPercent!);
  }

  let targetSuperheat: number | null = null;
  const isFixedOrifice =
    input.meteringDevice === 'FIXED_ORIFICE' || input.meteringDevice === 'CAPILLARY';

  if (isFixedOrifice) {
    if (returnWb !== null && outdoorDb !== null) {
      targetSuperheat = targetSuperheatFixedOrifice(returnWb, outdoorDb);
    } else {
      missing.push({
        key: returnWb === null ? 'return_wet_bulb' : 'outdoor_db',
        label:
          returnWb === null
            ? 'Return-air wet bulb (or dry bulb + RH)'
            : 'Outdoor dry-bulb temperature',
        why: 'On a fixed-orifice system, target superheat is a function of indoor wet bulb and outdoor dry bulb. Without both, a superheat number cannot be judged high or low.',
      });
    }
  }

  if (superheat !== null) {
    const evalSh = evaluateSuperheat(superheat, targetSuperheat, input.meteringDevice, input.mode);
    derived.push({
      key: 'superheat',
      label: 'Superheat',
      value: superheat,
      unit: '°F',
      target: evalSh.target,
      severity: evalSh.severity,
      mustVerify: !suctionSatVerified && satMustVerify,
      explanation: evalSh.explanation,
    });
    findings.push(...evalSh.findings);
  }

  if (targetSuperheat !== null) {
    derived.push({
      key: 'target_superheat',
      label: 'Target superheat',
      value: targetSuperheat,
      unit: '°F',
      severity: 'NORMAL',
      mustVerify: true,
      explanation:
        'Approximation of the manufacturer charge chart from indoor wet bulb and outdoor dry bulb. Use the chart on the unit when one is present — it takes precedence over this estimate.',
    });
  }

  if (subcooling !== null) {
    const evalSc = evaluateSubcooling(
      subcooling,
      numeric(input.targetSubcoolF),
      input.meteringDevice,
    );
    derived.push({
      key: 'subcooling',
      label: 'Subcooling',
      value: subcooling,
      unit: '°F',
      target: evalSc.target,
      severity: evalSc.severity,
      mustVerify: !liquidSatVerified && satMustVerify,
      explanation: evalSc.explanation,
    });
    findings.push(...evalSc.findings);
  }

  // ---- Combined superheat/subcooling interpretation -----------------------
  if (superheat !== null && subcooling !== null && input.mode !== 'HEATING') {
    findings.push(
      ...interpretChargePattern(superheat, subcooling, targetSuperheat, input.meteringDevice),
    );
  }

  // ---- Condenser split ----------------------------------------------------
  if (liquidSat !== null && outdoorDb !== null && input.mode !== 'HEATING') {
    const split = round1(liquidSat - outdoorDb);
    const high = input.highEfficiency ? 20 : 30;
    const low = input.highEfficiency ? 8 : 12;
    const severity: Severity =
      split > high + 10 ? 'CRITICAL' : split > high || split < low ? 'ABNORMAL' : 'NORMAL';
    derived.push({
      key: 'condenser_split',
      label: 'Condenser split (liquid sat − outdoor air)',
      value: split,
      unit: '°F',
      target: {
        low,
        high,
        basis: input.highEfficiency
          ? 'High-efficiency condenser, larger coil surface'
          : 'Standard-efficiency condenser',
      },
      severity,
      mustVerify: !liquidSatVerified && satMustVerify,
      explanation:
        'How hard the condenser is working to reject heat. A wide split means the coil cannot reject heat — dirty coil, failing fan, recirculation, overcharge or non-condensables.',
    });
    if (split > high) {
      findings.push({
        key: 'condenser_split_high',
        label: 'High condenser split',
        severity: severity === 'CRITICAL' ? 'CRITICAL' : 'ABNORMAL',
        detail: `Liquid saturation is ${split} °F above outdoor ambient (expected ${low}–${high} °F). The condenser is not rejecting heat properly.`,
        confidence: 0.8,
      });
    } else if (split < low) {
      findings.push({
        key: 'condenser_split_low',
        label: 'Low condenser split',
        severity: 'ABNORMAL',
        detail: `Liquid saturation is only ${split} °F above outdoor ambient (expected ${low}–${high} °F). Low heat of rejection — often low charge or a compressor not pumping.`,
        confidence: 0.7,
      });
    }
  } else if (outdoorDb === null && input.mode !== 'HEATING') {
    missing.push({
      key: 'outdoor_db',
      label: 'Outdoor dry-bulb temperature',
      why: 'Head pressure cannot be called high or low without the ambient it is working against. 325 psig on R-410A is normal at 95 °F and a problem at 70 °F.',
    });
  }

  // ---- Evaporator TD and air-side split -----------------------------------
  if (returnDb !== null && suctionSat !== null && input.mode !== 'HEATING') {
    const evapTd = round1(returnDb - suctionSat);
    const severity: Severity = evapTd > 45 ? 'ABNORMAL' : evapTd < 25 ? 'ABNORMAL' : 'NORMAL';
    derived.push({
      key: 'evaporator_td',
      label: 'Evaporator TD (return air − suction sat)',
      value: evapTd,
      unit: '°F',
      target: { low: 25, high: 45, basis: 'Typical comfort-cooling evaporator TD' },
      severity,
      mustVerify: !suctionSatVerified && satMustVerify,
      explanation:
        'A wide TD means the coil is starved of air or refrigerant; a narrow TD means the coil is flooded or the load is very high.',
    });
    if (evapTd > 45) {
      findings.push({
        key: 'evap_td_high',
        label: 'Wide evaporator TD',
        severity: 'ABNORMAL',
        detail: `Return air is ${evapTd} °F above the suction saturation temperature. Either airflow across the coil is low or the coil is being starved of refrigerant.`,
        confidence: 0.75,
      });
    }
  }

  if (returnDb !== null && numeric(input.supplyDbF) !== null) {
    const deltaT = round1(returnDb - input.supplyDbF!);
    const spread = returnWb !== null ? round1(returnDb - returnWb) : null;
    const target = targetDeltaTRange(spread);
    const severity: Severity =
      deltaT > target.high + 4 || deltaT < target.low - 4
        ? 'ABNORMAL'
        : deltaT > target.high || deltaT < target.low
          ? 'WATCH'
          : 'NORMAL';
    derived.push({
      key: 'delta_t',
      label: 'Air-side ΔT (return − supply, dry bulb)',
      value: deltaT,
      unit: '°F',
      target,
      severity,
      mustVerify: true,
      explanation:
        'A screening check only. ΔT depends on indoor humidity, and it cannot tell low airflow from low capacity on its own — confirm with total external static pressure before calling an airflow problem.',
    });
    if (deltaT > target.high) {
      findings.push({
        key: 'delta_t_high',
        label: 'High air-side ΔT',
        severity,
        detail: `ΔT of ${deltaT} °F against a screening target of ${target.low}–${target.high} °F. Classic low-airflow signature. Confirm with total external static pressure — do not call it on ΔT alone.`,
        confidence: 0.6,
      });
    } else if (deltaT < target.low) {
      findings.push({
        key: 'delta_t_low',
        label: 'Low air-side ΔT',
        severity,
        detail: `ΔT of ${deltaT} °F against a screening target of ${target.low}–${target.high} °F. Points to low capacity — charge, compressor, or excess airflow.`,
        confidence: 0.6,
      });
    }
    if (spread === null) {
      missing.push({
        key: 'return_wet_bulb',
        label: 'Return-air wet bulb (or dry bulb + RH)',
        why: 'The ΔT target moves with indoor humidity. A humid return removes latent heat, so a correct system reads a lower ΔT. Without wet bulb, the ΔT target is a wide guess.',
      });
    }
  }

  // ---- Compression ratio --------------------------------------------------
  if (suctionPsig !== null && liquidPsig !== null) {
    const suctionAbs = suctionPsig + 14.7;
    const liquidAbs = liquidPsig + 14.7;
    if (suctionAbs > 0) {
      const cr = round1(liquidAbs / suctionAbs);
      const severity: Severity = cr > 10 ? 'CRITICAL' : cr > 7 ? 'ABNORMAL' : 'NORMAL';
      derived.push({
        key: 'compression_ratio',
        label: 'Compression ratio (absolute)',
        value: cr,
        unit: ':1',
        target: { low: 2, high: 7, basis: 'Typical comfort-cooling range' },
        severity,
        mustVerify: satMustVerify,
        explanation:
          'High compression ratio raises discharge temperature and drops volumetric efficiency. Sustained ratios above about 10:1 shorten compressor life.',
      });
      if (cr > 10) {
        findings.push({
          key: 'compression_ratio_high',
          label: 'Very high compression ratio',
          severity: 'CRITICAL',
          detail: `${cr}:1. Discharge temperature will be climbing and the compressor is at risk. Find the cause before running the system further.`,
          confidence: 0.85,
        });
      }
    }
  }

  // ---- Discharge line -----------------------------------------------------
  const discharge = numeric(input.dischargeLineTempF);
  if (discharge !== null) {
    const severity: Severity = discharge > 225 ? 'CRITICAL' : discharge > 200 ? 'ABNORMAL' : 'NORMAL';
    derived.push({
      key: 'discharge_temp',
      label: 'Discharge line temperature',
      value: discharge,
      unit: '°F',
      target: { low: 100, high: 200, basis: 'Typical safe operating band, measured ~6 in from the compressor' },
      severity,
      mustVerify: false,
      explanation:
        'Oil breaks down above roughly 225 °F at the discharge line, which corresponds to a much higher internal temperature. Confirm the limit for the specific compressor.',
    });
    if (discharge > 225) {
      findings.push({
        key: 'discharge_temp_high',
        label: 'Discharge temperature above safe limit',
        severity: 'CRITICAL',
        detail: `${discharge} °F at the discharge line. Oil breakdown territory. Shut the system down and find the cause — high compression ratio, low charge with high superheat, or non-condensables.`,
        confidence: 0.9,
      });
    }
    if (superheat !== null && superheat < 5 && discharge < 120) {
      findings.push({
        key: 'floodback_risk',
        label: 'Liquid floodback indicators',
        severity: 'CRITICAL',
        detail: `Superheat of ${superheat} °F with a discharge line at ${discharge} °F. Liquid refrigerant is very likely reaching the compressor. Stop the compressor before it washes the bearings out.`,
        confidence: 0.8,
      });
    }
  }

  // ---- Non-condensables screen -------------------------------------------
  if (
    subcooling !== null &&
    liquidSat !== null &&
    outdoorDb !== null &&
    subcooling >= 5 &&
    subcooling <= 15 &&
    liquidSat - outdoorDb > (input.highEfficiency ? 25 : 33)
  ) {
    findings.push({
      key: 'noncondensables_suspected',
      label: 'Possible non-condensables in the system',
      severity: 'ABNORMAL',
      detail:
        'Head pressure is high but subcooling is in range, which is not what an overcharge looks like. If the condenser is clean and the fan moves rated air, air in the system is a real candidate — especially if it was opened and not evacuated to 500 microns with a decay test.',
      confidence: 0.5,
    });
  }

  return { derived, findings, missing: dedupeMissing(missing), conversions, notes };
}

/**
 * Fixed-orifice target superheat.
 *
 * Approximation of the manufacturer charge chart:
 *   target = (3 * indoor wet bulb - 80 - outdoor dry bulb) / 2
 * Clamped to 5–35 °F because the correlation degrades badly at the extremes.
 * The chart printed on the unit always wins over this estimate.
 */
export function targetSuperheatFixedOrifice(indoorWbF: number, outdoorDbF: number): number {
  const raw = (3 * indoorWbF - 80 - outdoorDbF) / 2;
  return round1(Math.min(35, Math.max(5, raw)));
}

/**
 * Screening range for air-side ΔT, as a function of the return-air dry
 * bulb/wet bulb spread. A drier return (wide spread) does more sensible work
 * and reads a higher ΔT.
 */
export function targetDeltaTRange(spreadF: number | null): {
  low: number;
  high: number;
  basis: string;
} {
  if (spreadF === null) {
    return {
      low: 16,
      high: 22,
      basis: 'Generic range — no wet bulb supplied, so this is a wide screening band only',
    };
  }
  const center = 14 + 0.55 * spreadF;
  return {
    low: round1(center - 3),
    high: round1(center + 3),
    basis: `Return-air DB/WB spread of ${round1(spreadF)} °F`,
  };
}

function evaluateSuperheat(
  superheat: number,
  target: number | null,
  device: MeteringDevice,
  mode: SystemMode,
): {
  severity: Severity;
  target?: { low: number; high: number; basis: string };
  explanation: string;
  findings: CircuitFinding[];
} {
  const findings: CircuitFinding[] = [];

  if (superheat < 0) {
    findings.push({
      key: 'superheat_negative',
      label: 'Negative superheat',
      severity: 'CRITICAL',
      detail:
        'The suction line is colder than the saturation temperature, which is not physically possible in a healthy circuit. Either liquid is being returned to the compressor or a probe is misplaced. Verify the probe location and insulation before doing anything else.',
      confidence: 0.9,
    });
  }

  if (device === 'TXV' || device === 'EEV') {
    const band = { low: 8, high: 14, basis: 'Typical TXV/EEV superheat setting' };
    const severity: Severity =
      superheat < 3 || superheat > 25 ? 'CRITICAL' : superheat < band.low || superheat > band.high ? 'ABNORMAL' : 'NORMAL';
    if (superheat > band.high) {
      findings.push({
        key: 'superheat_high',
        label: 'High superheat',
        severity,
        detail: `${superheat} °F against a typical ${band.low}–${band.high} °F TXV setting. The evaporator is being starved. Charge, restriction and a failed/misadjusted valve all produce this — subcooling separates them.`,
        confidence: 0.85,
      });
    } else if (superheat < band.low) {
      findings.push({
        key: 'superheat_low',
        label: 'Low superheat',
        severity,
        detail: `${superheat} °F against a typical ${band.low}–${band.high} °F TXV setting. The coil is being overfed — overcharge, a valve stuck open, a lost sensing-bulb charge, or low load/airflow.`,
        confidence: 0.85,
      });
    }
    return {
      severity,
      target: band,
      explanation:
        'A TXV meters to maintain superheat, so on a correctly operating valve superheat should stay near its setting across a wide range of conditions. Superheat outside the band is a valve problem, a feed problem, or a load problem — not by itself a charge verdict. Charge a TXV system by subcooling.',
      findings,
    };
  }

  if (device === 'FIXED_ORIFICE' || device === 'CAPILLARY') {
    if (target === null) {
      return {
        severity: 'WATCH',
        explanation:
          'On a fixed orifice, superheat floats with load. It cannot be judged without a target computed from indoor wet bulb and outdoor dry bulb.',
        findings,
      };
    }
    const band = { low: round1(target - 5), high: round1(target + 5), basis: `Target ${target} °F from the charge-chart approximation` };
    const severity: Severity =
      superheat > band.high + 10 || superheat < 3
        ? 'CRITICAL'
        : superheat > band.high || superheat < band.low
          ? 'ABNORMAL'
          : 'NORMAL';
    if (superheat > band.high) {
      findings.push({
        key: 'superheat_high',
        label: 'Superheat above target',
        severity,
        detail: `${superheat} °F against a target of about ${target} °F. On a fixed orifice this is the undercharge/restriction signature — but low indoor airflow also raises superheat, so airflow has to be ruled out first.`,
        confidence: 0.8,
      });
    } else if (superheat < band.low) {
      findings.push({
        key: 'superheat_low',
        label: 'Superheat below target',
        severity,
        detail: `${superheat} °F against a target of about ${target} °F. Overcharge or low load. Below about 5 °F, liquid is reaching the compressor.`,
        confidence: 0.8,
      });
    }
    return {
      severity,
      target: band,
      explanation:
        'A fixed orifice does not regulate superheat, so superheat moves with both charge and load. That is why the target is computed from the actual indoor wet bulb and outdoor dry bulb rather than being a fixed number.',
      findings,
    };
  }

  return {
    severity: 'WATCH',
    explanation:
      'The metering device is unknown. Superheat cannot be judged yet — a TXV system is charged by subcooling and a fixed-orifice system by superheat, and the acceptable superheat differs. Identify the metering device before interpreting this reading.',
    findings,
  };
}

function evaluateSubcooling(
  subcooling: number,
  nameplateTarget: number | null,
  device: MeteringDevice,
): {
  severity: Severity;
  target?: { low: number; high: number; basis: string };
  explanation: string;
  findings: CircuitFinding[];
} {
  const findings: CircuitFinding[] = [];
  const center = nameplateTarget ?? 10;
  const band = {
    low: round1(center - 3),
    high: round1(center + 3),
    basis: nameplateTarget
      ? `Nameplate target ${nameplateTarget} °F`
      : 'Generic 8–13 °F band — read the target off the unit nameplate, it is manufacturer specific',
  };
  const severity: Severity =
    subcooling < 1 || subcooling > center + 12
      ? 'CRITICAL'
      : subcooling < band.low || subcooling > band.high
        ? 'ABNORMAL'
        : 'NORMAL';

  if (subcooling < band.low) {
    findings.push({
      key: 'subcooling_low',
      label: 'Low subcooling',
      severity,
      detail: `${subcooling} °F against ${band.low}–${band.high} °F. Not enough liquid stacked in the condenser. Undercharge is the leading explanation, but a compressor that is not pumping produces the same reading.`,
      confidence: 0.85,
    });
  } else if (subcooling > band.high) {
    findings.push({
      key: 'subcooling_high',
      label: 'High subcooling',
      severity,
      detail: `${subcooling} °F against ${band.low}–${band.high} °F. Liquid is stacking in the condenser — overcharge, a restriction downstream, or a metering device that will not open.`,
      confidence: 0.85,
    });
  }

  return {
    severity,
    target: band,
    explanation:
      device === 'TXV' || device === 'EEV'
        ? 'Subcooling is the charging metric on a TXV/EEV system. Take the target from the unit nameplate or charging chart, not from a rule of thumb.'
        : 'On a fixed orifice, subcooling is a supporting reading rather than the charging metric, but it is what separates an undercharge from a liquid-line restriction.',
    findings,
  };
}

/**
 * The classic superheat/subcooling matrix. Every entry is a *hypothesis
 * pointer*, not a verdict — it tells the engine which explanations the pattern
 * supports and which test separates them.
 */
function interpretChargePattern(
  superheat: number,
  subcooling: number,
  targetSuperheat: number | null,
  device: MeteringDevice,
): CircuitFinding[] {
  const shTarget = targetSuperheat ?? (device === 'TXV' || device === 'EEV' ? 11 : 12);
  const shHigh = superheat > shTarget + 5;
  const shLow = superheat < shTarget - 5;
  const scHigh = subcooling > 13;
  const scLow = subcooling < 7;

  if (shHigh && scLow) {
    return [
      {
        key: 'pattern_high_sh_low_sc',
        label: 'High superheat with low subcooling',
        severity: 'ABNORMAL',
        detail:
          'Not enough refrigerant is reaching the evaporator and there is no liquid stacked in the condenser. That points to undercharge — but a compressor that is not pumping and a badly restricted indoor airflow can imitate it. Confirm with a standing/running amp draw and a total external static pressure before recovering or adding refrigerant. If the charge is low, find the leak; topping off a leaking system is not a repair.',
        confidence: 0.8,
      },
    ];
  }
  if (shHigh && scHigh) {
    return [
      {
        key: 'pattern_high_sh_high_sc',
        label: 'High superheat with high subcooling',
        severity: 'ABNORMAL',
        detail:
          'Liquid is stacking in the condenser while the evaporator is starved. That is a restriction between the two — a plugged filter drier, a kinked or restricted liquid line, or a metering device that will not open. Feel for a temperature drop across the drier: any measurable split across it, or frost/sweat on the outlet, is a restriction.',
        confidence: 0.85,
      },
    ];
  }
  if (shLow && scHigh) {
    return [
      {
        key: 'pattern_low_sh_high_sc',
        label: 'Low superheat with high subcooling',
        severity: 'ABNORMAL',
        detail:
          'The system is holding more refrigerant than the circuit needs. Overcharge is the leading explanation; on a TXV system a valve overfeeding can look similar. Verify the charge against the nameplate before recovering — an incorrect line-set length allowance also produces this.',
        confidence: 0.8,
      },
    ];
  }
  if (shLow && scLow) {
    return [
      {
        key: 'pattern_low_sh_low_sc',
        label: 'Low superheat with low subcooling',
        severity: 'ABNORMAL',
        detail:
          'The metering device is overfeeding the evaporator without liquid backing up in the condenser. On a TXV, suspect a valve stuck open or a sensing bulb that has lost contact or charge. Also consider a compressor that is not pumping — it produces low readings on both sides. Check the bulb mounting and insulation before condemning the valve.',
        confidence: 0.7,
      },
    ];
  }
  return [
    {
      key: 'pattern_charge_normal',
      label: 'Superheat and subcooling both in range',
      severity: 'NORMAL',
      detail:
        'The refrigerant charge and the metering device are behaving. If the complaint is still present, the cause is on the air side, the electrical side, or in the load — not in the charge. Do not adjust charge to chase a symptom the charge is not causing.',
      confidence: 0.75,
    },
  ];
}

function dedupeMissing(items: CircuitAnalysis['missing']): CircuitAnalysis['missing'] {
  const seen = new Set<string>();
  return items.filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)));
}

function numeric(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
