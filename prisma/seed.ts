/**
 * Database seed.
 *
 * Idempotent — safe to re-run. Everything uses upserts keyed on natural keys
 * so a re-seed updates the shipped knowledge rather than duplicating it.
 */

import { PrismaClient, type EquipmentType } from '@prisma/client';
import { MANUFACTURERS } from './seed/manufacturers';
import { CARRIER_FAULT_CODES } from './seed/carrierFaultCodes';
import { EVAL_CASES } from './seed/evalCases';
import { DEFAULT_PLANS } from '../src/lib/billing/entitlements';
import { PROCEDURES } from './seed/procedures';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding ThermoRivet…\n');

  // --- Plans --------------------------------------------------------------
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({
      where: { tier: plan.tier },
      // Prices are operator-editable, so a re-seed must not stomp on a change
      // an administrator made in the dashboard. Only create.
      create: plan,
      update: {},
    });
  }
  console.log(`✓ ${DEFAULT_PLANS.length} plans`);

  // --- Manufacturers, models, boards --------------------------------------
  let modelCount = 0;
  let boardCount = 0;

  for (const m of MANUFACTURERS) {
    const manufacturer = await prisma.manufacturer.upsert({
      where: { slug: m.slug },
      create: { name: m.name, slug: m.slug, parent: m.parent ?? null, notes: m.notes ?? null },
      update: { name: m.name, parent: m.parent ?? null, notes: m.notes ?? null },
    });

    for (const model of m.models ?? []) {
      await prisma.equipmentModel.upsert({
        where: {
          manufacturerId_series_modelNumber: {
            manufacturerId: manufacturer.id,
            series: model.series,
            modelNumber: '',
          },
        },
        create: {
          manufacturerId: manufacturer.id,
          series: model.series,
          modelNumber: '',
          type: model.type,
          description: model.description,
          refrigerant: model.refrigerant ?? null,
          minYear: model.minYear ?? null,
          maxYear: model.maxYear ?? null,
        },
        update: { description: model.description, type: model.type },
      });
      modelCount += 1;
    }

    for (const board of m.boards ?? []) {
      const equipmentModel = board.series
        ? await prisma.equipmentModel.findFirst({
            where: { manufacturerId: manufacturer.id, series: board.series },
            select: { id: true },
          })
        : null;

      await prisma.controlBoard.upsert({
        where: {
          manufacturerId_partNumber: {
            manufacturerId: manufacturer.id,
            partNumber: board.partNumber,
          },
        },
        create: {
          manufacturerId: manufacturer.id,
          equipmentModelId: equipmentModel?.id ?? null,
          partNumber: board.partNumber,
          aliases: board.aliases ?? [],
          description: board.description,
          signalStyle: board.signalStyle,
        },
        update: {
          aliases: board.aliases ?? [],
          description: board.description,
          signalStyle: board.signalStyle,
        },
      });
      boardCount += 1;
    }
  }
  console.log(`✓ ${MANUFACTURERS.length} manufacturers, ${modelCount} model series, ${boardCount} control boards`);

  // --- Carrier fault codes ------------------------------------------------
  const carrier = await prisma.manufacturer.findUniqueOrThrow({ where: { slug: 'carrier' } });

  for (const code of CARRIER_FAULT_CODES) {
    const board = code.board
      ? await prisma.controlBoard.findFirst({
          where: { manufacturerId: carrier.id, partNumber: code.board },
          select: { id: true },
        })
      : null;

    const model = code.series
      ? await prisma.equipmentModel.findFirst({
          where: { manufacturerId: carrier.id, series: code.series },
          select: { id: true },
        })
      : null;

    // The scope constraint includes nullable columns (a brand-level row has no
    // model and no board), which Prisma's upsert cannot target -- and which
    // Postgres treats as distinct in a unique index anyway. Match explicitly.
    const scope = {
      manufacturerId: carrier.id,
      code: code.code,
      equipmentType: code.equipmentType,
      equipmentModelId: model?.id ?? null,
      controlBoardId: board?.id ?? null,
    };

    const payload = {
      displayCode: code.displayCode ?? null,
      title: code.title,
      meaning: code.meaning,
      triggerConditions: code.triggerConditions,
      possibleCauses: code.possibleCauses as unknown as object,
      safetyIds: code.safetyIds,
      testSequence: code.testSequence as unknown as object,
      repairNotes: code.repairNotes ?? null,
      linkedHypotheses: code.linkedHypotheses,
    };

    const existing = await prisma.faultCode.findFirst({ where: scope, select: { id: true } });

    if (existing) {
      await prisma.faultCode.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.faultCode.create({
        data: { ...scope, ...payload, verification: code.verification ?? 'PROVISIONAL' },
      });
    }
  }
  console.log(`✓ ${CARRIER_FAULT_CODES.length} Carrier fault codes (all PROVISIONAL — verify against manufacturer documentation)`);

  // --- Diagnostic procedures ----------------------------------------------
  for (const p of PROCEDURES) {
    await prisma.diagnosticProcedure.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        title: p.title,
        category: p.category,
        equipmentTypes: p.equipmentTypes as EquipmentType[],
        summary: p.summary,
        steps: p.steps as unknown as object,
        toolsNeeded: p.toolsNeeded,
        safetyIds: p.safetyIds,
        estMinutes: p.estMinutes,
      },
      update: {
        title: p.title,
        summary: p.summary,
        steps: p.steps as unknown as object,
        toolsNeeded: p.toolsNeeded,
        safetyIds: p.safetyIds,
      },
    });
  }
  console.log(`✓ ${PROCEDURES.length} diagnostic procedures`);

  // --- Eval cases ---------------------------------------------------------
  for (const c of EVAL_CASES) {
    await prisma.evalCase.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        name: c.name,
        category: c.category,
        tags: c.tags,
        scenario: c.scenario as unknown as object,
        expectations: c.expectations as unknown as object,
      },
      update: {
        name: c.name,
        category: c.category,
        tags: c.tags,
        scenario: c.scenario as unknown as object,
        expectations: c.expectations as unknown as object,
      },
    });
  }
  console.log(`✓ ${EVAL_CASES.length} eval cases`);

  console.log('\nDone.');
  console.log(
    '\nNote: every seeded fault code is marked PROVISIONAL. It comes from public service\n' +
      'literature and has not been checked against a manufacturer document held in this\n' +
      'installation. Technicians see that status on every lookup. Upload the real service\n' +
      'literature under Admin → Knowledge base and promote codes to CONFIRMED.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
