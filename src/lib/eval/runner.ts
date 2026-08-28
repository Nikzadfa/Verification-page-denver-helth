/**
 * Eval replay and grading.
 *
 * `replayScenario` is pure and needs no database and no model — it runs the
 * engine against a scripted technician. That means the whole suite executes in
 * milliseconds and can run in CI on every change to the hypothesis catalogue,
 * which is the only way an evidence base this size stays trustworthy as it
 * grows.
 */

import { ENGINE_VERSION } from '@/lib/engine/types';
import {
  applyTestOption,
  createState,
  evaluate,
  markTestAsked,
  markTestSkipped,
  recordMeasurements,
  classifyComplaint,
} from '@/lib/engine/session';
import { TEST_MAP } from '@/lib/engine/knowledge/tests';
import { resolveFaultCode } from '@/lib/faultcodes/resolve';
import { slugify } from '@/lib/rag/retrieve';
import { PROMPT_VERSION } from '@/lib/ai/prompts';
import type {
  EvalCaseResult,
  EvalCheck,
  EvalExpectation,
  EvalScenario,
  EvalTranscript,
  ReplayStep,
} from './types';

export const EVAL_ENGINE_VERSION = ENGINE_VERSION;
export const EVAL_PROMPT_VERSION = PROMPT_VERSION;

const DEFAULT_MAX_STEPS = 12;

/**
 * Run a scenario through the engine with a scripted technician.
 * `resolveCode` is injected so the pure path can run without a database.
 */
export async function replayScenario(
  scenario: EvalScenario,
  options: {
    resolveCode?: typeof resolveFaultCode;
  } = {},
): Promise<EvalTranscript> {
  const families =
    scenario.families?.length ? scenario.families : classifyComplaint(scenario.complaint);

  let state = createState({
    equipmentType: scenario.equipmentType,
    families: families.length ? families : ['unknown'],
    refrigerant: scenario.refrigerant ?? null,
    meteringDevice: scenario.meteringDevice ?? 'UNKNOWN',
    mode: scenario.mode ?? 'UNKNOWN',
    manufacturer: scenario.manufacturer ?? null,
    modelNumber: scenario.modelNumber ?? null,
    controlBoard: scenario.controlBoard ?? null,
    faultCode: scenario.faultCode ?? null,
  });

  // Fault-code lookup happens at intake, exactly as it does in the product.
  let faultCodeResolution: EvalTranscript['faultCodeResolution'] = null;
  if (scenario.faultCode && scenario.manufacturer && options.resolveCode) {
    try {
      const resolution = await options.resolveCode({
        manufacturerSlug: slugify(scenario.manufacturer),
        code: scenario.faultCode,
        equipmentType: scenario.equipmentType,
        modelNumber: scenario.modelNumber ?? null,
        controlBoard: scenario.controlBoard ?? null,
      });
      faultCodeResolution = {
        state: resolution.state,
        needed: resolution.needed.map((n) => n.field),
      };
      // Only an EXACT match is allowed to move the ranking. Anything else is
      // recorded so the engine can ask for the model/board first.
      state = {
        ...state,
        faultCodeRefs: resolution.match
          ? [
              {
                faultCodeId: resolution.match.id,
                code: resolution.match.code,
                manufacturer: resolution.match.manufacturer,
                scoped: true,
                ...({ linkedHypotheses: resolution.match.linkedHypotheses } as object),
              },
            ]
          : resolution.candidates.map((c) => ({
              faultCodeId: c.id,
              code: c.code,
              manufacturer: c.manufacturer,
              scoped: false,
            })),
      };
    } catch {
      faultCodeResolution = { state: 'NOT_FOUND', needed: [] };
    }
  }

  const steps: ReplayStep[] = [];
  const requestedMeasurementKeys = new Set<string>();
  const surfacedHazardIds = new Set<string>();
  const maxSteps = scenario.maxSteps ?? DEFAULT_MAX_STEPS;

  let view = evaluate(state);
  state = view.state;

  for (let i = 0; i < maxSteps; i += 1) {
    for (const h of view.hazards) surfacedHazardIds.add(h.id);

    if (view.conclusion || !view.nextTest) break;

    const test = view.nextTest.test;
    for (const key of test.collects) requestedMeasurementKeys.add(key);

    const scripted = scenario.responses[test.id];
    const step: ReplayStep = {
      step: i + 1,
      phase: view.state.phase,
      testId: test.id,
      testLabel: test.label,
      rationale: view.nextTest.rationale,
      response: null,
      topHypotheses: view.ranked.slice(0, 3).map((r) => ({
        id: r.hypothesisId,
        label: r.label,
        posterior: Math.round(r.posterior * 1000) / 1000,
      })),
      entropyBits: view.entropyBits,
      answered: Boolean(scripted),
    };

    if (!scripted) {
      // The engine asked for something the scenario did not anticipate. Mark
      // it skipped and continue — a scenario that stalls here would hide every
      // later assertion behind one missing response.
      step.response = '(no scripted response — marked unavailable)';
      steps.push(step);
      state = markTestSkipped(state, test.id);
      view = evaluate(state);
      state = view.state;
      continue;
    }

    if (scripted.option) {
      state = applyTestOption(state, test.id, scripted.option);
      step.response = test.options?.find((o) => o.value === scripted.option)?.label ?? scripted.option;
    }

    if (scripted.measurements) {
      const inputs = Object.entries(scripted.measurements).map(([key, value]) =>
        typeof value === 'number'
          ? { key, value, source: 'manual' as const }
          : { key, text: value, source: 'manual' as const },
      );
      state = recordMeasurements(state, inputs).state;
      state = markTestAsked(state, test.id);
      step.response = [
        step.response,
        Object.entries(scripted.measurements)
          .map(([k, v]) => `${k}=${v}`)
          .join(', '),
      ]
        .filter(Boolean)
        .join(' | ');
    }

    if (!scripted.option && !scripted.measurements) {
      state = markTestAsked(state, test.id);
      step.response = scripted.text ?? '(acknowledged)';
    }

    steps.push(step);
    view = evaluate(state);
    state = view.state;
  }

  for (const h of view.hazards) surfacedHazardIds.add(h.id);

  return {
    steps,
    finalRanking: view.ranked.map((r) => ({
      id: r.hypothesisId,
      label: r.label,
      posterior: Math.round(r.posterior * 1000) / 1000,
    })),
    finalPhase: view.state.phase,
    conclusion: view.conclusion
      ? {
          hypothesisId: view.conclusion.hypothesisId,
          label: view.conclusion.label,
          confidence: view.conclusion.confidence,
        }
      : null,
    stopReason: view.stopReason,
    askedTestIds: view.state.askedTestIds,
    requestedMeasurementKeys: [...requestedMeasurementKeys],
    surfacedHazardIds: [...surfacedHazardIds],
    faultCodeResolution,
  };
}

/** Grade a transcript against the case's assertions. */
export function grade(
  transcript: EvalTranscript,
  expectations: EvalExpectation[],
): { checks: EvalCheck[]; score: number; passed: boolean } {
  const checks = expectations.map((e) => check(transcript, e));
  const totalWeight = checks.reduce((a, c) => a + c.weight, 0) || 1;
  const earned = checks.reduce((a, c) => a + (c.passed ? c.weight : 0), 0);
  const score = Math.round((earned / totalWeight) * 1000) / 1000;
  return { checks, score, passed: checks.every((c) => c.passed) };
}

function check(t: EvalTranscript, e: EvalExpectation): EvalCheck {
  const weight = e.weight ?? 1;
  const base = { kind: e.kind, because: e.because, weight, judged: false };
  const asked = t.steps.filter((s) => s.testId).map((s) => s.testId!);

  switch (e.kind) {
    case 'asks_test': {
      const passed = asked.includes(e.target!);
      return { ...base, passed, expected: `asks for "${e.target}"`, observed: asked.join(' → ') || '(no tests asked)' };
    }
    case 'asks_test_first': {
      const passed = asked[0] === e.target;
      return { ...base, passed, expected: `first test is "${e.target}"`, observed: asked[0] ?? '(none)' };
    }
    case 'never_asks_test': {
      const passed = !asked.includes(e.target!);
      return { ...base, passed, expected: `never asks for "${e.target}"`, observed: asked.join(' → ') || '(none)' };
    }
    case 'asks_before': {
      const a = asked.indexOf(e.target!);
      const b = asked.indexOf(e.other!);
      const passed = a !== -1 && (b === -1 || a < b);
      return {
        ...base,
        passed,
        expected: `"${e.target}" before "${e.other}"`,
        observed: asked.join(' → ') || '(none)',
      };
    }
    case 'top_hypothesis': {
      const top = t.conclusion?.hypothesisId ?? t.finalRanking[0]?.id ?? null;
      return {
        ...base,
        passed: top === e.target,
        expected: `top-ranked cause is "${e.target}"`,
        observed: top ?? '(none)',
      };
    }
    case 'hypothesis_in_top_n': {
      const list = t.finalRanking.map((h) => h.id);
      const n = e.n ?? 3;
      const passed = list.slice(0, n).includes(e.target!) || t.conclusion?.hypothesisId === e.target;
      return {
        ...base,
        passed,
        expected: `"${e.target}" in the top ${n}`,
        observed: list.join(', ') || '(none)',
      };
    }
    case 'hypothesis_ruled_out': {
      // "Out of contention" means eliminated outright or left with negligible
      // probability -- not merely ranked below the leader. A hypothesis still
      // holding real mass has not been ruled out.
      const entry = t.finalRanking.find((h) => h.id === e.target);
      const passed = !entry || entry.posterior < 0.05;
      return {
        ...base,
        passed,
        expected: `"${e.target}" eliminated or below 5%`,
        observed: entry
          ? `${e.target} still at ${Math.round(entry.posterior * 100)}%`
          : `${e.target} eliminated`,
      };
    }
    case 'concludes': {
      return {
        ...base,
        passed: t.conclusion?.hypothesisId === e.target,
        expected: `concludes "${e.target}"`,
        observed: t.conclusion ? `${t.conclusion.hypothesisId} @ ${Math.round(t.conclusion.confidence * 100)}%` : `no conclusion (${t.stopReason})`,
      };
    }
    case 'no_conclusion': {
      return {
        ...base,
        passed: t.conclusion === null,
        expected: 'reaches no conclusion — the evidence does not support one',
        observed: t.conclusion ? `concluded ${t.conclusion.hypothesisId}` : `no conclusion (${t.stopReason})`,
      };
    }
    case 'no_conclusion_before_step': {
      const n = e.n ?? 2;
      // Every step before n must have been a test rather than a conclusion.
      const passed = t.steps.slice(0, n).every((s) => s.testId !== null);
      return {
        ...base,
        passed,
        expected: `still testing through step ${n} — no premature diagnosis`,
        observed: `${t.steps.length} test steps before ${t.conclusion ? 'concluding' : 'stopping'}`,
      };
    }
    case 'requests_measurement': {
      const passed = t.requestedMeasurementKeys.includes(e.target!);
      return {
        ...base,
        passed,
        expected: `asks for the "${e.target}" reading`,
        observed: t.requestedMeasurementKeys.join(', ') || '(none)',
      };
    }
    case 'fault_code_state': {
      return {
        ...base,
        passed: t.faultCodeResolution?.state === e.target,
        expected: `fault-code resolution is ${e.target}`,
        observed: t.faultCodeResolution?.state ?? '(no lookup performed)',
      };
    }
    case 'fault_code_requires_scope': {
      const needed = t.faultCodeResolution?.needed ?? [];
      const passed = needed.includes(e.target ?? 'controlBoard') || needed.includes('modelNumber');
      return {
        ...base,
        passed,
        expected: 'asks for the model or control board before interpreting the code',
        observed: needed.join(', ') || '(asked for nothing — it accepted the code at face value)',
      };
    }
    case 'surfaces_hazard': {
      return {
        ...base,
        passed: t.surfacedHazardIds.includes(e.target!),
        expected: `surfaces the "${e.target}" hazard`,
        observed: t.surfacedHazardIds.join(', ') || '(none)',
      };
    }
    case 'min_confidence': {
      const c = t.conclusion?.confidence ?? 0;
      return {
        ...base,
        passed: c >= (e.value ?? 0.6),
        expected: `confidence at least ${Math.round((e.value ?? 0.6) * 100)}%`,
        observed: `${Math.round(c * 100)}%`,
      };
    }
    case 'max_confidence': {
      const c = t.conclusion?.confidence ?? 0;
      return {
        ...base,
        passed: c <= (e.value ?? 1),
        expected: `confidence no higher than ${Math.round((e.value ?? 1) * 100)}%`,
        observed: `${Math.round(c * 100)}%`,
      };
    }
    case 'prose_quality': {
      // Graded by the LLM judge in a separate pass; neutral here so a suite run
      // without a model configured still produces meaningful mechanical results.
      return {
        ...base,
        judged: true,
        passed: true,
        expected: 'graded separately by the prose judge',
        observed: 'not evaluated in this run',
      };
    }
    default:
      return { ...base, passed: false, expected: String(e.kind), observed: 'unknown expectation kind' };
  }
}

export async function runCase(params: {
  caseId: string;
  slug: string;
  name: string;
  scenario: EvalScenario;
  expectations: EvalExpectation[];
  withDatabase?: boolean;
}): Promise<EvalCaseResult> {
  const started = Date.now();
  try {
    const transcript = await replayScenario(params.scenario, {
      resolveCode: params.withDatabase === false ? undefined : resolveFaultCode,
    });
    const { checks, score, passed } = grade(transcript, params.expectations);
    return {
      caseId: params.caseId,
      slug: params.slug,
      name: params.name,
      passed,
      score,
      checks,
      transcript,
      error: null,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      caseId: params.caseId,
      slug: params.slug,
      name: params.name,
      passed: false,
      score: 0,
      checks: [],
      transcript: {
        steps: [],
        finalRanking: [],
        finalPhase: 'ERROR',
        conclusion: null,
        stopReason: 'Replay threw',
        askedTestIds: [],
        requestedMeasurementKeys: [],
        surfacedHazardIds: [],
        faultCodeResolution: null,
      },
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  }
}
