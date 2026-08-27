/**
 * Model/serial number decoding.
 *
 * The hard requirement here is that the technician can always tell which
 * fields were actually READ out of the model number and which were INFERRED.
 * A decoder that presents a guessed tonnage the same way it presents a decoded
 * one will eventually get someone to install the wrong part.
 *
 * So every field carries a `basis`:
 *   DECODED   — the character positions in this model number encode this, per
 *               a nomenclature rule we hold for this manufacturer.
 *   INFERRED  — derived from a cross-brand convention (e.g. a three-digit
 *               group meaning nominal MBH). Usually right, not guaranteed.
 *   ESTIMATED — a range or approximation, such as age from a date-coded serial.
 *   UNKNOWN   — we could not determine it. Rendered as "not determined",
 *               never omitted, so the absence is visible.
 */

export type DecodeBasis = 'DECODED' | 'INFERRED' | 'ESTIMATED' | 'UNKNOWN';

export interface DecodedField<T = string | number> {
  label: string;
  value: T | null;
  basis: DecodeBasis;
  /** 0..1 — how much weight the engine may put on this. */
  confidence: number;
  /** What in the model number produced this, for the technician to check. */
  evidence?: string;
  note?: string;
}

export interface DecodedModel {
  input: {
    modelNumber: string;
    serialNumber?: string | null;
    manufacturerHint?: string | null;
  };
  manufacturer: DecodedField<string>;
  equipmentType: DecodedField<string>;
  nominalTons: DecodedField<number>;
  nominalBtuh: DecodedField<number>;
  refrigerant: DecodedField<string>;
  voltage: DecodedField<string>;
  fuelType: DecodedField<string>;
  series: DecodedField<string>;
  efficiencyTier: DecodedField<string>;
  manufacturedYear: DecodedField<number>;
  approximateAgeYears: DecodedField<number>;
  /** Anything brand specific worth surfacing. */
  extras: DecodedField[];
  /** Warnings the UI renders above the result. */
  warnings: string[];
  /** How much of this result is actually decoded rather than inferred. */
  overallConfidence: number;
}

export function unknownField<T>(label: string, note?: string): DecodedField<T> {
  return { label, value: null, basis: 'UNKNOWN', confidence: 0, note };
}

export interface ModelDecoder {
  /** Brand slug this decoder handles. */
  slug: string;
  brands: string[];
  /** Cheap test for whether this decoder recognizes the model number. */
  matches(modelNumber: string): boolean;
  decode(modelNumber: string, serialNumber?: string | null): Partial<DecodedModel>;
}
