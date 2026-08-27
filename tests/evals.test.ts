/**
 * Runs the shipped eval suite against the real engine, with no database and no
 * model. Fault-code scenarios are resolved from the seed data through the pure
 * decision logic, so the whole suite runs in CI on every change to the
 * hypothesis catalogue.
 */

import { describe, expect, it } from 'vitest';
import { EVAL_CASES } from '../prisma/seed/evalCases';
import { CARRIER_FAULT_CODES } from '../prisma/seed/carrierFaultCodes';
import { MANUFACTURERS } from '../prisma/seed/manufacturers';
import { resolveFromRecords, type BoardAliasIndex } from '../src/lib/faultcodes/decide';
import { normalizeCode, type FaultCodeRecord } from '../src/lib/faultcodes/types';
import { grade, replayScenario } from '../src/lib/eval/runner';
import type { FaultCodeResolution } from '../src/lib/faultcodes/types';

/** Build in-memory fault-code records from the seed files. */
const SEEDED: FaultCodeRecord[] = CARRIER_FAULT_CODES.map((f, i) => ({
  id: `seed-${i}`,
  manufacturer: 'Carrier',
  manufacturerSlug: 'carrier',
  equipmentType: f.equipmentType,
  modelSeries: f.series ?? null,
  controlBoard: f.board ?? null,
  code: normalizeCode(f.code),
  displayCode: f.displayCode ?? null,
  title: f.title,
  meaning: f.meaning,
  triggerConditions: f.triggerConditions,
  possibleCauses: f.possibleCauses,
  safetyIds: f.safetyIds,
  testSequence: f.testSequence,
  repairNotes: f.repairNotes ?? null,
  verification: f.verification ?? 'PROVISIONAL',
  sourceCitation: null,
  sourceDocumentId: null,
  linkedHypotheses: f.linkedHypotheses,
}));

const ALIASES: BoardAliasIndex = Object.fromEntries(
  (MANUFACTURERS.find((m) => m.slug === 'carrier')?.boards ?? []).map((b) => [
    b.partNumber,
    b.aliases ?? [],
  ]),
);

async function fakeResolve(input: {
  manufacturerSlug: string;
  code: string;
  equipmentType?: string | null;
  modelNumber?: string | null;
  controlBoard?: string | null;
}): Promise<FaultCodeResolution> {
  const code = normalizeCode(input.code);
  const rows = SEEDED.filter(
    (r) =>
      r.manufacturerSlug === input.manufacturerSlug &&
      r.code === code &&
      (!input.equipmentType ||
        input.equipmentType === 'UNKNOWN' ||
        r.equipmentType === input.equipmentType ||
        r.equipmentType === 'UNKNOWN'),
  );
  return resolveFromRecords(rows, input as never, ALIASES);
}

describe('shipped eval suite', () => {
  for (const testCase of EVAL_CASES) {
    it(`${testCase.slug} — ${testCase.name}`, async () => {
      const transcript = await replayScenario(testCase.scenario, {
        resolveCode: fakeResolve as never,
      });
      const { checks, score } = grade(transcript, testCase.expectations);

      const failures = checks.filter((c) => !c.passed && !c.judged);
      if (failures.length) {
        const detail = failures
          .map(
            (f) =>
              `\n  ✗ [${f.kind}] expected ${f.expected}\n      observed: ${f.observed}\n      why it matters: ${f.because}`,
          )
          .join('');
        const walk = transcript.steps
          .map((s) => `    ${s.step}. ${s.testLabel ?? '(none)'} -> ${s.response ?? '-'}`)
          .join('\n');
        throw new Error(
          `${failures.length} assertion(s) failed (score ${score}).${detail}\n\n  Replay:\n${walk}\n  Final: ${
            transcript.conclusion?.hypothesisId ?? `no conclusion — ${transcript.stopReason}`
          }`,
        );
      }

      expect(score).toBe(1);
    });
  }
});

describe('fault-code scoping', () => {
  it('returns AMBIGUOUS for a code with two board-specific meanings', async () => {
    const r = await fakeResolve({ manufacturerSlug: 'carrier', code: '31', equipmentType: 'GAS_FURNACE' });
    expect(r.state).toBe('AMBIGUOUS');
    expect(r.match).toBeNull();
    expect(r.candidates.length).toBeGreaterThan(1);
    expect(r.needed[0]!.field).toBe('modelNumber');
    expect(r.mustVerify).toBe(true);
  });

  it('resolves EXACT once the board is supplied', async () => {
    const r = await fakeResolve({
      manufacturerSlug: 'carrier',
      code: '31',
      equipmentType: 'GAS_FURNACE',
      controlBoard: 'HK42FZ',
    });
    expect(r.state).toBe('EXACT');
    expect(r.match?.title).toMatch(/pressure switch/i);
  });

  it('resolves the OTHER meaning for the Infinity board', async () => {
    const r = await fakeResolve({
      manufacturerSlug: 'carrier',
      code: '31',
      equipmentType: 'GAS_FURNACE',
      controlBoard: 'CESO130035',
    });
    expect(r.state).toBe('EXACT');
    expect(r.match?.title).toMatch(/high-heat/i);
  });

  it('accepts a board alias', async () => {
    const r = await fakeResolve({
      manufacturerSlug: 'carrier',
      code: '31',
      equipmentType: 'GAS_FURNACE',
      controlBoard: 'HK42FZ011',
    });
    expect(r.state).toBe('EXACT');
  });

  it('refuses to guess a code it does not hold', async () => {
    const r = await fakeResolve({ manufacturerSlug: 'carrier', code: '99', equipmentType: 'GAS_FURNACE' });
    expect(r.state).toBe('NOT_FOUND');
    expect(r.candidates).toEqual([]);
    expect(r.disclaimer).toMatch(/not going to guess/i);
  });

  it('hedges a brand-level entry and asks for the model', async () => {
    const r = await fakeResolve({ manufacturerSlug: 'carrier', code: '22', equipmentType: 'GAS_FURNACE' });
    expect(r.state).toBe('BRAND_FALLBACK');
    expect(r.match).toBeNull();
    expect(r.mustVerify).toBe(true);
    expect(r.needed[0]!.field).toBe('modelNumber');
  });

  it('normalizes how technicians actually enter a code', () => {
    expect(normalizeCode('code 31')).toBe('31');
    expect(normalizeCode('E-31')).toBe('E31');
    expect(normalizeCode('  31. ')).toBe('31');
    expect(normalizeCode('3 flashes then 1 flash')).toBe('31');
  });

  it('marks every seeded row as needing verification', () => {
    // Nothing shipped in the seed has been checked against a manufacturer
    // document in this installation, and the product must say so.
    for (const row of SEEDED) {
      expect(row.verification).not.toBe('CONFIRMED');
    }
  });
});
