/**
 * Diagnostic engine types.
 *
 * The engine is deterministic. Given the same complaint and the same
 * observations it produces the same ranking, the same next test, and the same
 * conclusion — no model call is involved in any of those decisions. The LLM
 * sits on either side of it: parsing what the technician said into
 * observations, and putting the engine's chosen step into readable prose.
 *
 * That separation is the whole point of the product. A language model is good
 * at language and bad at consistently applying a decision procedure under
 * pressure; a decision procedure is the opposite.
 */

import type { EquipmentType } from '@prisma/client';

export type DiagnosticCategory =
  | 'refrigeration'
  | 'electrical'
  | 'heating'
  | 'airflow'
  | 'controls'
  | 'combustion'
  | 'water';

/** Coarse buckets a complaint maps into. Drives the initial hypothesis set. */
export type SymptomFamily =
  | 'no_cooling'
  | 'insufficient_cooling'
  | 'no_heat'
  | 'insufficient_heat'
  | 'no_airflow'
  | 'unit_not_running'
  | 'short_cycling'
  | 'frozen_coil'
  | 'water_leak'
  | 'noise'
  | 'high_bill'
  | 'fault_code'
  | 'odor'
  | 'unknown';

/**
 * A discrete, observable fact. Findings are what the engine reasons over —
 * never raw numbers. `superheat = 34` is a measurement; `superheat_high` is a
 * finding, and it is only produced once the engine knows the metering device
 * and the target, so the finding already carries the interpretation.
 */
export interface Finding {
  key: string;
  label: string;
  /** True = the finding is present, false = explicitly ruled out by testing. */
  present: boolean;
  detail: string;
  /** 0..1 confidence that the observation is correct. */
  confidence: number;
  /** Which test or measurement produced this. */
  sourceTestId?: string;
  sourceMeasurementKeys?: string[];
  observedAt: string;
}

/** How strongly a finding argues for or against a hypothesis. */
export type Weight =
  | 'RULES_OUT'
  | 'STRONG_AGAINST'
  | 'AGAINST'
  | 'WEAK_AGAINST'
  | 'NEUTRAL'
  | 'WEAK_FOR'
  | 'FOR'
  | 'STRONG_FOR'
  | 'PATHOGNOMONIC';

/** Likelihood ratios. Deliberately coarse — false precision would be a lie. */
export const WEIGHT_LR: Record<Weight, number> = {
  RULES_OUT: 0.01,
  STRONG_AGAINST: 0.12,
  AGAINST: 0.33,
  WEAK_AGAINST: 0.65,
  NEUTRAL: 1,
  WEAK_FOR: 1.6,
  FOR: 3,
  STRONG_FOR: 7,
  PATHOGNOMONIC: 25,
};

export interface Hypothesis {
  id: string;
  label: string;
  category: DiagnosticCategory;
  /** One-line statement of what is actually wrong, in tech language. */
  statement: string;
  equipmentTypes: EquipmentType[] | 'ANY';
  families: SymptomFamily[];
  /**
   * Base rate among units presenting with these families, 0..1. These are
   * ordering priors from field experience, not measured statistics, and they
   * are overwhelmed by two or three real findings — which is the intent.
   */
  prior: number;
  /** Ids of tests that would confirm this beyond reasonable doubt. */
  confirmedBy: string[];
  /** Hypotheses that look the same until a specific test separates them. */
  confusedWith: Array<{ hypothesisId: string; separatedBy: string; how: string }>;
  safetyIds: string[];
  repair: {
    summary: string;
    parts: string[];
    /** Something that must be corrected or the new part fails the same way. */
    rootCauseWarning?: string;
  };
  /** Never conclude this without having run at least one of these. */
  requiresEvidence?: string[];
  /**
   * How each finding bears on this hypothesis. Absent keys are NEUTRAL.
   * Kept on the hypothesis rather than in a separate matrix so that adding a
   * failure mode is a single self-contained edit.
   */
  evidence: Record<string, Weight>;
}

export type TestKind =
  | 'MEASUREMENT'
  | 'OBSERVATION'
  | 'QUESTION'
  | 'INSPECTION'
  | 'PHOTO'
  | 'LOOKUP';

export interface DiagnosticTest {
  id: string;
  label: string;
  kind: TestKind;
  category: DiagnosticCategory;
  /** What the technician is told to do. Rendered under the hazard banner. */
  instruction: string;
  /** What a healthy system looks like, so the tech knows what they are seeing. */
  expected: string;
  /** Findings this test can produce. Used for expected-information-gain. */
  yields: string[];
  /** Structured measurement keys the UI should open a form for. */
  collects: string[];
  /** For QUESTION tests: the choices offered. */
  options?: Array<{ value: string; label: string; findings: string[] }>;
  equipmentTypes: EquipmentType[] | 'ANY';
  /** Minutes of technician time, used to prefer cheap discriminating tests. */
  costMinutes: number;
  /** Extra reluctance for tests that risk equipment or the tech. 1 = none. */
  riskFactor: number;
  hazardIds: string[];
  /** Links to a DiagnosticProcedure row for the long-form write-up. */
  procedureSlug?: string;
  /** Do not offer this test until these findings are established. */
  requires?: string[];
  /** Do not offer this test if any of these findings is present. */
  blockedBy?: string[];
  /**
   * Tests that must have been run first. This encodes trade sequencing rules
   * that are not derivable from information gain — above all "test the run
   * capacitor before you go anywhere near condemning the compressor", which is
   * the most expensive avoidable misdiagnosis in residential service.
   */
  prerequisiteTestIds?: string[];
}

export interface HypothesisScore {
  hypothesisId: string;
  label: string;
  statement: string;
  category: DiagnosticCategory;
  prior: number;
  posterior: number;
  /** Findings that moved this hypothesis, most influential first. */
  support: Array<{ findingKey: string; label: string; weight: Weight; lr: number }>;
  ruledOut: boolean;
  ruledOutReason?: string;
}

export interface PlannedTest {
  test: DiagnosticTest;
  /** Expected reduction in entropy over the hypothesis set, in bits. */
  expectedInfoGainBits: number;
  /** Info gain adjusted for time and risk. The actual ranking key. */
  score: number;
  /** Plain-language reason this test is next, shown to the technician. */
  rationale: string;
  /** The hypotheses this test is trying to separate. */
  separates: string[];
}

export type EnginePhase =
  | 'INTAKE'
  | 'TRIAGE'
  | 'TESTING'
  | 'CONFIRMING'
  | 'DIAGNOSED'
  | 'ABANDONED';

export interface EngineContext {
  equipmentType: EquipmentType;
  families: SymptomFamily[];
  refrigerant?: string | null;
  meteringDevice?: 'TXV' | 'EEV' | 'FIXED_ORIFICE' | 'CAPILLARY' | 'UNKNOWN';
  mode?: 'COOLING' | 'HEATING' | 'DEFROST' | 'IDLE' | 'UNKNOWN';
  manufacturer?: string | null;
  modelNumber?: string | null;
  controlBoard?: string | null;
  faultCode?: string | null;
  highEfficiency?: boolean | null;
  altitudeFt?: number | null;
}

/** Everything needed to resume a session. Persisted as JSON on the session row. */
export interface EngineState {
  version: string;
  phase: EnginePhase;
  context: EngineContext;
  findings: Finding[];
  /** Raw measurements keyed by EvidenceKey. */
  measurements: Record<string, { value: number | null; text?: string | null; unit?: string | null; at: string; source: string }>;
  /** Test ids already asked, so the engine never repeats itself. */
  askedTestIds: string[];
  /** Test ids the technician explicitly could not or would not run. */
  skippedTestIds: string[];
  /** Hypothesis ids eliminated, with why. */
  eliminated: Array<{ hypothesisId: string; reason: string }>;
  /** Fault codes resolved from the knowledge base during this session. */
  faultCodeRefs: Array<{ faultCodeId: string; code: string; manufacturer: string; scoped: boolean }>;
  /** Knowledge-base chunks cited so far, for the report's source list. */
  citations: Array<{ documentId: string; documentTitle: string; page?: number | null; snippet: string }>;
  conclusion?: Conclusion | null;
  startedAt: string;
  updatedAt: string;
}

export interface Conclusion {
  hypothesisId: string;
  label: string;
  statement: string;
  confidence: number;
  /** Why the engine believes this, in the order the evidence arrived. */
  evidence: Array<{ findingKey: string; label: string; detail: string }>;
  /** What was considered and eliminated — a report reviewer wants this. */
  ruledOut: Array<{ label: string; reason: string }>;
  repair: Hypothesis['repair'];
  safetyIds: string[];
  /** Set when the engine concluded with residual uncertainty. */
  caveats: string[];
}

export const ENGINE_VERSION = '1.0.0';

/** Posterior a hypothesis must reach before the engine will conclude. */
export const CONCLUSION_THRESHOLD = 0.62;

/**
 * Even at high confidence the engine will not conclude while a cheap test
 * remains that would meaningfully change the ranking. This is the guard
 * against premature condemnation.
 */
export const MIN_INFO_GAIN_TO_KEEP_TESTING = 0.12;
