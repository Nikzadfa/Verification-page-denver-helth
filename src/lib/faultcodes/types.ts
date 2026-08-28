/**
 * Fault-code resolution.
 *
 * The central rule of this subsystem: a printed fault code has no meaning
 * until it is scoped to a control board (or at minimum a model series). "31"
 * on one Carrier board and "31" on another are different faults, and a system
 * that returns one answer for both is worse than no system at all, because the
 * technician trusts it.
 *
 * So `resolveFaultCode` never returns a single confident answer for an
 * unscoped lookup. It returns a resolution *state*, and the UI and the AI are
 * both required to act on that state:
 *
 *   EXACT            — one match at board scope. Safe to present as the meaning.
 *   MODEL_SCOPED     — matched at model-series scope, board unknown. Present
 *                      with an explicit "confirm the board" prompt.
 *   AMBIGUOUS        — several candidate meanings. Present ALL of them and ask
 *                      for the model/board. Never pick one.
 *   BRAND_FALLBACK   — only a brand-level entry exists. Present as "commonly
 *                      means", clearly hedged, and ask for the model/board.
 *   NOT_FOUND        — say so. Do not invent a meaning.
 */

import type { EquipmentType, VerificationStatus } from '@prisma/client';

export interface PossibleCause {
  cause: string;
  /** Rough field frequency, used only for ordering. */
  likelihood: 'COMMON' | 'OCCASIONAL' | 'RARE';
  note?: string;
  /** Engine hypothesis this cause corresponds to, when there is one. */
  hypothesisId?: string;
}

export interface FaultTestStep {
  step: number;
  action: string;
  expected: string;
  ifPass: string;
  ifFail: string;
  hazardIds?: string[];
}

export interface FaultCodeRecord {
  id: string;
  manufacturer: string;
  manufacturerSlug: string;
  equipmentType: EquipmentType;
  modelSeries?: string | null;
  controlBoard?: string | null;
  code: string;
  displayCode?: string | null;
  title: string;
  meaning: string;
  triggerConditions: string;
  possibleCauses: PossibleCause[];
  safetyIds: string[];
  testSequence: FaultTestStep[];
  repairNotes?: string | null;
  verification: VerificationStatus;
  sourceCitation?: string | null;
  sourceDocumentId?: string | null;
  linkedHypotheses: string[];
}

export type ResolutionState =
  | 'EXACT'
  | 'MODEL_SCOPED'
  | 'AMBIGUOUS'
  | 'BRAND_FALLBACK'
  | 'NOT_FOUND';

export interface FaultCodeResolution {
  state: ResolutionState;
  query: {
    manufacturer: string;
    code: string;
    equipmentType?: EquipmentType | null;
    modelNumber?: string | null;
    controlBoard?: string | null;
  };
  /** The single answer, only ever populated for EXACT. */
  match: FaultCodeRecord | null;
  /** Every candidate meaning, always populated. */
  candidates: FaultCodeRecord[];
  /**
   * What the technician must supply to narrow this down. Empty for EXACT.
   * The AI is required to ask for these before interpreting the code.
   */
  needed: Array<{ field: 'modelNumber' | 'controlBoard' | 'equipmentType'; why: string }>;
  /** Rendered verbatim above the answer. Never suppressed. */
  disclaimer: string | null;
  /** True when nothing may be asserted as manufacturer fact. */
  mustVerify: boolean;
}

export const VERIFY_NOTICE =
  'Verify this information against the manufacturer\'s documentation for this specific model and control board before acting on it.';

/**
 * Normalizes what a technician types or says into a lookup key.
 * "code 31", "31", "3 flashes then 1", "E-31", "31." all become "31".
 */
export function normalizeCode(input: string): string {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/^(FAULT|ERROR|STATUS|CODE)\s*/i, '')
    .replace(/[\s._\-#:]/g, '');

  // "3FLASHES1FLASH" / "3SHORT1LONG" style descriptions of a flashing LED.
  const flashes = input.match(/(\d+)\s*(?:short|quick)?\s*flash(?:es)?[^\d]{0,12}(\d+)\s*(?:long|slow)?\s*flash(?:es)?/i);
  if (flashes) return `${flashes[1]}${flashes[2]}`;

  return cleaned;
}

/** Turn a raw model number into the series prefix used to scope fault codes. */
export function modelSeriesPrefix(modelNumber: string): string[] {
  const m = modelNumber.trim().toUpperCase().replace(/\s/g, '');
  const prefixes: string[] = [];
  // Fault-code scoping keys are typically 4–8 leading characters. Generate the
  // plausible prefixes and let the query match the longest available.
  for (let len = Math.min(8, m.length); len >= 3; len -= 1) {
    prefixes.push(m.slice(0, len));
  }
  return prefixes;
}
