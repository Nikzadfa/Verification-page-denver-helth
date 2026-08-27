/**
 * Session orchestration — the SYMPTOM → QUESTION → MEASUREMENT → ANALYSIS →
 * NEXT TEST → CONFIRMATION → DIAGNOSIS loop.
 *
 * Everything here is pure: state in, state out, no I/O and no model calls. That
 * makes the whole diagnostic path replayable, which is what the AI Testing
 * Center depends on — a stored scenario runs through this exact code and the
 * assertions check what the engine actually decided.
 */

import {
  CONCLUSION_THRESHOLD,
  ENGINE_VERSION,
  MIN_INFO_GAIN_TO_KEEP_TESTING,
  type Conclusion,
  type EngineContext,
  type EngineState,
  type Finding,
  type HypothesisScore,
  type PlannedTest,
  type SymptomFamily,
} from './types';
import { differentialPair, entropyBits, rankHypotheses } from './inference';
import { planNextTests, shouldConclude } from './planner';
import { derive, DERIVED_SOURCE } from './derive';
import { HYPOTHESIS_MAP } from './knowledge/hypotheses';
import { TEST_MAP } from './knowledge/tests';
import { checkRange } from './measurements';
import type { DerivedValue } from '../hvac/refrigerationAnalysis';
import { getHazards, highestLevel, type Hazard } from '../safety/hazards';
import type { EquipmentType } from '@prisma/client';

export function createState(context: EngineContext): EngineState {
  const now = new Date().toISOString();
  return {
    version: ENGINE_VERSION,
    phase: 'INTAKE',
    context,
    findings: [],
    measurements: {},
    askedTestIds: [],
    skippedTestIds: [],
    eliminated: [],
    faultCodeRefs: [],
    citations: [],
    conclusion: null,
    startedAt: now,
    updatedAt: now,
  };
}

export interface RecordMeasurementInput {
  key: string;
  value?: number | null;
  text?: string | null;
  unit?: string | null;
  source?: 'manual' | 'voice' | 'photo' | 'calculated';
}

export function recordMeasurements(
  state: EngineState,
  inputs: RecordMeasurementInput[],
): { state: EngineState; warnings: string[] } {
  const warnings: string[] = [];
  const measurements = { ...state.measurements };
  const now = new Date().toISOString();

  for (const input of inputs) {
    if (typeof input.value === 'number') {
      const issue = checkRange(input.key, input.value);
      if (issue) warnings.push(issue.message);
    }
    measurements[input.key] = {
      value: input.value ?? null,
      text: input.text ?? null,
      unit: input.unit ?? null,
      at: now,
      source: input.source ?? 'manual',
    };
  }

  return { state: { ...state, measurements, updatedAt: now }, warnings };
}

/** Record a finding observed directly (a question answer, a photo reading). */
export function recordFindings(state: EngineState, findings: Finding[]): EngineState {
  const byKey = new Map(state.findings.map((f) => [f.key, f]));
  for (const f of findings) byKey.set(f.key, f);
  return { ...state, findings: [...byKey.values()], updatedAt: new Date().toISOString() };
}

export function markTestAsked(state: EngineState, testId: string): EngineState {
  if (state.askedTestIds.includes(testId)) return state;
  return { ...state, askedTestIds: [...state.askedTestIds, testId], updatedAt: new Date().toISOString() };
}

export function markTestSkipped(state: EngineState, testId: string): EngineState {
  if (state.skippedTestIds.includes(testId)) return state;
  return { ...state, skippedTestIds: [...state.skippedTestIds, testId], updatedAt: new Date().toISOString() };
}

/** Apply the option a technician chose on a QUESTION-kind test. */
export function applyTestOption(
  state: EngineState,
  testId: string,
  optionValue: string,
): EngineState {
  const test = TEST_MAP[testId];
  if (!test) return state;
  const option = test.options?.find((o) => o.value === optionValue);
  const now = new Date().toISOString();

  const findings: Finding[] = (option?.findings ?? []).map((key) => ({
    key,
    label: key,
    present: true,
    detail: `Observed during: ${test.label} — "${option?.label ?? optionValue}".`,
    confidence: 0.88,
    sourceTestId: testId,
    observedAt: now,
  }));

  // Findings the test could have produced but did not are recorded as ABSENT.
  // Without this the engine only ever learns from positive results and cannot
  // rule anything out.
  const produced = new Set(findings.map((f) => f.key));
  const negatives: Finding[] = test.yields
    .filter((key) => !produced.has(key))
    .map((key) => ({
      key,
      label: key,
      present: false,
      detail: `Looked for during "${test.label}" and not present.`,
      confidence: 0.75,
      sourceTestId: testId,
      observedAt: now,
    }));

  let next = recordFindings(state, [...findings, ...negatives]);
  next = markTestAsked(next, testId);
  return next;
}

export interface EngineView {
  state: EngineState;
  scores: HypothesisScore[];
  /** Only the hypotheses worth showing — the long tail is noise in the field. */
  ranked: HypothesisScore[];
  planned: PlannedTest[];
  nextTest: PlannedTest | null;
  derivedValues: DerivedValue[];
  missingReadings: Array<{ key: string; label: string; why: string }>;
  notes: string[];
  verifyNotes: string[];
  hazards: Hazard[];
  hazardLevel: ReturnType<typeof highestLevel>;
  entropyBits: number;
  differential: ReturnType<typeof differentialPair>;
  stopReason: string;
  conclusion: Conclusion | null;
}

/**
 * The single entry point. Recomputes derivations, ranks hypotheses, plans the
 * next test, and decides whether the engine is allowed to conclude.
 */
export function evaluate(state: EngineState): EngineView {
  // Regenerate derived findings from scratch so a corrected measurement
  // retracts whatever the old value implied.
  const observed = state.findings.filter((f) => f.sourceTestId !== DERIVED_SOURCE);
  const derivation = derive({ ...state, findings: observed });
  const allFindings = mergeFindings(observed, derivation.findings);

  const working: EngineState = { ...state, findings: allFindings };

  const rankOpts = {
    equipmentType: state.context.equipmentType as EquipmentType,
    families: state.context.families,
    eliminated: state.eliminated.map((e) => e.hypothesisId),
    faultCodeHypotheses: faultCodeHypotheses(state),
  };

  const scores = rankHypotheses(allFindings, rankOpts);
  const planned = planNextTests(working, scores, { ...rankOpts, limit: 5 });
  const decision = shouldConclude(
    scores,
    planned,
    working,
    CONCLUSION_THRESHOLD,
    MIN_INFO_GAIN_TO_KEEP_TESTING,
  );

  const nextTest = decision.conclude ? null : (planned[0] ?? null);
  const conclusion = decision.conclude ? buildConclusion(scores, working) : null;

  const hazardIds = new Set<string>();
  if (nextTest) for (const id of nextTest.test.hazardIds) hazardIds.add(id);
  for (const id of conclusion?.safetyIds ?? []) hazardIds.add(id);
  // Any CRITICAL derived value pulls its hazards in regardless of the step.
  for (const d of derivation.derived) {
    if (d.severity === 'CRITICAL') {
      if (d.key === 'discharge_temp' || d.key === 'compression_ratio') hazardIds.add('refrigerant-handling');
    }
  }

  const phase: EngineState['phase'] = conclusion
    ? 'DIAGNOSED'
    : allFindings.length === 0
      ? 'INTAKE'
      : scores[0] && scores[0].posterior >= CONCLUSION_THRESHOLD
        ? 'CONFIRMING'
        : state.askedTestIds.length === 0
          ? 'TRIAGE'
          : 'TESTING';

  const nextState: EngineState = {
    ...working,
    phase,
    conclusion,
    updatedAt: new Date().toISOString(),
  };

  return {
    state: nextState,
    scores,
    ranked: scores.filter((s) => !s.ruledOut && s.posterior >= 0.03).slice(0, 6),
    planned,
    nextTest,
    derivedValues: derivation.derived,
    missingReadings: derivation.missing,
    notes: derivation.notes,
    verifyNotes: derivation.verifyNotes,
    hazards: getHazards([...hazardIds]),
    hazardLevel: highestLevel([...hazardIds]),
    entropyBits: round2(entropyBits(scores)),
    differential: differentialPair(scores),
    stopReason: decision.reason,
    conclusion,
  };
}

function mergeFindings(observed: Finding[], derived: Finding[]): Finding[] {
  const map = new Map<string, Finding>();
  // Observed findings win over derived ones — a technician who looked at the
  // filter outranks an inference about airflow.
  for (const f of derived) map.set(f.key, f);
  for (const f of observed) map.set(f.key, f);
  return [...map.values()];
}

function faultCodeHypotheses(state: EngineState): string[] {
  const out = new Set<string>();
  for (const ref of state.faultCodeRefs) {
    // Only a code resolved to a specific model/board is allowed to boost a
    // hypothesis. An unscoped brand-level match is too ambiguous to move the
    // ranking; it is used to ask for the model instead.
    if (!ref.scoped) continue;
    for (const id of (ref as { linkedHypotheses?: string[] }).linkedHypotheses ?? []) out.add(id);
  }
  return [...out];
}

function buildConclusion(scores: HypothesisScore[], state: EngineState): Conclusion | null {
  const top = scores.find((s) => !s.ruledOut);
  if (!top) return null;
  const h = HYPOTHESIS_MAP[top.hypothesisId];
  if (!h) return null;

  const evidence = top.support
    .filter((s) => s.lr > 1)
    .map((s) => {
      const finding = state.findings.find((f) => f.key === s.findingKey);
      return {
        findingKey: s.findingKey,
        label: s.label,
        detail: finding?.detail ?? '',
      };
    });

  const ruledOut = scores
    .filter((s) => s.ruledOut)
    .slice(0, 6)
    .map((s) => ({ label: s.label, reason: s.ruledOutReason ?? 'Incompatible with the observed findings.' }));

  const caveats: string[] = [];
  const runnerUp = scores.filter((s) => !s.ruledOut)[1];
  if (runnerUp && runnerUp.posterior > 0.15) {
    const link = h.confusedWith.find((c) => c.hypothesisId === runnerUp.hypothesisId);
    caveats.push(
      `${runnerUp.label} is still at ${Math.round(runnerUp.posterior * 100)}%.${
        link ? ` ${link.how}` : ' Confirm the repair resolves the complaint before closing the call.'
      }`,
    );
  }
  if (top.posterior < 0.8) {
    caveats.push(
      'This is the best-supported explanation, not a certainty. Verify the fault directly before replacing parts.',
    );
  }
  const unverifiedConversions = Object.keys(state.measurements).some(
    (k) => k === 'suction_pressure' || k === 'liquid_pressure',
  );
  if (unverifiedConversions) {
    caveats.push(
      'Saturation temperatures were converted from pressure using approximate P/T data. Confirm against the refrigerant manufacturer\'s P/T chart before acting on a marginal reading.',
    );
  }

  return {
    hypothesisId: h.id,
    label: h.label,
    statement: h.statement,
    confidence: round2(top.posterior),
    evidence,
    ruledOut,
    repair: h.repair,
    safetyIds: h.safetyIds,
    caveats,
  };
}

/**
 * Map free-text complaint to symptom families. Deterministic keyword matching
 * runs first; the LLM classifier in src/lib/ai/intake.ts only fills in when
 * this returns nothing, so the common cases never depend on a model call.
 */
const FAMILY_PATTERNS: Array<{ family: SymptomFamily; re: RegExp }> = [
  { family: 'no_cooling', re: /\b(no cool|not cool|won'?t cool|no a\/?c|blowing warm|blowing hot)/i },
  { family: 'insufficient_cooling', re: /\b(not cooling enough|can'?t keep up|not cold enough|barely cool|struggl|warm(er)? than set)/i },
  { family: 'no_heat', re: /\b(no heat|not heating|won'?t heat|no furnace|cold air on heat)/i },
  { family: 'insufficient_heat', re: /\b(not enough heat|not warm enough|can'?t keep up.*heat)/i },
  { family: 'no_airflow', re: /\b(no air|weak air|low airflow|blower (not|won'?t) )/i },
  { family: 'unit_not_running', re: /\b(not running|won'?t (start|turn on|come on)|dead|nothing happens|no power)/i },
  { family: 'short_cycling', re: /\b(short cycl|cycling on and off|turns off after|keeps shutting)/i },
  { family: 'frozen_coil', re: /\b(frozen|freez|frost|ice|iced|icing)/i },
  { family: 'water_leak', re: /\b(leak(ing)? water|water damage|dripping|condensate)/i },
  { family: 'noise', re: /\b(nois|rattl|squeal|grind|bang|hum)/i },
  { family: 'high_bill', re: /\b(high bill|electric bill|running constantly|never shuts off)/i },
  { family: 'fault_code', re: /\b(code|error|fault|flash(es|ing)?|blink)/i },
  { family: 'odor', re: /\b(smell|odor|odour|burning)/i },
];

export function classifyComplaint(complaint: string): SymptomFamily[] {
  const families = FAMILY_PATTERNS.filter((p) => p.re.test(complaint)).map((p) => p.family);

  // "Running but not cooling" is the single most common opening line in the
  // trade and it is genuinely ambiguous: the equipment is energized, so a
  // dead-unit failure is unlikely, but whether it is producing *no* cooling or
  // *insufficient* cooling is not yet established. Carry both rather than
  // picking one — the engine will separate them with the first test.
  if (
    /\b(runn?ing|on|works?)\b/i.test(complaint) &&
    families.includes('no_cooling') &&
    !families.includes('insufficient_cooling')
  ) {
    families.push('insufficient_cooling');
  }
  if (
    /\b(runn?ing|on|works?)\b/i.test(complaint) &&
    families.includes('no_heat') &&
    !families.includes('insufficient_heat')
  ) {
    families.push('insufficient_heat');
  }

  return families.length ? [...new Set(families)] : [];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
