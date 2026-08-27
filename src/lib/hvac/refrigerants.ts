/**
 * Refrigerant pressure/temperature relationships.
 *
 * ---------------------------------------------------------------------------
 * DATA QUALITY — READ THIS BEFORE TRUSTING A NUMBER FROM THIS MODULE
 * ---------------------------------------------------------------------------
 * The tables below are FIELD APPROXIMATIONS assembled from public service
 * literature. They are accurate enough to tell "low charge" from "restriction"
 * but they are NOT a substitute for the refrigerant manufacturer's P/T chart,
 * and they are not traceable to a NIST/REFPROP dataset.
 *
 * Two consequences are enforced by the rest of the codebase:
 *
 *  1. Every conversion returns a `quality` flag and a `mustVerify` boolean.
 *     The UI renders a "verify against your P/T chart" note whenever
 *     `mustVerify` is true, and the AI narration layer is contractually
 *     forbidden (see src/lib/ai/prompts.ts) from stating a converted
 *     saturation temperature as a manufacturer specification.
 *
 *  2. The diagnostic engine PREFERS a technician-entered saturation
 *     temperature over a converted one. Modern digital manifolds display
 *     saturation directly; when the tech gives us that value we never touch
 *     these tables. See src/lib/hvac/superheat.ts.
 *
 * To replace this data with an authoritative dataset, overwrite the `points`
 * arrays and set `quality: 'REFERENCE'`. The unit tests in
 * tests/refrigerants.test.ts check structural invariants (monotonicity, glide
 * sign, dew >= bubble) so a bad paste fails loudly.
 * ---------------------------------------------------------------------------
 *
 * All pressures are PSIG at sea level. All temperatures are °F.
 */

export type RefrigerantId =
  | 'R-22'
  | 'R-410A'
  | 'R-32'
  | 'R-454B'
  | 'R-134a'
  | 'R-404A'
  | 'R-407C'
  | 'R-448A'
  | 'R-449A';

export const REFRIGERANT_IDS: RefrigerantId[] = [
  'R-22',
  'R-410A',
  'R-32',
  'R-454B',
  'R-134a',
  'R-404A',
  'R-407C',
  'R-448A',
  'R-449A',
];

export type DataQuality = 'REFERENCE' | 'FIELD_APPROXIMATION';

/** One row of a P/T table. For blends, bubble = liquid line, dew = vapor line. */
export interface PtPoint {
  tempF: number;
  bubblePsig: number;
  dewPsig: number;
}

export type SafetyClass = 'A1' | 'A2L' | 'A3' | 'B1' | 'B2L';

export interface Refrigerant {
  id: RefrigerantId;
  name: string;
  /** AZEOTROPE/near-azeotrope => glide is negligible and SH/SC use one curve. */
  blend: 'SINGLE_COMPONENT' | 'NEAR_AZEOTROPIC' | 'ZEOTROPIC';
  safetyClass: SafetyClass;
  /** Mildly flammable (A2L) refrigerants change how a tech may work on a system. */
  flammable: boolean;
  /** Typical glide at mid evaporator temperatures, °F. Informational. */
  nominalGlideF: number;
  quality: DataQuality;
  /** Human-readable provenance shown in the UI next to converted values. */
  sourceNote: string;
  /** Approximate ± tolerance of the table, in °F of saturation temperature. */
  toleranceF: number;
  status: 'CURRENT' | 'PHASE_DOWN' | 'PHASED_OUT';
  notes: string[];
  points: PtPoint[];
}

/** Convenience: build a single-component table where bubble == dew. */
function single(rows: Array<[number, number]>): PtPoint[] {
  return rows.map(([tempF, psig]) => ({ tempF, bubblePsig: psig, dewPsig: psig }));
}

/** Build a zeotropic table from [tempF, bubblePsig, dewPsig] triples. */
function glide(rows: Array<[number, number, number]>): PtPoint[] {
  return rows.map(([tempF, bubblePsig, dewPsig]) => ({ tempF, bubblePsig, dewPsig }));
}

const R22: Refrigerant = {
  id: 'R-22',
  name: 'R-22 (HCFC-22, chlorodifluoromethane)',
  blend: 'SINGLE_COMPONENT',
  safetyClass: 'A1',
  flammable: false,
  nominalGlideF: 0,
  quality: 'FIELD_APPROXIMATION',
  sourceNote: 'Field approximation from public service literature.',
  toleranceF: 2,
  status: 'PHASED_OUT',
  notes: [
    'Production and import ended in the US on 1 Jan 2020. Only reclaimed or previously produced stock may be used for service.',
    'Do not top off an R-22 system with an alternative refrigerant without following the equipment and refrigerant manufacturer retrofit procedure.',
  ],
  points: single([
    [-40, 0.6], [-35, 2.6], [-30, 4.9], [-25, 7.4], [-20, 10.1],
    [-15, 13.2], [-10, 16.5], [-5, 20.1], [0, 24.0], [5, 28.3],
    [10, 32.8], [15, 37.7], [20, 43.0], [25, 48.8], [30, 54.9],
    [35, 61.5], [40, 68.5], [45, 76.0], [50, 84.0], [55, 92.6],
    [60, 101.6], [65, 111.3], [70, 121.4], [75, 132.2], [80, 143.6],
    [85, 155.7], [90, 168.4], [95, 181.8], [100, 195.9], [105, 210.8],
    [110, 226.4], [115, 242.7], [120, 259.9], [125, 277.9], [130, 296.8],
    [135, 316.6], [140, 337.2],
  ]),
};

const R410A: Refrigerant = {
  id: 'R-410A',
  name: 'R-410A (R-32/R-125 50/50)',
  blend: 'NEAR_AZEOTROPIC',
  safetyClass: 'A1',
  flammable: false,
  nominalGlideF: 0.3,
  quality: 'FIELD_APPROXIMATION',
  sourceNote: 'Field approximation from public service literature. Glide under 0.5 °F is treated as zero.',
  toleranceF: 2,
  status: 'PHASE_DOWN',
  notes: [
    'Operates at roughly 50–70% higher pressure than R-22. Use gauges, hoses and recovery equipment rated for R-410A.',
    'Charge liquid only. Vapor charging a near-azeotropic blend can shift composition.',
    'Being phased down under the AIM Act; new residential equipment has moved to A2L refrigerants.',
  ],
  points: single([
    [-40, 10.9], [-35, 14.0], [-30, 17.5], [-25, 21.3], [-20, 25.6],
    [-15, 30.2], [-10, 35.3], [-5, 40.9], [0, 47.0], [5, 53.6],
    [10, 60.8], [15, 68.6], [20, 77.1], [25, 86.2], [30, 96.1],
    [35, 106.7], [40, 118.1], [45, 130.4], [50, 143.6], [55, 157.7],
    [60, 172.8], [65, 189.0], [70, 206.2], [75, 224.5], [80, 244.0],
    [85, 264.7], [90, 286.7], [95, 310.0], [100, 334.7], [105, 360.9],
    [110, 388.6], [115, 417.9], [120, 448.9], [125, 481.6], [130, 516.2],
  ]),
};

const R32: Refrigerant = {
  id: 'R-32',
  name: 'R-32 (difluoromethane)',
  blend: 'SINGLE_COMPONENT',
  safetyClass: 'A2L',
  flammable: true,
  nominalGlideF: 0,
  quality: 'FIELD_APPROXIMATION',
  sourceNote: 'Field approximation from public service literature.',
  toleranceF: 3,
  status: 'CURRENT',
  notes: [
    'A2L — mildly flammable. Follow the equipment manufacturer service procedure, use A2L-rated recovery equipment, and eliminate ignition sources before opening the system.',
    'Discharge temperatures run higher than R-410A. Confirm compressor discharge limits before adjusting charge.',
    'Pressures are close to R-410A but NOT interchangeable. Never mix refrigerants.',
  ],
  points: single([
    [-40, 10.9], [-35, 14.1], [-30, 17.7], [-25, 21.7], [-20, 26.1],
    [-15, 30.9], [-10, 36.2], [-5, 42.0], [0, 48.3], [5, 55.2],
    [10, 62.7], [15, 70.8], [20, 79.6], [25, 89.1], [30, 99.3],
    [35, 110.3], [40, 122.1], [45, 134.8], [50, 148.4], [55, 162.9],
    [60, 178.4], [65, 195.0], [70, 212.6], [75, 231.4], [80, 251.3],
    [85, 272.5], [90, 294.9], [95, 318.7], [100, 343.9], [105, 370.5],
    [110, 398.7], [115, 428.4], [120, 459.8],
  ]),
};

const R454B: Refrigerant = {
  id: 'R-454B',
  name: 'R-454B (R-32/R-1234yf 68.9/31.1)',
  blend: 'ZEOTROPIC',
  safetyClass: 'A2L',
  flammable: true,
  nominalGlideF: 1.5,
  quality: 'FIELD_APPROXIMATION',
  sourceNote: 'Field approximation from public service literature. Glide is small but non-zero — use dew point for superheat and bubble point for subcooling.',
  toleranceF: 3,
  status: 'CURRENT',
  notes: [
    'A2L — mildly flammable. Follow the equipment manufacturer service procedure and use A2L-rated tools, recovery equipment and leak detection.',
    'Zeotropic: charge liquid only, and never top off after a leak without weighing in the full charge per the nameplate.',
    'Use the DEW point for superheat and the BUBBLE point for subcooling.',
  ],
  points: glide([
    [-40, 10.2, 8.9], [-30, 16.7, 15.2], [-20, 24.6, 22.9],
    [-10, 34.0, 32.1], [0, 45.3, 43.1], [10, 58.6, 56.1],
    [20, 74.3, 71.4], [25, 83.1, 80.0], [30, 92.6, 89.3],
    [35, 102.9, 99.4], [40, 113.9, 110.2], [45, 125.8, 121.8],
    [50, 138.6, 134.3], [55, 152.3, 147.7], [60, 167.0, 162.1],
    [65, 182.7, 177.5], [70, 199.5, 193.9], [75, 217.3, 211.4],
    [80, 236.3, 230.0], [85, 256.5, 249.8], [90, 277.9, 270.8],
    [95, 300.6, 293.1], [100, 324.6, 316.7], [105, 350.0, 341.6],
    [110, 376.8, 368.0], [115, 405.1, 395.8], [120, 434.9, 425.1],
  ]),
};

const R134A: Refrigerant = {
  id: 'R-134a',
  name: 'R-134a (tetrafluoroethane)',
  blend: 'SINGLE_COMPONENT',
  safetyClass: 'A1',
  flammable: false,
  nominalGlideF: 0,
  quality: 'FIELD_APPROXIMATION',
  sourceNote: 'Field approximation from public service literature.',
  toleranceF: 2,
  status: 'PHASE_DOWN',
  notes: [
    'Runs in a vacuum below about -15 °F saturation. A system pulling below 0 psig will draw in air and moisture through any leak.',
    'Common in medium-temperature refrigeration, chillers and water coolers.',
  ],
  points: single([
    [-40, -14.7], [-30, -12.4], [-20, -9.2], [-15, -7.2], [-10, -4.9],
    [-5, -2.3], [0, 0.6], [5, 3.8], [10, 7.3], [15, 11.2],
    [20, 15.4], [25, 20.1], [30, 25.1], [35, 30.5], [40, 36.5],
    [45, 42.9], [50, 49.8], [55, 57.2], [60, 65.2], [65, 73.8],
    [70, 83.0], [75, 92.8], [80, 103.3], [85, 114.5], [90, 126.4],
    [95, 139.1], [100, 152.5], [105, 166.8], [110, 181.9], [115, 197.9],
    [120, 214.9], [125, 232.8], [130, 251.7],
  ]),
};

const R404A: Refrigerant = {
  id: 'R-404A',
  name: 'R-404A (R-125/R-143a/R-134a)',
  blend: 'NEAR_AZEOTROPIC',
  safetyClass: 'A1',
  flammable: false,
  nominalGlideF: 0.8,
  quality: 'FIELD_APPROXIMATION',
  sourceNote: 'Field approximation from public service literature.',
  toleranceF: 2,
  status: 'PHASE_DOWN',
  notes: [
    'Low-temperature and medium-temperature commercial refrigeration.',
    'Very high GWP; being replaced by R-448A/R-449A in new equipment. Check local rules before charging.',
  ],
  points: glide([
    [-40, 4.8, 4.3], [-30, 9.9, 9.3], [-20, 16.0, 15.3],
    [-10, 23.4, 22.5], [0, 32.1, 31.1], [10, 42.5, 41.2],
    [20, 54.6, 53.1], [30, 68.8, 67.0], [40, 85.1, 83.0],
    [45, 94.2, 91.9], [50, 104.0, 101.5], [55, 114.4, 111.7],
    [60, 125.6, 122.7], [65, 137.5, 134.4], [70, 150.2, 146.8],
    [75, 163.8, 160.1], [80, 178.2, 174.2], [85, 193.5, 189.2],
    [90, 209.7, 205.1], [95, 226.9, 222.0], [100, 245.1, 239.8],
    [105, 264.4, 258.7], [110, 284.7, 278.7], [115, 306.2, 299.7],
    [120, 328.8, 321.9],
  ]),
};

const R407C: Refrigerant = {
  id: 'R-407C',
  name: 'R-407C (R-32/R-125/R-134a 23/25/52)',
  blend: 'ZEOTROPIC',
  safetyClass: 'A1',
  flammable: false,
  nominalGlideF: 9,
  quality: 'FIELD_APPROXIMATION',
  sourceNote: 'Field approximation from public service literature. Large glide — bubble/dew separation matters.',
  toleranceF: 3,
  status: 'PHASE_DOWN',
  notes: [
    'Large temperature glide (roughly 9–12 °F). Superheat MUST use the dew point and subcooling MUST use the bubble point, or readings will be off by most of the glide.',
    'Charge liquid only. Never top off a leaking R-407C system without recovering and weighing in the nameplate charge — fractionation changes the composition.',
  ],
  points: glide([
    [-40, 3.6, 0.4], [-30, 8.4, 4.5], [-20, 14.1, 9.5],
    [-10, 21.0, 15.4], [0, 29.1, 22.4], [10, 38.7, 30.7],
    [20, 49.9, 40.5], [30, 62.9, 51.8], [40, 77.9, 64.9],
    [45, 86.2, 72.2], [50, 95.0, 79.9], [55, 104.4, 88.2],
    [60, 114.4, 97.0], [65, 125.1, 106.4], [70, 136.5, 116.4],
    [75, 148.6, 127.0], [80, 161.4, 138.3], [85, 175.0, 150.3],
    [90, 189.4, 163.0], [95, 204.7, 176.5], [100, 220.8, 190.7],
    [105, 237.9, 205.8], [110, 255.9, 221.7], [115, 274.9, 238.6],
    [120, 295.0, 256.4],
  ]),
};

const R448A: Refrigerant = {
  id: 'R-448A',
  name: 'R-448A (Solstice N40)',
  blend: 'ZEOTROPIC',
  safetyClass: 'A1',
  flammable: false,
  nominalGlideF: 8,
  quality: 'FIELD_APPROXIMATION',
  sourceNote: 'Field approximation from public service literature. Large glide — bubble/dew separation matters.',
  toleranceF: 3,
  status: 'CURRENT',
  notes: [
    'R-404A replacement for medium- and low-temperature commercial refrigeration.',
    'Roughly 7–9 °F glide. Use dew point for superheat, bubble point for subcooling.',
    'Discharge temperatures run higher than R-404A. Watch compressor discharge limits.',
  ],
  points: glide([
    [-40, 4.2, 0.9], [-30, 9.3, 5.2], [-20, 15.4, 10.4],
    [-10, 22.6, 16.7], [0, 31.1, 24.1], [10, 41.1, 32.9],
    [20, 52.7, 43.1], [30, 66.1, 54.9], [40, 81.5, 68.5],
    [45, 89.9, 76.0], [50, 98.9, 84.0], [55, 108.5, 92.6],
    [60, 118.7, 101.7], [65, 129.5, 111.4], [70, 141.0, 121.7],
    [75, 153.2, 132.6], [80, 166.1, 144.2], [85, 179.7, 156.5],
    [90, 194.1, 169.5], [95, 209.3, 183.3], [100, 225.4, 197.8],
    [105, 242.3, 213.1], [110, 260.1, 229.3], [115, 278.9, 246.4],
    [120, 298.6, 264.4],
  ]),
};

const R449A: Refrigerant = {
  id: 'R-449A',
  name: 'R-449A (Opteon XP40)',
  blend: 'ZEOTROPIC',
  safetyClass: 'A1',
  flammable: false,
  nominalGlideF: 8,
  quality: 'FIELD_APPROXIMATION',
  sourceNote: 'Field approximation from public service literature. Large glide — bubble/dew separation matters.',
  toleranceF: 3,
  status: 'CURRENT',
  notes: [
    'R-404A replacement, performance very close to R-448A.',
    'Roughly 7–9 °F glide. Use dew point for superheat, bubble point for subcooling.',
  ],
  points: glide([
    [-40, 4.3, 1.0], [-30, 9.4, 5.3], [-20, 15.5, 10.6],
    [-10, 22.8, 16.9], [0, 31.4, 24.4], [10, 41.4, 33.2],
    [20, 53.0, 43.4], [30, 66.4, 55.2], [40, 81.8, 68.8],
    [45, 90.2, 76.3], [50, 99.2, 84.3], [55, 108.8, 92.9],
    [60, 119.0, 102.0], [65, 129.8, 111.7], [70, 141.3, 122.0],
    [75, 153.5, 132.9], [80, 166.4, 144.5], [85, 180.0, 156.8],
    [90, 194.4, 169.8], [95, 209.6, 183.6], [100, 225.7, 198.1],
    [105, 242.6, 213.4], [110, 260.4, 229.6], [115, 279.2, 246.7],
    [120, 298.9, 264.7],
  ]),
};

const TABLE: Record<RefrigerantId, Refrigerant> = {
  'R-22': R22,
  'R-410A': R410A,
  'R-32': R32,
  'R-454B': R454B,
  'R-134a': R134A,
  'R-404A': R404A,
  'R-407C': R407C,
  'R-448A': R448A,
  'R-449A': R449A,
};

/** Accepts "410a", "R410A", "r-410-a", "410" and similar tech shorthand. */
export function normalizeRefrigerantId(input: string | null | undefined): RefrigerantId | null {
  if (!input) return null;
  const cleaned = input.trim().toUpperCase().replace(/[\s\-_]/g, '');
  const direct = REFRIGERANT_IDS.find(
    (id) => id.toUpperCase().replace(/[\s\-_]/g, '') === cleaned,
  );
  if (direct) return direct;
  const withR = cleaned.startsWith('R') ? cleaned : `R${cleaned}`;
  const prefixed = REFRIGERANT_IDS.find(
    (id) => id.toUpperCase().replace(/[\s\-_]/g, '') === withR,
  );
  return prefixed ?? null;
}

export function getRefrigerant(id: RefrigerantId): Refrigerant {
  return TABLE[id];
}

export function listRefrigerants(): Refrigerant[] {
  return REFRIGERANT_IDS.map((id) => TABLE[id]);
}

/** Which saturation curve applies to a given measurement. */
export type Curve = 'bubble' | 'dew';

export interface Conversion {
  value: number;
  /** True whenever the value came from these approximate tables. */
  mustVerify: boolean;
  quality: DataQuality;
  /** ± tolerance in the unit of `value`. */
  toleranceF: number;
  /** Set when the input fell outside the table and was clamped. */
  outOfRange: boolean;
  note: string;
}

function interpolate(
  points: PtPoint[],
  curve: Curve,
  key: 'tempF' | 'psig',
  target: number,
): { value: number; outOfRange: boolean } {
  const pick = (p: PtPoint) => (curve === 'bubble' ? p.bubblePsig : p.dewPsig);

  if (key === 'tempF') {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (target <= first.tempF) return { value: pick(first), outOfRange: target < first.tempF };
    if (target >= last.tempF) return { value: pick(last), outOfRange: target > last.tempF };
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      if (target >= a.tempF && target <= b.tempF) {
        const span = b.tempF - a.tempF;
        const f = span === 0 ? 0 : (target - a.tempF) / span;
        return { value: pick(a) + f * (pick(b) - pick(a)), outOfRange: false };
      }
    }
    return { value: pick(last), outOfRange: true };
  }

  // Pressure -> temperature. Pressure is monotonically increasing with temp.
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (target <= pick(first)) return { value: first.tempF, outOfRange: target < pick(first) };
  if (target >= pick(last)) return { value: last.tempF, outOfRange: target > pick(last) };
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (target >= pick(a) && target <= pick(b)) {
      const span = pick(b) - pick(a);
      const f = span === 0 ? 0 : (target - pick(a)) / span;
      return { value: a.tempF + f * (b.tempF - a.tempF), outOfRange: false };
    }
  }
  return { value: last.tempF, outOfRange: true };
}

/**
 * Saturation temperature (°F) for a gauge pressure.
 *
 * `curve` must be 'dew' for anything measured on the suction/low side (that is
 * what superheat is referenced to) and 'bubble' for the liquid line (what
 * subcooling is referenced to). On a zeotropic blend getting this backwards
 * throws the reading off by the full glide.
 */
export function satTempFromPressure(
  id: RefrigerantId,
  psig: number,
  curve: Curve,
): Conversion {
  const r = TABLE[id];
  const { value, outOfRange } = interpolate(r.points, curve, 'psig', psig);
  return {
    value: round1(value),
    mustVerify: r.quality !== 'REFERENCE',
    quality: r.quality,
    toleranceF: r.toleranceF,
    outOfRange,
    note: outOfRange
      ? `${psig} psig is outside the ${r.id} table (${pressureRange(r, curve)}). Value clamped — confirm against a P/T chart before acting on it.`
      : `${r.id} ${curve} point, ±${r.toleranceF} °F. ${r.sourceNote}`,
  };
}

/** Gauge pressure (psig) for a saturation temperature. Inverse of the above. */
export function pressureFromSatTemp(
  id: RefrigerantId,
  tempF: number,
  curve: Curve,
): Conversion {
  const r = TABLE[id];
  const { value, outOfRange } = interpolate(r.points, curve, 'tempF', tempF);
  return {
    value: round1(value),
    mustVerify: r.quality !== 'REFERENCE',
    quality: r.quality,
    toleranceF: r.toleranceF,
    outOfRange,
    note: outOfRange
      ? `${tempF} °F is outside the ${r.id} table. Value clamped — confirm against a P/T chart.`
      : `${r.id} ${curve} point, ±${r.toleranceF} °F. ${r.sourceNote}`,
  };
}

/** Temperature glide at a given saturation temperature, °F (dew − bubble). */
export function glideAt(id: RefrigerantId, tempF: number): number {
  const r = TABLE[id];
  if (r.blend === 'SINGLE_COMPONENT') return 0;
  const bubbleP = interpolate(r.points, 'bubble', 'tempF', tempF).value;
  const dewT = interpolate(r.points, 'dew', 'psig', bubbleP).value;
  return round1(Math.abs(dewT - tempF));
}

function pressureRange(r: Refrigerant, curve: Curve): string {
  const pick = (p: PtPoint) => (curve === 'bubble' ? p.bubblePsig : p.dewPsig);
  const lo = pick(r.points[0]!);
  const hi = pick(r.points[r.points.length - 1]!);
  return `${lo.toFixed(1)}–${hi.toFixed(1)} psig`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Safety and handling notes that must be surfaced whenever a session involves
 * this refrigerant. Returned as hazard ids resolved by src/lib/safety/hazards.ts
 * plus refrigerant-specific prose.
 */
export function refrigerantHazardIds(id: RefrigerantId): string[] {
  const r = TABLE[id];
  const ids = ['refrigerant-handling', 'frostbite', 'epa-608'];
  if (r.flammable) ids.push('a2l-flammable');
  if (id === 'R-410A' || id === 'R-32' || id === 'R-454B') ids.push('high-pressure-system');
  return ids;
}
