/**
 * Next-best-test selection.
 *
 * The engine asks one question at a time, and it picks that question by
 * expected information gain rather than by walking a fixed list. For each
 * candidate test:
 *
 *   1. Enumerate the outcomes it can produce (each finding present, or none).
 *   2. For each outcome, compute P(outcome) = Σ_h P(h) · P(outcome | h).
 *   3. Compute the posterior the engine would hold after that outcome, and
 *      its entropy.
 *   4. Expected gain = H(now) − Σ_outcome P(outcome) · H(posterior | outcome).
 *
 * Then divide by a cost term so a 60-second check that separates two
 * hypotheses beats a 90-minute recovery that separates three. That single
 * division is what stops the assistant from opening with "recover the charge",
 * which is the behaviour that makes AI tools useless in the field.
 */

import {
  type DiagnosticTest,
  type EngineState,
  type Finding,
  type HypothesisScore,
  type PlannedTest,
} from './types';
import { TESTS } from './knowledge/tests';
import { HYPOTHESIS_MAP } from './knowledge/hypotheses';
import { marginalPrior } from './knowledge/findings';
import { entropyBits, probabilityOfFinding, rankHypotheses, type RankOptions } from './inference';

const MAX_OUTCOMES_PER_TEST = 8;

function isApplicable(test: DiagnosticTest, state: EngineState): boolean {
  if (state.askedTestIds.includes(test.id)) return false;
  if (state.skippedTestIds.includes(test.id)) return false;

  if (test.equipmentTypes !== 'ANY') {
    const t = state.context.equipmentType;
    if (t !== 'UNKNOWN' && !test.equipmentTypes.includes(t)) return false;
  }

  const present = new Set(state.findings.filter((f) => f.present).map((f) => f.key));
  if (test.requires?.length && !test.requires.some((r) => present.has(r))) return false;
  if (test.blockedBy?.length && test.blockedBy.some((b) => present.has(b))) return false;

  // Trade sequencing rules that information gain alone will not produce.
  if (test.prerequisiteTestIds?.length) {
    const done = new Set([...state.askedTestIds, ...state.skippedTestIds]);
    if (!test.prerequisiteTestIds.every((id) => done.has(id))) return false;
  }

  return true;
}

/**
 * Cost term. Time dominates, risk multiplies it, and there is a floor so a
 * near-free test cannot divide by something close to zero and win on a
 * rounding error.
 */
function costTerm(test: DiagnosticTest): number {
  return Math.max(1, Math.pow(test.costMinutes * test.riskFactor, 0.62));
}

interface Outcome {
  findingKeys: string[];
  probability: number;
}

/**
 * The mutually exclusive outcomes of a test. For a QUESTION with options, the
 * options are the outcomes. For a measurement, each yielded finding is treated
 * as one outcome plus a "nothing abnormal" outcome.
 */
function enumerateOutcomes(test: DiagnosticTest, scores: HypothesisScore[]): Outcome[] {
  const buckets: string[][] = test.options?.length
    ? test.options.map((o) => o.findings)
    : test.yields.slice(0, MAX_OUTCOMES_PER_TEST).map((k) => [k]);

  const withNone = test.options?.length ? buckets : [...buckets, []];

  const raw = withNone.map((findingKeys) => {
    let p = 0;
    for (const s of scores) {
      if (s.ruledOut || s.posterior <= 0) continue;
      const h = HYPOTHESIS_MAP[s.hypothesisId];
      if (!h) continue;
      if (findingKeys.length === 0) {
        // "None of the above" — probability that no listed finding shows up.
        let pNone = 1;
        for (const bucket of buckets) {
          for (const key of bucket) {
            pNone *= 1 - probabilityOfFinding(h, key, marginalPrior(key));
          }
        }
        p += s.posterior * pNone;
      } else {
        let pOutcome = 1;
        for (const key of findingKeys) {
          pOutcome *= probabilityOfFinding(h, key, marginalPrior(key));
        }
        p += s.posterior * pOutcome;
      }
    }
    return { findingKeys, probability: p };
  });

  const total = raw.reduce((a, o) => a + o.probability, 0);
  if (total <= 0) {
    const even = 1 / raw.length;
    return raw.map((o) => ({ ...o, probability: even }));
  }
  return raw.map((o) => ({ ...o, probability: o.probability / total }));
}

function hypotheticalFinding(key: string): Finding {
  return {
    key,
    label: key,
    present: true,
    detail: '',
    // Planning assumes a clean result; the actual observation carries the
    // technician's real confidence when it arrives.
    confidence: 0.85,
    observedAt: new Date().toISOString(),
  };
}

export interface PlanOptions extends RankOptions {
  /** Cap on how many ranked tests to return. */
  limit?: number;
}

export function planNextTests(
  state: EngineState,
  scores: HypothesisScore[],
  opts: PlanOptions,
): PlannedTest[] {
  const baseline = entropyBits(scores);
  /**
   * Tests are ranked on expected DECISIVENESS — how far the leading
   * hypothesis's probability moves — rather than on Shannon entropy.
   *
   * Entropy over the full distribution rewards a test that carves up the
   * low-probability tail just as much as one that settles the actual question.
   * In practice that sent the engine off measuring subcooling on a unit that
   * was humming and not turning, because subcooling touches many hypotheses,
   * while the run capacitor sat untested. Decisiveness is far less sensitive to
   * the tail and matches what the technician needs: get to an answer.
   *
   * Entropy is still computed and reported, because "how much did this test
   * actually tell us" is the right thing to show and the right thing for the
   * stopping rule to threshold on.
   */
  const baselineDecisiveness = decisiveness(scores);
  const applicable = TESTS.filter((t) => isApplicable(t, state));
  const planned: PlannedTest[] = [];

  /**
   * Confirming a hypothesis that already leads carries little information gain
   * by definition — the ranking barely moves. But the stopping rule refuses to
   * conclude without a confirming test, so without a correction the planner
   * would wander through progressively less relevant checks while never
   * running the one test that closes the case. Once a hypothesis is clearly in
   * front, its confirming tests get priority.
   */
  const leader = scores.find((s) => !s.ruledOut);
  const confirmingIds = new Set<string>(
    leader && leader.posterior >= 0.45
      ? (HYPOTHESIS_MAP[leader.hypothesisId]?.confirmedBy ?? [])
      : [],
  );

  for (const test of applicable) {
    const outcomes = enumerateOutcomes(test, scores);
    let expectedPosteriorEntropy = 0;
    let expectedDecisiveness = 0;

    for (const outcome of outcomes) {
      if (outcome.probability <= 1e-6) continue;
      const hypotheticalFindings = [
        ...state.findings,
        ...outcome.findingKeys.map(hypotheticalFinding),
      ];
      const posterior = rankHypotheses(hypotheticalFindings, opts);
      expectedPosteriorEntropy += outcome.probability * entropyBits(posterior);
      expectedDecisiveness += outcome.probability * decisiveness(posterior);
    }

    const gain = Math.max(0, baseline - expectedPosteriorEntropy);
    const decisivenessGain = Math.max(0, expectedDecisiveness - baselineDecisiveness);
    const confirming = confirmingIds.has(test.id);
    // The bonus is additive rather than multiplicative so it still lifts a
    // confirming test whose computed gain has collapsed to nearly zero.
    const score = (decisivenessGain + (confirming ? 0.25 : 0)) / costTerm(test);

    planned.push({
      test,
      expectedInfoGainBits: round3(gain),
      score: round4(score),
      rationale: confirming
        ? `${leader!.label} is clearly in front. This is the test that confirms it directly, rather than inferring it from the readings so far.`
        : buildRationale(test, scores, gain),
      separates: topSeparated(test, scores),
    });
  }

  planned.sort((a, b) => b.score - a.score);
  return planned.slice(0, opts.limit ?? 5);
}

/** Probability of the leading hypothesis — how close the engine is to an answer. */
function decisiveness(scores: HypothesisScore[]): number {
  let max = 0;
  for (const s of scores) {
    if (!s.ruledOut && s.posterior > max) max = s.posterior;
  }
  return max;
}

function topSeparated(test: DiagnosticTest, scores: HypothesisScore[]): string[] {
  const relevant = scores
    .filter((s) => !s.ruledOut && s.posterior > 0.04)
    .filter((s) => {
      const h = HYPOTHESIS_MAP[s.hypothesisId];
      if (!h) return false;
      return test.yields.some((k) => {
        const w = h.evidence[k];
        return w && w !== 'NEUTRAL';
      });
    })
    .slice(0, 3);
  return relevant.map((s) => s.label);
}

function buildRationale(
  test: DiagnosticTest,
  scores: HypothesisScore[],
  gain: number,
): string {
  const separated = topSeparated(test, scores);
  if (separated.length >= 2) {
    return `This separates ${separated[0]} from ${separated[1]}${
      separated[2] ? ` and ${separated[2]}` : ''
    }. Right now the readings fit both, and ${
      test.costMinutes <= 5 ? 'this takes about a minute' : `this takes about ${test.costMinutes} minutes`
    }.`;
  }
  if (separated.length === 1) {
    return `This is the check that either confirms or rules out ${separated[0]}.`;
  }
  if (gain < 0.05) {
    return 'Background information — it will not change the ranking much, but it fills in the report.';
  }
  return 'This narrows the field before committing to anything more invasive.';
}

/**
 * The engine's stopping rule.
 *
 * It will not conclude while a cheap test remains that would meaningfully
 * change the ranking, even at high confidence — that is the guard against
 * condemning a part on circumstantial evidence. It also refuses to conclude a
 * hypothesis whose `requiresEvidence` has not been satisfied, no matter how
 * high the posterior climbed.
 */
export function shouldConclude(
  scores: HypothesisScore[],
  planned: PlannedTest[],
  state: EngineState,
  threshold: number,
  minGain: number,
): { conclude: boolean; reason: string } {
  const top = scores.find((s) => !s.ruledOut);
  if (!top) return { conclude: false, reason: 'No hypothesis is still viable — re-examine the complaint and the equipment identification.' };

  if (top.posterior < threshold) {
    return {
      conclude: false,
      reason: `The leading explanation is at ${Math.round(top.posterior * 100)}%, below the ${Math.round(threshold * 100)}% the engine requires before naming a cause.`,
    };
  }

  const h = HYPOTHESIS_MAP[top.hypothesisId];
  if (h?.requiresEvidence?.length) {
    const satisfied = h.requiresEvidence.some((key) =>
      state.findings.some((f) => f.key === key && f.present),
    );
    if (!satisfied) {
      return {
        conclude: false,
        reason: `${h.label} cannot be concluded without direct evidence. Still needed: one of ${h.requiresEvidence.join(', ')}.`,
      };
    }
  }

  const bestRemaining = planned[0];
  if (bestRemaining && bestRemaining.expectedInfoGainBits >= minGain) {
    return {
      conclude: false,
      reason: `${bestRemaining.test.label} would still move the ranking by ${bestRemaining.expectedInfoGainBits.toFixed(2)} bits and takes about ${bestRemaining.test.costMinutes} minutes. Worth running before committing.`,
    };
  }

  const confirming = h?.confirmedBy ?? [];
  const ranAConfirmation = confirming.some((id) => state.askedTestIds.includes(id));
  if (confirming.length && !ranAConfirmation) {
    return {
      conclude: false,
      reason: `No confirming test has been run yet. ${confirming.join(' or ')} would confirm this directly.`,
    };
  }

  return { conclude: true, reason: 'Confidence threshold met, required evidence present, and no cheap test remains that would change the answer.' };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
