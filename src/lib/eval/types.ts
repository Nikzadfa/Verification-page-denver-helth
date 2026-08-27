/**
 * AI Testing Center.
 *
 * A stored scenario is replayed through the real engine, and the assertions
 * are checked against what the engine actually decided — which test it asked
 * for, in what order, how it ranked the causes, whether it concluded too
 * early, whether it demanded the model/board before interpreting a fault code.
 *
 * Almost every assertion is mechanical. That matters: an eval suite graded by
 * a language model drifts with the grader, and you end up unable to tell a
 * real regression from a mood. The only LLM-graded checks here are the ones
 * that are genuinely about prose (did it ask for one thing, was the
 * instruction specific enough), and they are clearly separated in the results.
 */

import type { EquipmentType } from '@prisma/client';
import type { SymptomFamily } from '@/lib/engine/types';

export interface EvalScenario {
  complaint: string;
  equipmentType: EquipmentType;
  families?: SymptomFamily[];
  manufacturer?: string | null;
  modelNumber?: string | null;
  controlBoard?: string | null;
  refrigerant?: string | null;
  meteringDevice?: 'TXV' | 'EEV' | 'FIXED_ORIFICE' | 'CAPILLARY' | 'UNKNOWN';
  mode?: 'COOLING' | 'HEATING' | 'DEFROST' | 'IDLE' | 'UNKNOWN';
  faultCode?: string | null;

  /**
   * Scripted technician responses, keyed by the test id the engine asks for.
   * The replay looks up the test the engine chose and answers it. A test with
   * no scripted answer is marked skipped, which is itself informative — it
   * shows the engine asking for something the scenario author did not expect.
   */
  responses: Record<
    string,
    {
      /** For QUESTION tests: the option value chosen. */
      option?: string;
      /** For MEASUREMENT tests: readings supplied. */
      measurements?: Record<string, number | string>;
      /** Free text, exercised through the extraction path when enabled. */
      text?: string;
    }
  >;

  /** Cap on replay steps, to stop a misbehaving engine from looping. */
  maxSteps?: number;
}

export type ExpectationKind =
  | 'asks_test'
  | 'asks_test_first'
  | 'never_asks_test'
  | 'asks_before'
  | 'top_hypothesis'
  | 'hypothesis_in_top_n'
  | 'hypothesis_ruled_out'
  | 'concludes'
  | 'no_conclusion'
  | 'no_conclusion_before_step'
  | 'requests_measurement'
  | 'fault_code_state'
  | 'fault_code_requires_scope'
  | 'surfaces_hazard'
  | 'min_confidence'
  | 'max_confidence'
  | 'prose_quality';

export interface EvalExpectation {
  kind: ExpectationKind;
  /** Test id, hypothesis id, measurement key, hazard id, or resolution state. */
  target?: string;
  /** Second target for ordering assertions. */
  other?: string;
  n?: number;
  value?: number;
  /** Shown in the results table so a failure explains itself. */
  because: string;
  /** Weight in the case score. Defaults to 1. */
  weight?: number;
}

export interface EvalCheck {
  kind: ExpectationKind;
  passed: boolean;
  because: string;
  expected: string;
  observed: string;
  weight: number;
  /** True for the LLM-graded prose checks. */
  judged: boolean;
}

export interface ReplayStep {
  step: number;
  phase: string;
  testId: string | null;
  testLabel: string | null;
  rationale: string | null;
  /** How the scripted technician answered. */
  response: string | null;
  topHypotheses: Array<{ id: string; label: string; posterior: number }>;
  entropyBits: number;
  narration?: string | null;
  answered: boolean;
}

export interface EvalTranscript {
  steps: ReplayStep[];
  /**
   * The ranking AFTER the last answer was applied. Each step records the
   * ranking as it stood when that test was chosen — i.e. before its result
   * came in — so assertions about where the engine ended up must read this
   * rather than the final step's snapshot.
   */
  finalRanking: Array<{ id: string; label: string; posterior: number }>;
  finalPhase: string;
  conclusion: { hypothesisId: string; label: string; confidence: number } | null;
  stopReason: string;
  askedTestIds: string[];
  requestedMeasurementKeys: string[];
  surfacedHazardIds: string[];
  faultCodeResolution: { state: string; needed: string[] } | null;
}

export interface EvalCaseResult {
  caseId: string;
  slug: string;
  name: string;
  passed: boolean;
  score: number;
  checks: EvalCheck[];
  transcript: EvalTranscript;
  error: string | null;
  durationMs: number;
}
