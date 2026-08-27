import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { evalRunSchema } from '@/lib/api/schemas';
import { fail, handle, ok } from '@/lib/api/respond';
import { prisma } from '@/lib/db';
import { EVAL_ENGINE_VERSION, EVAL_PROMPT_VERSION, runCase } from '@/lib/eval/runner';
import type { EvalExpectation, EvalScenario } from '@/lib/eval/types';
import { modelFor } from '@/lib/ai/provider';

export const maxDuration = 300;

/**
 * Replays stored scenarios through the real engine and records the results.
 *
 * The checks are mechanical, so a run costs nothing and takes milliseconds per
 * case — which is what makes it usable as a regression gate rather than an
 * occasional exercise.
 */
export const POST = handle(async (request: NextRequest) => {
  const admin = await requireAdmin();
  const body = evalRunSchema.parse(await request.json());

  const cases = await prisma.evalCase.findMany({
    where: {
      active: true,
      ...(body.caseIds?.length ? { id: { in: body.caseIds } } : {}),
    },
  });

  if (cases.length === 0) {
    return fail(
      'There are no active eval cases to run. Seed the starter suite or add a case first.',
      400,
      'no_cases',
    );
  }

  const started = Date.now();
  const results = [];

  for (const c of cases) {
    results.push(
      await runCase({
        caseId: c.id,
        slug: c.slug,
        name: c.name,
        scenario: c.scenario as unknown as EvalScenario,
        expectations: c.expectations as unknown as EvalExpectation[],
      }),
    );
  }

  const passed = results.filter((r) => r.passed).length;
  const score = results.reduce((a, r) => a + r.score, 0) / results.length;

  const run = await prisma.evalRun.create({
    data: {
      userId: admin.id,
      label: body.label,
      model: modelFor('reasoning'),
      engineVersion: EVAL_ENGINE_VERSION,
      promptVersion: EVAL_PROMPT_VERSION,
      totalCases: results.length,
      passedCases: passed,
      score: Math.round(score * 1000) / 1000,
      durationMs: Date.now() - started,
      results: {
        create: results.map((r) => ({
          caseId: r.caseId,
          passed: r.passed,
          score: r.score,
          checks: r.checks as unknown as object,
          transcript: r.transcript as unknown as object,
          error: r.error,
          durationMs: r.durationMs,
        })),
      },
    },
    include: { results: { include: { case: { select: { slug: true, name: true } } } } },
  });

  return ok({ run }, 201);
});

export const GET = handle(async (request: NextRequest) => {
  await requireAdmin();
  const runId = request.nextUrl.searchParams.get('runId');

  if (runId) {
    const run = await prisma.evalRun.findUnique({
      where: { id: runId },
      include: { results: { include: { case: { select: { slug: true, name: true, category: true } } } } },
    });
    return ok({ run });
  }

  const runs = await prisma.evalRun.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  return ok({ runs });
});
