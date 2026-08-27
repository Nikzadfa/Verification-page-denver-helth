/**
 * Wire format for the engine view.
 *
 * The full EngineState carries every finding, every likelihood ratio and the
 * whole hypothesis tail. The client needs the current step, the ranking worth
 * showing, and the derived values — sending the rest would bloat every
 * response on a phone with one bar of signal.
 */

import type { EngineView } from '@/lib/engine/session';

export interface SerializedView {
  phase: string;
  entropyBits: number;
  stopReason: string;
  nextTest: {
    id: string;
    label: string;
    kind: string;
    category: string;
    instruction: string;
    expected: string;
    rationale: string;
    separates: string[];
    costMinutes: number;
    collects: string[];
    options: Array<{ value: string; label: string }> | null;
    hazardIds: string[];
    procedureSlug: string | null;
  } | null;
  ranked: Array<{
    id: string;
    label: string;
    statement: string;
    category: string;
    posterior: number;
    support: Array<{ findingKey: string; label: string; weight: string }>;
  }>;
  derived: EngineView['derivedValues'];
  hazards: Array<{ id: string; level: string; title: string; warning: string; precautions: string[] }>;
  differential: { a: string; b: string; how: string | null } | null;
  conclusion: EngineView['conclusion'];
  missingReadings: EngineView['missingReadings'];
  notes: string[];
  verifyNotes: string[];
  findings: Array<{ key: string; label: string; present: boolean; detail: string; confidence: number }>;
}

export function serializeView(view: EngineView): SerializedView {
  return {
    phase: view.state.phase,
    entropyBits: view.entropyBits,
    stopReason: view.stopReason,
    nextTest: view.nextTest
      ? {
          id: view.nextTest.test.id,
          label: view.nextTest.test.label,
          kind: view.nextTest.test.kind,
          category: view.nextTest.test.category,
          instruction: view.nextTest.test.instruction,
          expected: view.nextTest.test.expected,
          rationale: view.nextTest.rationale,
          separates: view.nextTest.separates,
          costMinutes: view.nextTest.test.costMinutes,
          collects: view.nextTest.test.collects,
          options:
            view.nextTest.test.options?.map((o) => ({ value: o.value, label: o.label })) ?? null,
          hazardIds: view.nextTest.test.hazardIds,
          procedureSlug: view.nextTest.test.procedureSlug ?? null,
        }
      : null,
    ranked: view.ranked.map((r) => ({
      id: r.hypothesisId,
      label: r.label,
      statement: r.statement,
      category: r.category,
      posterior: r.posterior,
      support: r.support.map((s) => ({
        findingKey: s.findingKey,
        label: s.label,
        weight: s.weight,
      })),
    })),
    derived: view.derivedValues,
    hazards: view.hazards.map((h) => ({
      id: h.id,
      level: h.level,
      title: h.title,
      warning: h.warning,
      precautions: h.precautions,
    })),
    differential: view.differential
      ? {
          a: view.differential.a.label,
          b: view.differential.b.label,
          how: view.differential.how ?? null,
        }
      : null,
    conclusion: view.conclusion,
    missingReadings: view.missingReadings,
    notes: view.notes,
    verifyNotes: view.verifyNotes,
    findings: view.state.findings
      .filter((f) => f.present)
      .map((f) => ({
        key: f.key,
        label: f.label,
        present: f.present,
        detail: f.detail,
        confidence: f.confidence,
      })),
  };
}
