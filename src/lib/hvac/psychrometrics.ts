/**
 * Psychrometrics.
 *
 * Unlike the P/T tables, everything here is computed from published
 * correlations rather than recalled data, so the results are reproducible:
 *
 *  - Saturation vapour pressure: Magnus–Tetens over water, valid roughly
 *    -40 °C to +50 °C with better than 0.4% error in the comfort range.
 *  - Wet bulb: numeric solution of the psychrometer equation
 *    e = es(Twb) - A * P * (Tdb - Twb), A = 6.62e-4 /°C for an aspirated
 *    psychrometer at standard pressure.
 *  - Dew point: analytic inverse of Magnus.
 *
 * A technician can also just enter a measured wet bulb; every consumer of this
 * module prefers a measured value over a computed one.
 */

export const STANDARD_PRESSURE_HPA = 1013.25;

export function fToC(f: number): number {
  return (f - 32) * (5 / 9);
}

export function cToF(c: number): number {
  return c * (9 / 5) + 32;
}

/** Saturation vapour pressure over water, hPa, from °C. */
export function saturationVapourPressureHpa(tempC: number): number {
  return 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
}

/** Relative humidity (%) from dry bulb and dew point, both °F. */
export function rhFromDewPoint(dryBulbF: number, dewPointF: number): number {
  const es = saturationVapourPressureHpa(fToC(dryBulbF));
  const e = saturationVapourPressureHpa(fToC(dewPointF));
  return clamp((e / es) * 100, 0, 100);
}

/** Dew point (°F) from dry bulb (°F) and relative humidity (%). */
export function dewPointF(dryBulbF: number, rhPercent: number): number {
  const rh = clamp(rhPercent, 0.5, 100);
  const tC = fToC(dryBulbF);
  const gamma = Math.log(rh / 100) + (17.67 * tC) / (tC + 243.5);
  const dpC = (243.5 * gamma) / (17.67 - gamma);
  return round1(cToF(dpC));
}

/**
 * Wet bulb (°F) from dry bulb (°F) and relative humidity (%).
 * Solved by bisection on the psychrometer equation — always converges because
 * the residual is monotonic in Twb between the dew point and the dry bulb.
 */
export function wetBulbF(
  dryBulbF: number,
  rhPercent: number,
  pressureHpa = STANDARD_PRESSURE_HPA,
): number {
  const rh = clamp(rhPercent, 0.5, 100);
  const tdbC = fToC(dryBulbF);
  const e = (rh / 100) * saturationVapourPressureHpa(tdbC);
  const A = 6.62e-4;

  const residual = (twbC: number) =>
    saturationVapourPressureHpa(twbC) - A * pressureHpa * (tdbC - twbC) - e;

  let lo = fToC(dewPointF(dryBulbF, rh)) - 1;
  let hi = tdbC;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (residual(mid) > 0) hi = mid;
    else lo = mid;
  }
  return round1(cToF((lo + hi) / 2));
}

/**
 * Wet bulb from a dry bulb and a measured dew point — the combination a tech
 * gets from a psychrometer that reports DB/DP.
 */
export function wetBulbFromDewPoint(dryBulbF: number, dewPointFValue: number): number {
  return wetBulbF(dryBulbF, rhFromDewPoint(dryBulbF, dewPointFValue));
}

/**
 * Total heat content of moist air, BTU/lb of dry air, from °F and RH.
 * Used for the enthalpy-based capacity check when a tech has both wet bulbs
 * and a known CFM.
 */
export function enthalpyBtuPerLb(dryBulbF: number, rhPercent: number): number {
  const tC = fToC(dryBulbF);
  const pv = (clamp(rhPercent, 0, 100) / 100) * saturationVapourPressureHpa(tC);
  // Humidity ratio, lb water / lb dry air.
  const w = (0.62198 * pv) / (STANDARD_PRESSURE_HPA - pv);
  return round2(0.24 * dryBulbF + w * (1061 + 0.444 * dryBulbF));
}

/**
 * Sensible capacity, BTU/h, from airflow and dry-bulb split.
 * 1.08 = 60 min/h * 0.075 lb/ft3 * 0.24 BTU/lb·°F at sea level.
 */
export function sensibleBtuh(cfm: number, deltaTF: number): number {
  return Math.round(1.08 * cfm * deltaTF);
}

/**
 * Total capacity, BTU/h, from airflow and enthalpy difference.
 * 4.5 = 60 min/h * 0.075 lb/ft3.
 */
export function totalBtuh(cfm: number, deltaEnthalpy: number): number {
  return Math.round(4.5 * cfm * deltaEnthalpy);
}

/**
 * Altitude correction for air density. Above roughly 2,000 ft the 1.08/4.5
 * constants overstate capacity, and gas furnace input must be derated per the
 * manufacturer's instructions.
 */
export function airDensityRatio(altitudeFt: number): number {
  if (altitudeFt <= 0) return 1;
  return round3(Math.exp(-altitudeFt / 27_500));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
