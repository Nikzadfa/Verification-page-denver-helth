/**
 * Carrier / Bryant model and serial decoding.
 *
 * Carrier is the reference implementation for the decoder registry, so this
 * file is deliberately more thorough than the others.
 *
 * Two things are true at once and both are reflected in the output:
 *
 *  1. The leading two-digit product family code is stable and well documented
 *    across decades of Carrier literature (58 = gas furnace, 24 = A/C, and so
 *    on). Those are marked DECODED.
 *
 *  2. Everything after the family code — efficiency tier, staging, cabinet
 *    width, coil match — moved between product generations. Those are marked
 *    INFERRED or left UNKNOWN rather than presented as fact.
 *
 * Bryant is Carrier's sister brand and uses the same family codes with
 * different marketing prefixes, so the same decoder serves both.
 */

import { type DecodedModel, type ModelDecoder, unknownField } from './types';

/** Carrier/Bryant leading product family codes. */
const FAMILY: Record<string, { type: string; fuel?: string; note?: string }> = {
  '58': { type: 'Gas furnace', fuel: 'Natural gas or LP (check the rating plate and the orifice/conversion kit)' },
  '59': { type: 'Gas furnace (condensing, later generations)', fuel: 'Natural gas or LP' },
  '24': { type: 'Split-system air conditioner (outdoor condensing unit)', fuel: 'Electric' },
  '25': { type: 'Split-system heat pump (outdoor unit)', fuel: 'Electric' },
  '38': { type: 'Split-system air conditioner (outdoor condensing unit)', fuel: 'Electric' },
  '40': { type: 'Fan coil / air handler', fuel: 'Electric' },
  '42': { type: 'Fan coil unit', fuel: 'Electric' },
  '48': { type: 'Packaged unit, gas heat / electric cooling', fuel: 'Natural gas or LP' },
  '50': { type: 'Packaged unit, electric cooling (and heat pump variants)', fuel: 'Electric' },
  '30': { type: 'Chiller', fuel: 'Electric' },
  '19': { type: 'Centrifugal chiller', fuel: 'Electric' },
  '23': { type: 'Centrifugal chiller', fuel: 'Electric' },
  '39': { type: 'Air handling unit (commercial)', fuel: 'Electric' },
  '62': { type: 'Packaged rooftop / dedicated outdoor air', fuel: 'Varies' },
  'CA': { type: 'Condensing unit (Bryant/Carrier alpha-prefixed line)', fuel: 'Electric' },
  'CH': { type: 'Heat pump (alpha-prefixed line)', fuel: 'Electric' },
};

/**
 * Gas furnace input, MBH, from the three digits that follow the family and
 * series letters on 58-series model numbers (e.g. 58MVC080 -> 80,000 BTU/h).
 */
const FURNACE_INPUTS = new Set([40, 45, 60, 66, 70, 80, 88, 90, 100, 110, 120, 130, 140, 154]);

function decodeCarrierSerial(serial: string): {
  year: number | null;
  week: number | null;
  note: string;
} {
  const s = serial.trim().toUpperCase().replace(/[\s-]/g, '');

  // The long-standing Carrier residential format leads with WWYY: two digits
  // of manufacturing week followed by two digits of year.
  const m = s.match(/^(\d{2})(\d{2})/);
  if (!m) {
    return {
      year: null,
      week: null,
      note: 'This serial number does not start with the four digits Carrier normally uses for week and year. Carrier has used several serial formats; read the manufacturing date off the rating plate if it is printed there.',
    };
  }

  const week = Number(m[1]);
  const yy = Number(m[2]);
  if (week < 1 || week > 53) {
    return {
      year: null,
      week: null,
      note: `The first two digits ("${m[1]}") are not a valid week number, so this serial is probably in a different format. Do not rely on a decoded age here.`,
    };
  }

  // Two-digit year is inherently ambiguous. Resolve to the most recent
  // plausible year that is not in the future, and say the assumption out loud.
  const currentYear = new Date().getFullYear();
  const century = 2000 + yy <= currentYear ? 2000 : 1900;
  const year = century + yy;

  return {
    year,
    week,
    note: `Week ${week} of ${year}, read from the first four digits of the serial. A two-digit year is ambiguous — ${year} is the most recent plausible reading, but a unit older than about 25 years could also be ${year - 100}. Cross-check against the equipment's apparent age.`,
  };
}

export const carrierDecoder: ModelDecoder = {
  slug: 'carrier',
  brands: ['Carrier', 'Bryant'],
  matches: (m) => {
    const u = m.trim().toUpperCase();
    return /^(58|59|24|25|38|40|42|48|50|30|19|23|39|62)[A-Z]/.test(u) || /^(CA|CH)\d/.test(u);
  },
  decode: (modelNumber, serialNumber): Partial<DecodedModel> => {
    const u = modelNumber.trim().toUpperCase().replace(/\s/g, '');
    const familyKey = /^\d/.test(u) ? u.slice(0, 2) : u.slice(0, 2);
    const family = FAMILY[familyKey];
    const warnings: string[] = [];
    const extras: DecodedModel['extras'] = [];

    // Series letters between the family code and the capacity digits.
    const seriesMatch = u.match(/^(?:[0-9]{2}|[A-Z]{2})([A-Z]+)/);
    const seriesLetters = seriesMatch?.[1] ?? '';
    const seriesKey = familyKey + seriesLetters;

    const result: Partial<DecodedModel> = {
      manufacturer: {
        label: 'Manufacturer',
        value: 'Carrier / Bryant',
        basis: 'INFERRED',
        confidence: 0.7,
        evidence: `Family code "${familyKey}" follows Carrier nomenclature`,
        note: 'Carrier and Bryant share engineering and use the same family codes, so the model number alone does not separate them. The rating plate names the brand.',
      },
      equipmentType: family
        ? {
            label: 'Equipment type',
            value: family.type,
            basis: 'DECODED',
            confidence: 0.9,
            evidence: `Family code "${familyKey}"`,
          }
        : unknownField('Equipment type', `Family code "${familyKey}" is not in the Carrier family table.`),
      series: seriesKey
        ? {
            label: 'Series',
            value: seriesKey,
            basis: 'DECODED',
            confidence: 0.85,
            evidence: `"${seriesKey}" — this is the key that scopes fault codes and service literature for this unit`,
          }
        : unknownField('Series'),
      fuelType: family?.fuel
        ? {
            label: 'Fuel type',
            value: family.fuel,
            basis: 'DECODED',
            confidence: 0.85,
            evidence: `Family code "${familyKey}"`,
          }
        : unknownField('Fuel type'),
      extras,
      warnings,
    };

    // --- Capacity ----------------------------------------------------------
    const isFurnace = familyKey === '58' || familyKey === '59';
    const digits = u.match(/^(?:[0-9]{2}|[A-Z]{2})[A-Z]+(\d{2,3})/);

    if (isFurnace && digits) {
      const raw = Number(digits[1]);
      const mbh = raw;
      if (FURNACE_INPUTS.has(mbh)) {
        result.nominalBtuh = {
          label: 'Nominal input',
          value: mbh * 1000,
          basis: 'DECODED',
          confidence: 0.85,
          evidence: `"${digits[1]}" after the series letters`,
          note: 'This is INPUT, not output. Output depends on the furnace AFUE and, at altitude, on the required derate. Clock the gas meter to confirm actual input.',
        };
        result.nominalTons = unknownField<number>(
          'Approximate tonnage',
          'Tonnage does not apply to a furnace. The cooling capacity of this system is set by the outdoor unit and the matched coil.',
        );
      } else {
        result.nominalBtuh = {
          label: 'Nominal input',
          value: mbh * 1000,
          basis: 'INFERRED',
          confidence: 0.45,
          evidence: `"${digits[1]}" after the series letters`,
          note: `${mbh} MBH is not one of the standard Carrier furnace inputs, so this reading may be picking up something other than capacity. Confirm on the rating plate.`,
        };
      }
    } else if (digits) {
      const raw = Number(digits[1]);
      // Cooling equipment encodes capacity in MBH; 036 = 3 tons.
      if (raw >= 18 && raw <= 150 && raw % 6 === 0) {
        result.nominalBtuh = {
          label: 'Nominal capacity',
          value: raw * 1000,
          basis: 'DECODED',
          confidence: 0.8,
          evidence: `"${digits[1]}" after the series letters`,
        };
        result.nominalTons = {
          label: 'Approximate tonnage',
          value: Math.round((raw / 12) * 2) / 2,
          basis: 'DECODED',
          confidence: 0.8,
          evidence: `"${digits[1]}" = ${raw},000 BTU/h nominal`,
          note: 'Nominal tonnage. Rated capacity depends on the matched indoor coil and the operating conditions.',
        };
      }
    }

    // --- Efficiency tier ---------------------------------------------------
    // Carrier's series letters correlate with product tier, but the mapping
    // changed across generations, so this is INFERRED at best.
    if (seriesLetters) {
      const tier =
        /^(MVC|MVP|TAV|VC|VP)/.test(seriesLetters)
          ? 'Variable-speed / modulating (Infinity or Evolution tier)'
          : /^(TP|DVA|CVA)/.test(seriesLetters)
            ? 'Two-stage (Performance tier)'
            : /^(STA|PAV|SVA)/.test(seriesLetters)
              ? 'Single-stage (Comfort tier)'
              : null;
      if (tier) {
        result.efficiencyTier = {
          label: 'Efficiency / staging tier',
          value: tier,
          basis: 'INFERRED',
          confidence: 0.5,
          evidence: `Series letters "${seriesLetters}"`,
          note: 'Carrier reused series letters across product generations with different meanings. Treat this as a lead, not a specification.',
        };
      }
    }

    // --- Refrigerant -------------------------------------------------------
    // Deliberately NOT inferred from the model number. Carrier changed
    // refrigerant mid-production on several lines, and the consequence of
    // getting it wrong is a destroyed system.
    result.refrigerant = unknownField<string>(
      'Refrigerant',
      'Carrier does not reliably encode refrigerant in the model number, and several lines changed refrigerant mid-production. Read it off the nameplate.',
    );

    // --- Serial / age ------------------------------------------------------
    if (serialNumber) {
      const { year, week, note } = decodeCarrierSerial(serialNumber);
      if (year) {
        const age = new Date().getFullYear() - year;
        result.manufacturedYear = {
          label: 'Manufactured year',
          value: year,
          basis: 'ESTIMATED',
          confidence: 0.65,
          evidence: `Serial "${serialNumber.slice(0, 4)}" = week ${week}, year ${String(year).slice(2)}`,
          note,
        };
        result.approximateAgeYears = {
          label: 'Approximate age',
          value: age,
          basis: 'ESTIMATED',
          confidence: 0.65,
          evidence: `${new Date().getFullYear()} − ${year}`,
          note: 'Manufacturing date, not installation date. Equipment can sit in a warehouse for a year or more before it goes in.',
        };
      } else {
        result.manufacturedYear = unknownField<number>('Manufactured year', note);
        result.approximateAgeYears = unknownField<number>('Approximate age', note);
      }
    }

    // --- Voltage -----------------------------------------------------------
    const voltageMatch = u.match(/-([1-9])(?:-|$)/) ?? u.match(/([13])$/);
    if (voltageMatch) {
      extras.push({
        label: 'Voltage/phase code',
        value: voltageMatch[1]!,
        basis: 'INFERRED',
        confidence: 0.35,
        evidence: `Trailing digit "${voltageMatch[1]}"`,
        note: 'Carrier encodes voltage and phase in a trailing position on many lines, but the position and the code table differ between families. Read the supply voltage off the rating plate.',
      });
    }

    if (familyKey === '58' || familyKey === '59') {
      extras.push({
        label: 'Fault-code scope',
        value: seriesKey || familyKey,
        basis: 'DECODED',
        confidence: 0.8,
        note: 'Carrier furnace status codes are specific to the control board fitted, not to the brand. Two furnaces in the same series can carry different boards. Get the board part number off the label in the control compartment before interpreting a code.',
      });
    }

    return result;
  },
};

export { decodeCarrierSerial };
