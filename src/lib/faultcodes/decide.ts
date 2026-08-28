/**
 * Fault-code resolution decision logic, separated from the database query.
 *
 * Pure so the rules that matter most — never present an ambiguous code as a
 * single answer, always demand the board when the meaning depends on it — can
 * be tested directly, and so the eval suite can replay fault-code scenarios
 * without a database.
 */

import type { EquipmentType } from '@prisma/client';
import {
  type FaultCodeRecord,
  type FaultCodeResolution,
  VERIFY_NOTICE,
  modelSeriesPrefix,
  normalizeCode,
} from './types';

export interface ResolveQuery {
  manufacturerSlug: string;
  code: string;
  equipmentType?: EquipmentType | null;
  modelNumber?: string | null;
  controlBoard?: string | null;
}

/** Board aliases, supplied by the caller from the ControlBoard rows. */
export type BoardAliasIndex = Record<string, string[]>;

export function resolveFromRecords(
  records: FaultCodeRecord[],
  input: ResolveQuery,
  aliases: BoardAliasIndex = {},
): FaultCodeResolution {
  const code = normalizeCode(input.code);
  const query = {
    manufacturer: input.manufacturerSlug,
    code,
    equipmentType: input.equipmentType ?? null,
    modelNumber: input.modelNumber ?? null,
    controlBoard: input.controlBoard ?? null,
  };

  if (records.length === 0) {
    return {
      state: 'NOT_FOUND',
      query,
      match: null,
      candidates: [],
      needed: [
        {
          field: 'modelNumber',
          why: 'No entry for this code under this brand. The complete model number would let me search the model-specific tables and the knowledge base.',
        },
      ],
      disclaimer:
        'I do not have this code for this manufacturer in the knowledge base. I am not going to guess at what it means — a wrong fault-code meaning sends you down the wrong branch entirely. Check the label inside the unit\'s control compartment, which usually prints the code list for that board.',
      mustVerify: true,
    };
  }

  // --- Board scope: the only level that yields a confident single answer ----
  if (input.controlBoard) {
    const board = input.controlBoard.trim().toUpperCase();
    const boardMatches = records.filter((r) => {
      if (!r.controlBoard) return false;
      const part = r.controlBoard.toUpperCase();
      if (part === board) return true;
      return (aliases[r.controlBoard] ?? []).some((a) => a.toUpperCase() === board);
    });

    if (boardMatches.length === 1) {
      const match = boardMatches[0]!;
      return {
        state: 'EXACT',
        query,
        match,
        candidates: [match],
        needed: [],
        disclaimer: disclaimerFor(match),
        mustVerify: match.verification !== 'CONFIRMED',
      };
    }
    if (boardMatches.length > 1) {
      return ambiguous(query, dedupeByMeaning(boardMatches), 'controlBoard');
    }
  }

  // --- Model-series scope, longest prefix first ----------------------------
  if (input.modelNumber) {
    for (const prefix of modelSeriesPrefix(input.modelNumber)) {
      const seriesMatches = records.filter(
        (r) => r.modelSeries && r.modelSeries.toUpperCase() === prefix,
      );
      if (seriesMatches.length === 1) {
        const rec = seriesMatches[0]!;
        return {
          state: 'MODEL_SCOPED',
          query,
          match: null,
          candidates: [rec],
          needed: [
            {
              field: 'controlBoard',
              why: `This is the meaning for the ${rec.modelSeries} series. Different control boards were used across the production run of a series, so confirm the board part number on the label in the control compartment before you rely on this.`,
            },
          ],
          disclaimer: `${disclaimerFor(rec) ?? ''} Matched at model-series level (${rec.modelSeries}), not to a specific control board.`.trim(),
          mustVerify: true,
        };
      }
      if (seriesMatches.length > 1) {
        return ambiguous(query, dedupeByMeaning(seriesMatches), 'controlBoard');
      }
    }
  }

  // --- Several distinct meanings and nothing to choose between them --------
  const distinct = dedupeByMeaning(records);
  if (distinct.length > 1) {
    return ambiguous(query, distinct, input.modelNumber ? 'controlBoard' : 'modelNumber');
  }

  const only = distinct[0]!;
  const scoped = Boolean(only.modelSeries || only.controlBoard);
  return {
    state: scoped ? 'MODEL_SCOPED' : 'BRAND_FALLBACK',
    query,
    match: null,
    candidates: [only],
    needed: [
      {
        field: 'modelNumber',
        why: 'This is the general meaning for the brand. Manufacturers reuse code numbers across board generations, so the complete model number and the board part number are what turn this into a reliable answer.',
      },
    ],
    disclaimer: `${
      scoped ? '' : 'This is a brand-level entry, not specific to your model or control board. '
    }${disclaimerFor(only) ?? VERIFY_NOTICE}`.trim(),
    mustVerify: true,
  };
}

function ambiguous(
  query: FaultCodeResolution['query'],
  candidates: FaultCodeRecord[],
  need: 'modelNumber' | 'controlBoard',
): FaultCodeResolution {
  return {
    state: 'AMBIGUOUS',
    query,
    match: null,
    candidates,
    needed: [
      {
        field: need,
        why:
          need === 'controlBoard'
            ? 'This code has more than one meaning across the control boards used in this equipment. The board part number is printed on a label on the board itself — that is what decides which of these applies.'
            : 'This code has more than one meaning across this manufacturer\'s equipment. The complete model number off the rating plate is what narrows it down.',
      },
    ],
    disclaimer: `This code means different things depending on the equipment. I am showing you every meaning I have rather than picking one, because picking wrong sends you down the wrong branch. ${VERIFY_NOTICE}`,
    mustVerify: true,
  };
}

function dedupeByMeaning(records: FaultCodeRecord[]): FaultCodeRecord[] {
  const seen = new Map<string, FaultCodeRecord>();
  for (const r of records) {
    const key = r.title.trim().toLowerCase();
    const existing = seen.get(key);
    if (
      !existing ||
      scopeRank(r) > scopeRank(existing) ||
      (scopeRank(r) === scopeRank(existing) && verifyRank(r) > verifyRank(existing))
    ) {
      seen.set(key, r);
    }
  }
  return [...seen.values()];
}

function scopeRank(r: FaultCodeRecord): number {
  if (r.controlBoard) return 2;
  if (r.modelSeries) return 1;
  return 0;
}

function verifyRank(r: FaultCodeRecord): number {
  return { CONFIRMED: 3, PROVISIONAL: 2, UNVERIFIED: 1, DISPUTED: 0 }[r.verification] ?? 0;
}

function disclaimerFor(r: FaultCodeRecord): string | null {
  switch (r.verification) {
    case 'CONFIRMED':
      return r.sourceCitation ? `Source: ${r.sourceCitation}` : null;
    case 'PROVISIONAL':
      return `This entry comes from public service literature and has not been checked against a manufacturer document held in the knowledge base. ${VERIFY_NOTICE}`;
    case 'DISPUTED':
      return `Sources disagree on what this code means for this equipment. Treat everything below as a lead to check, not as the answer. ${VERIFY_NOTICE}`;
    default:
      return `This entry is unverified. ${VERIFY_NOTICE}`;
  }
}
