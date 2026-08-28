/**
 * Bayesian ranking over the hypothesis set.
 *
 * P(H | findings) ∝ P(H) * Π LR(finding | H)
 *
 * Likelihood ratios are the coarse buckets in WEIGHT_LR, scaled by the
 * technician's confidence in the observation, so a reading someone is unsure
 * about moves the ranking less than one they are certain about. A finding
 * recorded as *absent* inverts its ratio — establishing that the filter is
 * clean has to argue against the dirty-filter hypothesis, or the engine would
 * only ever learn from positive results.
 *
 * All arithmetic is in log space. A PATHOGNOMONIC finding on a rare hypothesis
 * would otherwise underflow before it could be normalized.
 */

import {
  type Finding,
  type Hypothesis,
  type HypothesisScore,
  WEIGHT_LR,
  type Weight,
} from './types';
import { HYPOTHESES } from './knowledge/hypotheses';
import { findingLabel } from './knowledge/findings';
import type { EquipmentType } from '@prisma/client';
import type { SymptomFamily } from './types';

export interface RankOptions {
  equipmentType: EquipmentType;
  families: SymptomFamily[];
  /** Hypothesis ids eliminated by the technician or by a definitive test. */
  eliminated?: string[];
  /** Fault-code lookups boost the hypotheses a code implicates. */
  faultCodeHypotheses?: string[];
}

/** Hypotheses that can apply given the equipment and the complaint. */
export function candidateHypotheses(opts: RankOptions): Hypothesis[] {
  const eliminated = new Set(opts.eliminated ?? []);
  return HYPOTHESES.filter((h) => {
    if (eliminated.has(h.id)) return false;
    if (h.equipmentTypes !== 'ANY' && !h.equipmentTypes.includes(opts.equipmentType)) {
      // UNKNOWN equipment must not silently drop equipment-specific failures;
      // we would rather rank them and then ask what the equipment is.
      if (opts.equipmentType !== 'UNKNOWN') return false;
    }
    if (opts.families.length === 0) return true;
    return opts.families.some((fam) => h.families.includes(fam));
  });
}

/**
 * Scale a likelihood ratio toward 1 as confidence falls. At confidence 1 the
 * full ratio applies; at confidence 0 the finding says nothing.
 */
function scaleLr(lr: number, confidence: number): number {
  const c = Math.min(1, Math.max(0, confidence));
  return Math.exp(Math.log(lr) * c);
}

/** The likelihood ratio for a finding that was tested and found ABSENT. */
function invertLr(lr: number): number {
  // A finding that is strongly FOR a hypothesis, when established absent,
  // argues against it — but not with the same force, because most findings
  // are not universally present even when the hypothesis is true.
  if (lr === 1) return 1;
  return 1 / Math.pow(lr, 0.55);
}

export function rankHypotheses(findings: Finding[], opts: RankOptions): HypothesisScore[] {
  const candidates = candidateHypotheses(opts);
  const codeBoost = new Set(opts.faultCodeHypotheses ?? []);

  const scored = candidates.map((h) => {
    let logOdds = Math.log(Math.max(h.prior, 1e-6));
    const support: HypothesisScore['support'] = [];
    let ruledOut = false;
    let ruledOutReason: string | undefined;

    if (codeBoost.has(h.id)) {
      logOdds += Math.log(WEIGHT_LR.FOR);
      support.push({
        findingKey: 'fault_code_present',
        label: 'Fault code implicates this failure',
        weight: 'FOR',
        lr: WEIGHT_LR.FOR,
      });
    }

    for (const finding of findings) {
      const weight = h.evidence[finding.key] as Weight | undefined;
      if (!weight || weight === 'NEUTRAL') continue;

      const baseLr = WEIGHT_LR[weight];

      if (finding.present) {
        if (weight === 'RULES_OUT' && finding.confidence >= 0.7) {
          ruledOut = true;
          ruledOutReason = `${findingLabel(finding.key)} is incompatible with this. ${finding.detail}`;
        }
        const lr = scaleLr(baseLr, finding.confidence);
        logOdds += Math.log(lr);
        support.push({ findingKey: finding.key, label: findingLabel(finding.key), weight, lr });
      } else {
        // The finding was looked for and established absent.
        const lr = scaleLr(invertLr(baseLr), finding.confidence);
        logOdds += Math.log(lr);
        if (Math.abs(Math.log(lr)) > 0.15) {
          support.push({
            findingKey: finding.key,
            label: `${findingLabel(finding.key)} — ruled out`,
            weight,
            lr,
          });
        }
      }
    }

    // A hypothesis that requires specific evidence cannot outrank the field
    // until at least one of those findings is actually present. This is the
    // structural guard against condemning a compressor on circumstantial
    // readings.
    if (h.requiresEvidence?.length) {
      const satisfied = h.requiresEvidence.some((key) =>
        findings.some((f) => f.key === key && f.present),
      );
      if (!satisfied) logOdds += Math.log(0.35);
    }

    support.sort((a, b) => Math.abs(Math.log(b.lr)) - Math.abs(Math.log(a.lr)));

    return {
      hypothesisId: h.id,
      label: h.label,
      statement: h.statement,
      category: h.category,
      prior: h.prior,
      logOdds,
      posterior: 0,
      support: support.slice(0, 6),
      ruledOut,
      ruledOutReason,
    };
  });

  const live = scored.filter((s) => !s.ruledOut);
  const maxLog = live.length ? Math.max(...live.map((s) => s.logOdds)) : 0;
  const total = live.reduce((acc, s) => acc + Math.exp(s.logOdds - maxLog), 0) || 1;

  for (const s of scored) {
    s.posterior = s.ruledOut ? 0 : Math.exp(s.logOdds - maxLog) / total;
  }

  return scored
    .map(({ logOdds: _logOdds, ...rest }) => rest)
    .sort((a, b) => b.posterior - a.posterior);
}

/** Shannon entropy over the posterior distribution, in bits. */
export function entropyBits(scores: HypothesisScore[]): number {
  let h = 0;
  for (const s of scores) {
    if (s.posterior > 1e-9) h -= s.posterior * Math.log2(s.posterior);
  }
  return h;
}

/**
 * P(finding present | hypothesis), derived from the marginal rate of the
 * finding and the likelihood ratio the hypothesis assigns it. Clamped away
 * from 0 and 1 so a single test can never produce infinite certainty.
 */
export function probabilityOfFinding(
  hypothesis: Hypothesis,
  findingKey: string,
  marginal: number,
): number {
  const weight = (hypothesis.evidence[findingKey] as Weight | undefined) ?? 'NEUTRAL';
  const lr = WEIGHT_LR[weight];
  // Odds form so the ratio composes correctly with the base rate.
  const baseOdds = marginal / (1 - marginal);
  const odds = baseOdds * lr;
  return Math.min(0.97, Math.max(0.02, odds / (1 + odds)));
}

/**
 * The two hypotheses the technician most needs separated, and the test that
 * does it — read straight from the `confusedWith` entries rather than inferred,
 * so the advice is the one a senior tech would actually give.
 */
export function differentialPair(
  scores: HypothesisScore[],
): { a: HypothesisScore; b: HypothesisScore; separatedBy?: string; how?: string } | null {
  const live = scores.filter((s) => !s.ruledOut && s.posterior > 0.05);
  if (live.length < 2) return null;
  const [a, b] = live as [HypothesisScore, HypothesisScore];
  // Only worth calling a differential when the top two are genuinely close.
  if (a.posterior - b.posterior > 0.35) return null;

  const ha = HYPOTHESES.find((h) => h.id === a.hypothesisId);
  const link = ha?.confusedWith.find((c) => c.hypothesisId === b.hypothesisId);
  if (link) return { a, b, separatedBy: link.separatedBy, how: link.how };

  const hb = HYPOTHESES.find((h) => h.id === b.hypothesisId);
  const reverse = hb?.confusedWith.find((c) => c.hypothesisId === a.hypothesisId);
  if (reverse) return { a, b, separatedBy: reverse.separatedBy, how: reverse.how };

  return { a, b };
}
