/**
 * Model-number decoder registry.
 *
 * Adding a manufacturer means adding one entry to DECODERS. The generic
 * cross-brand pass runs for every model number and fills whatever the
 * brand-specific decoder did not, always marked INFERRED so the technician can
 * see the difference.
 */

import {
  type DecodeBasis,
  type DecodedField,
  type DecodedModel,
  type ModelDecoder,
  unknownField,
} from './types';
import { carrierDecoder } from './carrier';

/** Nominal capacity groups that appear in most North American model numbers. */
const MBH_GROUPS: Record<string, number> = {
  '018': 18, '024': 24, '030': 30, '036': 36, '042': 42, '048': 48,
  '060': 60, '072': 72, '084': 84, '090': 90, '096': 96, '120': 120,
};

const TRANE_STYLE: ModelDecoder = {
  slug: 'trane',
  brands: ['Trane', 'American Standard'],
  matches: (m) => /^[24]T[TWEXH][A-Z]?\d/i.test(m) || /^[24][A-Z]{3}\d/i.test(m),
  decode: (m) => {
    const upper = m.toUpperCase();
    const family = upper.slice(0, 4);
    const type = /TTR|TTB|TTA/.test(upper)
      ? 'Split-system air conditioner (condensing unit)'
      : /TWR|TWB|TWA|TWX/.test(upper)
        ? 'Split-system heat pump (outdoor unit)'
        : /TEE|TEM|TEH/.test(upper)
          ? 'Air handler'
          : null;
    return {
      equipmentType: type
        ? { label: 'Equipment type', value: type, basis: 'DECODED', confidence: 0.8, evidence: family }
        : unknownField('Equipment type'),
      series: { label: 'Series', value: family, basis: 'DECODED', confidence: 0.85, evidence: family },
    };
  },
};

const GOODMAN_STYLE: ModelDecoder = {
  slug: 'goodman',
  brands: ['Goodman', 'Amana', 'Daikin'],
  matches: (m) => /^(GSX|GSZ|SSX|SSZ|ASX|ASZ|DSX|DSZ|GMV|GMS|AMV|AMS|DM9|GC9|AM9)/i.test(m),
  decode: (m) => {
    const upper = m.toUpperCase();
    const prefix = upper.slice(0, 3);
    const typeMap: Record<string, string> = {
      GSX: 'Split-system air conditioner (condensing unit)',
      SSX: 'Split-system air conditioner (condensing unit)',
      ASX: 'Split-system air conditioner (condensing unit)',
      DSX: 'Split-system air conditioner (condensing unit)',
      GSZ: 'Split-system heat pump (outdoor unit)',
      SSZ: 'Split-system heat pump (outdoor unit)',
      ASZ: 'Split-system heat pump (outdoor unit)',
      DSZ: 'Split-system heat pump (outdoor unit)',
      GMV: 'Gas furnace (variable speed)',
      GMS: 'Gas furnace (multi-speed)',
      AMV: 'Gas furnace (variable speed)',
      AMS: 'Gas furnace (multi-speed)',
      DM9: 'Gas furnace (condensing)',
      GC9: 'Gas furnace (condensing)',
      AM9: 'Gas furnace (condensing)',
    };
    const type = typeMap[prefix] ?? null;
    const isFurnace = type?.includes('furnace') ?? false;
    return {
      equipmentType: type
        ? { label: 'Equipment type', value: type, basis: 'DECODED', confidence: 0.85, evidence: prefix }
        : unknownField('Equipment type'),
      series: { label: 'Series', value: prefix, basis: 'DECODED', confidence: 0.85, evidence: prefix },
      fuelType: isFurnace
        ? { label: 'Fuel type', value: 'Natural gas or LP (check the rating plate)', basis: 'DECODED', confidence: 0.8, evidence: prefix }
        : { label: 'Fuel type', value: 'Electric', basis: 'DECODED', confidence: 0.8, evidence: prefix },
    };
  },
};

const RHEEM_STYLE: ModelDecoder = {
  slug: 'rheem',
  brands: ['Rheem', 'Ruud'],
  matches: (m) => /^(RA|RP|RH|RG|UA|UP|UH|UG)\d/i.test(m),
  decode: (m) => {
    const upper = m.toUpperCase();
    const prefix = upper.slice(0, 2);
    const typeMap: Record<string, string> = {
      RA: 'Split-system air conditioner (condensing unit)',
      UA: 'Split-system air conditioner (condensing unit)',
      RP: 'Split-system heat pump (outdoor unit)',
      UP: 'Split-system heat pump (outdoor unit)',
      RH: 'Air handler',
      UH: 'Air handler',
      RG: 'Gas furnace',
      UG: 'Gas furnace',
    };
    const type = typeMap[prefix] ?? null;
    return {
      equipmentType: type
        ? { label: 'Equipment type', value: type, basis: 'DECODED', confidence: 0.8, evidence: prefix }
        : unknownField('Equipment type'),
      series: { label: 'Series', value: prefix, basis: 'DECODED', confidence: 0.8, evidence: prefix },
    };
  },
};

const LENNOX_STYLE: ModelDecoder = {
  slug: 'lennox',
  brands: ['Lennox'],
  matches: (m) => /^(XC|XP|EL|ML|SL|CB|EM|XR)\d/i.test(m),
  decode: (m) => {
    const upper = m.toUpperCase();
    const prefix = upper.slice(0, 2);
    const typeMap: Record<string, string> = {
      XC: 'Split-system air conditioner (condensing unit)',
      XR: 'Split-system air conditioner (condensing unit)',
      XP: 'Split-system heat pump (outdoor unit)',
      CB: 'Air handler',
      EL: 'Varies by family — check the rating plate',
      ML: 'Varies by family — check the rating plate',
      SL: 'Varies by family — check the rating plate',
      EM: 'Electric furnace / air handler',
    };
    const type = typeMap[prefix] ?? null;
    return {
      equipmentType: type
        ? { label: 'Equipment type', value: type, basis: 'DECODED', confidence: prefix.startsWith('E') || prefix === 'ML' || prefix === 'SL' ? 0.4 : 0.75, evidence: prefix }
        : unknownField('Equipment type'),
      series: { label: 'Series', value: prefix, basis: 'DECODED', confidence: 0.8, evidence: prefix },
    };
  },
};

const YORK_STYLE: ModelDecoder = {
  slug: 'york',
  brands: ['York', 'Coleman', 'Luxaire'],
  matches: (m) => /^(YC|YH|YZ|TC|TM|AC|CZ|HC)[A-Z0-9]/i.test(m),
  decode: (m) => {
    const upper = m.toUpperCase();
    const prefix = upper.slice(0, 2);
    return {
      series: { label: 'Series', value: prefix, basis: 'DECODED', confidence: 0.7, evidence: prefix },
      equipmentType: unknownField(
        'Equipment type',
        'York nomenclature varies substantially by product line and production era. Read the equipment type off the rating plate rather than relying on a prefix.',
      ),
    };
  },
};

const DECODERS: ModelDecoder[] = [
  carrierDecoder,
  TRANE_STYLE,
  GOODMAN_STYLE,
  RHEEM_STYLE,
  LENNOX_STYLE,
  YORK_STYLE,
];

export function listDecoders(): Array<{ slug: string; brands: string[] }> {
  return DECODERS.map((d) => ({ slug: d.slug, brands: d.brands }));
}

/**
 * Cross-brand pass. Most manufacturers embed nominal capacity as a
 * three-digit MBH group or a two-digit group of the same number. This is a
 * convention rather than a rule, so everything it produces is INFERRED.
 */
function genericCapacity(modelNumber: string): {
  nominalBtuh: DecodedField<number>;
  nominalTons: DecodedField<number>;
} {
  const upper = modelNumber.toUpperCase();

  for (const [group, mbh] of Object.entries(MBH_GROUPS)) {
    if (upper.includes(group)) {
      const btuh = mbh * 1000;
      return {
        nominalBtuh: {
          label: 'Nominal capacity',
          value: btuh,
          basis: 'INFERRED',
          confidence: 0.6,
          evidence: `"${group}" in the model number`,
          note: 'Most North American manufacturers encode nominal capacity in MBH here, but this is a convention rather than a guarantee. Confirm against the rating plate.',
        },
        nominalTons: {
          label: 'Approximate tonnage',
          value: Math.round((btuh / 12000) * 2) / 2,
          basis: 'INFERRED',
          confidence: 0.6,
          evidence: `"${group}" in the model number`,
          note: 'Nominal tonnage. Actual rated capacity depends on the matched indoor coil and the operating conditions.',
        },
      };
    }
  }

  // Two-digit form, e.g. "...36..." for 3 tons. Weaker — many model numbers
  // contain a 36 that means something else entirely.
  const twoDigit = upper.match(/(?:^|[A-Z])(18|24|30|36|42|48|60)(?:[A-Z]|$)/);
  if (twoDigit) {
    const mbh = Number(twoDigit[1]);
    return {
      nominalBtuh: {
        label: 'Nominal capacity',
        value: mbh * 1000,
        basis: 'INFERRED',
        confidence: 0.35,
        evidence: `"${twoDigit[1]}" in the model number`,
        note: 'Weak inference from a two-digit group. Confirm against the rating plate before ordering anything.',
      },
      nominalTons: {
        label: 'Approximate tonnage',
        value: mbh / 12,
        basis: 'INFERRED',
        confidence: 0.35,
        evidence: `"${twoDigit[1]}" in the model number`,
      },
    };
  }

  return {
    nominalBtuh: unknownField<number>('Nominal capacity', 'No recognizable capacity group in this model number.'),
    nominalTons: unknownField<number>('Approximate tonnage'),
  };
}

function genericVoltage(modelNumber: string): DecodedField<string> {
  const upper = modelNumber.toUpperCase();
  if (/(^|[^0-9])208[-\/]?230([^0-9]|$)/.test(upper) || /\b230\b/.test(upper)) {
    return { label: 'Voltage', value: '208/230 V, 1 phase', basis: 'INFERRED', confidence: 0.5, evidence: '208/230 in the model number' };
  }
  if (/\b460\b/.test(upper) || /\b480\b/.test(upper)) {
    return { label: 'Voltage', value: '460 V, 3 phase', basis: 'INFERRED', confidence: 0.5 };
  }
  if (/\b115\b/.test(upper) || /\b120\b/.test(upper)) {
    return { label: 'Voltage', value: '115 V, 1 phase', basis: 'INFERRED', confidence: 0.4 };
  }
  return unknownField<string>('Voltage', 'Read the supply voltage off the rating plate.');
}

function detectBrand(modelNumber: string, hint?: string | null): DecodedField<string> {
  if (hint) {
    return { label: 'Manufacturer', value: hint, basis: 'DECODED', confidence: 0.95, evidence: 'Supplied by the technician' };
  }
  const decoder = DECODERS.find((d) => d.matches(modelNumber));
  if (decoder) {
    return {
      label: 'Manufacturer',
      value: decoder.brands.join(' / '),
      basis: 'INFERRED',
      confidence: decoder.brands.length === 1 ? 0.7 : 0.55,
      evidence: `Model-number pattern matches ${decoder.slug} nomenclature`,
      note:
        decoder.brands.length > 1
          ? 'These brands share engineering and nomenclature, so the model number alone cannot separate them. The rating plate names the actual brand.'
          : undefined,
    };
  }
  return unknownField<string>('Manufacturer', 'Model-number pattern not recognized. Read the brand off the rating plate.');
}

export function decodeModel(
  modelNumber: string,
  serialNumber?: string | null,
  manufacturerHint?: string | null,
): DecodedModel {
  const cleaned = modelNumber.trim().replace(/\s+/g, '');
  const warnings: string[] = [];

  if (cleaned.length < 4) {
    warnings.push(
      'That model number is too short to decode. Model numbers on the rating plate are usually 8 characters or more — check for a second line on the label.',
    );
  }

  const decoder = DECODERS.find((d) => d.matches(cleaned));
  const specific = decoder ? decoder.decode(cleaned, serialNumber) : {};
  const capacity = genericCapacity(cleaned);

  const base: DecodedModel = {
    input: { modelNumber: cleaned, serialNumber: serialNumber ?? null, manufacturerHint: manufacturerHint ?? null },
    manufacturer: detectBrand(cleaned, manufacturerHint),
    equipmentType: unknownField('Equipment type'),
    nominalTons: capacity.nominalTons,
    nominalBtuh: capacity.nominalBtuh,
    refrigerant: unknownField(
      'Refrigerant',
      'Refrigerant is not reliably encoded in most model numbers and changed mid-production for several product lines. Read it off the nameplate — charging a system with the wrong refrigerant destroys it.',
    ),
    voltage: genericVoltage(cleaned),
    fuelType: unknownField('Fuel type'),
    series: unknownField('Series'),
    efficiencyTier: unknownField('Efficiency tier'),
    manufacturedYear: unknownField('Manufactured year'),
    approximateAgeYears: unknownField('Approximate age'),
    extras: [],
    warnings,
    overallConfidence: 0,
  };

  const merged: DecodedModel = { ...base, ...stripUndefined(specific), warnings: [...warnings, ...(specific.warnings ?? [])] };
  merged.input = base.input;
  merged.extras = [...(specific.extras ?? [])];

  // A brand decoder's capacity beats the generic inference; otherwise keep it.
  if (!specific.nominalBtuh || specific.nominalBtuh.basis === 'UNKNOWN') {
    merged.nominalBtuh = capacity.nominalBtuh;
    merged.nominalTons = capacity.nominalTons;
  }

  if (!decoder) {
    merged.warnings.push(
      'This model-number pattern is not in the decoder registry, so only cross-brand conventions were applied. Everything below is an inference — confirm against the rating plate.',
    );
  }

  merged.overallConfidence = scoreConfidence(merged);
  return merged;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function scoreConfidence(m: DecodedModel): number {
  const fields: Array<DecodedField<string | number>> = [
    m.manufacturer,
    m.equipmentType,
    m.nominalTons,
    m.voltage,
    m.series,
    m.manufacturedYear,
  ];
  const total = fields.reduce((a, f) => a + f.confidence, 0);
  return Math.round((total / fields.length) * 100) / 100;
}

export function decodedSummary(m: DecodedModel): {
  verified: Array<{ label: string; value: string }>;
  estimated: Array<{ label: string; value: string; note?: string }>;
  notDetermined: string[];
} {
  const all: Array<DecodedField<string | number>> = [
    m.manufacturer,
    m.equipmentType,
    m.nominalTons,
    m.nominalBtuh,
    m.refrigerant,
    m.voltage,
    m.fuelType,
    m.series,
    m.efficiencyTier,
    m.manufacturedYear,
    m.approximateAgeYears,
    ...m.extras,
  ];

  const verified: Array<{ label: string; value: string }> = [];
  const estimated: Array<{ label: string; value: string; note?: string }> = [];
  const notDetermined: string[] = [];

  for (const f of all) {
    if (f.value === null || f.basis === 'UNKNOWN') {
      notDetermined.push(f.label);
    } else if (f.basis === 'DECODED') {
      verified.push({ label: f.label, value: String(f.value) });
    } else {
      estimated.push({ label: f.label, value: String(f.value), note: f.note ?? f.evidence });
    }
  }

  return { verified, estimated, notDetermined };
}

export type { DecodedModel, DecodeBasis, DecodedField };
