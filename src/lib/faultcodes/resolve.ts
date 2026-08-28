/**
 * Fault-code resolver — database access.
 *
 * Queries the scoped fault-code table and hands the rows to the pure decision
 * logic in ./decide.ts. Keeping the decision separate means the rule that
 * matters most (never present an ambiguous code as a single answer) is tested
 * directly and replayed by the eval suite without a database.
 */

import type { EquipmentType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { type BoardAliasIndex, type ResolveQuery, resolveFromRecords } from './decide';
import {
  type FaultCodeRecord,
  type FaultCodeResolution,
  type FaultTestStep,
  type PossibleCause,
  normalizeCode,
} from './types';

export type ResolveInput = ResolveQuery;

const INCLUDE = {
  manufacturer: true,
  equipmentModel: true,
  controlBoard: true,
} as const;

type FaultRow = Awaited<ReturnType<typeof prisma.faultCode.findMany<{ include: typeof INCLUDE }>>>[number];

function toRecord(row: FaultRow): FaultCodeRecord {
  return {
    id: row.id,
    manufacturer: row.manufacturer.name,
    manufacturerSlug: row.manufacturer.slug,
    equipmentType: row.equipmentType,
    modelSeries: row.equipmentModel?.series ?? null,
    controlBoard: row.controlBoard?.partNumber ?? null,
    code: row.code,
    displayCode: row.displayCode,
    title: row.title,
    meaning: row.meaning,
    triggerConditions: row.triggerConditions,
    possibleCauses: (row.possibleCauses as unknown as PossibleCause[]) ?? [],
    safetyIds: row.safetyIds,
    testSequence: (row.testSequence as unknown as FaultTestStep[]) ?? [],
    repairNotes: row.repairNotes,
    verification: row.verification,
    sourceCitation: row.sourceCitation,
    sourceDocumentId: row.sourceDocumentId,
    linkedHypotheses: row.linkedHypotheses,
  };
}

export async function resolveFaultCode(input: ResolveInput): Promise<FaultCodeResolution> {
  const code = normalizeCode(input.code);

  const rows = await prisma.faultCode.findMany({
    where: {
      code,
      manufacturer: { slug: input.manufacturerSlug },
      ...(input.equipmentType && input.equipmentType !== 'UNKNOWN'
        ? { OR: [{ equipmentType: input.equipmentType }, { equipmentType: 'UNKNOWN' }] }
        : {}),
    },
    include: INCLUDE,
    take: 40,
  });

  const aliases: BoardAliasIndex = {};
  for (const row of rows) {
    if (row.controlBoard) aliases[row.controlBoard.partNumber] = row.controlBoard.aliases;
  }

  return resolveFromRecords(rows.map(toRecord), input, aliases);
}

/** Free-text search across codes and titles, for the fault-code browser. */
export async function searchFaultCodes(params: {
  manufacturerSlug?: string;
  equipmentType?: EquipmentType;
  query?: string;
  limit?: number;
}): Promise<FaultCodeRecord[]> {
  const q = params.query?.trim();
  const normalized = q ? normalizeCode(q) : undefined;

  const rows = await prisma.faultCode.findMany({
    where: {
      ...(params.manufacturerSlug ? { manufacturer: { slug: params.manufacturerSlug } } : {}),
      ...(params.equipmentType && params.equipmentType !== 'UNKNOWN'
        ? { equipmentType: params.equipmentType }
        : {}),
      ...(q
        ? {
            OR: [
              { code: { startsWith: normalized } },
              { title: { contains: q, mode: 'insensitive' as const } },
              { meaning: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    include: INCLUDE,
    orderBy: [{ manufacturerId: 'asc' }, { code: 'asc' }],
    take: params.limit ?? 60,
  });

  return rows.map(toRecord);
}
