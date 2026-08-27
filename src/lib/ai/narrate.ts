/**
 * Narration: turn the engine's chosen step into something a technician reads
 * on a phone in a mechanical room.
 *
 * The engine's decision is passed in as fact. If the model is unavailable, the
 * fallback renders the same step from templates — degraded prose, identical
 * diagnostic behaviour. That is the point of the split: losing the model
 * should cost polish, not correctness.
 */

import type { EngineView } from '@/lib/engine/session';
import { getHypothesis } from '@/lib/engine/knowledge/hypotheses';
import { getHazards } from '@/lib/safety/hazards';
import { NARRATOR_SYSTEM } from './prompts';
import { callModel, isAiConfigured } from './provider';

export interface NarrationInput {
  view: EngineView;
  complaint: string;
  /** What the technician just said, so the reply reads as a reply. */
  lastTechnicianMessage?: string | null;
  /** Knowledge-base excerpts retrieved for this turn, if any. */
  citations?: Array<{ documentTitle: string; page?: number | null; snippet: string }>;
  userId?: string | null;
  sessionId?: string | null;
}

export interface Narration {
  text: string;
  usedModel: boolean;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

export async function narrate(input: NarrationInput): Promise<Narration> {
  if (!isAiConfigured()) return { text: fallbackNarration(input), usedModel: false };

  try {
    const result = await callModel({
      tier: 'reasoning',
      operation: 'narrate',
      system: NARRATOR_SYSTEM,
      maxTokens: 900,
      temperature: 0.3,
      userId: input.userId,
      sessionId: input.sessionId,
      messages: [{ role: 'user', content: buildContext(input) }],
    });
    const text = result.text.trim();
    if (!text) return { text: fallbackNarration(input), usedModel: false };
    return {
      text,
      usedModel: true,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
    };
  } catch {
    return { text: fallbackNarration(input), usedModel: false };
  }
}

function buildContext(input: NarrationInput): string {
  const { view } = input;
  const parts: string[] = [];

  parts.push(`COMPLAINT: ${input.complaint}`);
  parts.push(
    `EQUIPMENT: ${view.state.context.equipmentType}${
      view.state.context.manufacturer ? `, ${view.state.context.manufacturer}` : ''
    }${view.state.context.modelNumber ? ` ${view.state.context.modelNumber}` : ''}${
      view.state.context.refrigerant ? `, ${view.state.context.refrigerant}` : ''
    }${view.state.context.meteringDevice ? `, ${view.state.context.meteringDevice} metering` : ''}`,
  );

  if (input.lastTechnicianMessage) {
    parts.push(`TECHNICIAN JUST SAID: ${input.lastTechnicianMessage}`);
  }

  if (view.derivedValues.length) {
    parts.push(
      'ENGINE DERIVED THESE VALUES:\n' +
        view.derivedValues
          .map(
            (d) =>
              `- ${d.label}: ${d.value ?? 'n/a'} ${d.unit} [${d.severity}]${
                d.target ? ` (expected ${d.target.low}–${d.target.high}, basis: ${d.target.basis})` : ''
              }${d.mustVerify ? ' — CONVERTED FROM PRESSURE, tell the tech to confirm against their P/T chart if marginal' : ''}`,
          )
          .join('\n'),
    );
  }

  const criticals = view.state.findings.filter(
    (f) => f.present && ['floodback_risk', 'discharge_temp_high', 'motor_locked_rotor', 'voltage_imbalance', 'rollout_tripped', 'superheat_negative'].includes(f.key),
  );
  if (criticals.length) {
    parts.push(
      'CRITICAL — LEAD WITH THIS AND SAY TO STOP THE EQUIPMENT:\n' +
        criticals.map((f) => `- ${f.detail}`).join('\n'),
    );
  }

  if (view.ranked.length) {
    parts.push(
      'CURRENT RANKING (internal — do not quote the percentages):\n' +
        view.ranked
          .map((r) => `- ${r.label}: ${Math.round(r.posterior * 100)}%`)
          .join('\n'),
    );
  }

  if (view.differential?.how) {
    parts.push(
      `THE TWO LEADING EXPLANATIONS ARE CLOSE. What separates them: ${view.differential.how}`,
    );
  }

  if (view.conclusion) {
    const h = getHypothesis(view.conclusion.hypothesisId);
    parts.push(
      `THE ENGINE HAS REACHED A CONCLUSION. Present it as the diagnosis:\n` +
        `Diagnosis: ${view.conclusion.label}\n` +
        `What it means: ${view.conclusion.statement}\n` +
        `Confidence: ${Math.round(view.conclusion.confidence * 100)}%\n` +
        `Evidence, in the order it came in:\n${view.conclusion.evidence.map((e) => `- ${e.label}: ${e.detail}`).join('\n')}\n` +
        `Repair: ${view.conclusion.repair.summary}\n` +
        (h?.repair.rootCauseWarning ? `Root cause the tech must also address: ${h.repair.rootCauseWarning}\n` : '') +
        (view.conclusion.caveats.length ? `Caveats to state plainly:\n${view.conclusion.caveats.map((c) => `- ${c}`).join('\n')}` : ''),
    );
  } else if (view.nextTest) {
    const t = view.nextTest.test;
    parts.push(
      `THE ENGINE SELECTED THIS TEST. Write it up. Do not substitute a different test.\n` +
        `Test: ${t.label}\n` +
        `Instruction: ${t.instruction}\n` +
        `Expected: ${t.expected}\n` +
        `Why this one: ${input.view.nextTest!.rationale}\n` +
        `It separates: ${input.view.nextTest!.separates.join(' vs ')}` +
        (t.options?.length
          ? `\nThe technician will pick one of: ${t.options.map((o) => o.label).join(' | ')}`
          : ''),
    );

    const hazards = getHazards(t.hazardIds);
    if (hazards.length) {
      parts.push(
        'SAFETY — put this before the instruction, in your own words:\n' +
          hazards.map((h) => `- [${h.level}] ${h.title}: ${h.warning} ${h.precautions[0] ?? ''}`).join('\n'),
      );
    }
  } else {
    parts.push(
      `NO TEST SELECTED. The engine says: ${view.stopReason}. Explain what is still needed.`,
    );
  }

  if (view.missingReadings.length) {
    parts.push(
      'READINGS THAT WOULD HELP (do not ask for all of them — the selected test comes first):\n' +
        view.missingReadings.slice(0, 3).map((m) => `- ${m.label}: ${m.why}`).join('\n'),
    );
  }

  if (view.notes.length) parts.push('NOTES TO WORK IN IF RELEVANT:\n' + view.notes.join('\n'));

  if (input.citations?.length) {
    parts.push(
      'KNOWLEDGE BASE EXCERPTS — cite these by title and page when you use them:\n' +
        input.citations
          .map((c) => `[${c.documentTitle}${c.page ? `, p.${c.page}` : ''}] ${c.snippet}`)
          .join('\n---\n'),
    );
  }

  return parts.join('\n\n');
}

/**
 * Template fallback. Deliberately complete rather than apologetic — a
 * technician with no model access still gets the correct next step.
 */
export function fallbackNarration(input: NarrationInput): string {
  const { view } = input;
  const lines: string[] = [];

  const criticals = view.state.findings.filter(
    (f) => f.present && ['floodback_risk', 'discharge_temp_high', 'motor_locked_rotor', 'superheat_negative'].includes(f.key),
  );
  for (const c of criticals) {
    lines.push(`STOP — ${c.detail}`);
    lines.push('');
  }

  const abnormal = view.derivedValues.filter((d) => d.severity !== 'NORMAL' && d.value !== null);
  if (abnormal.length) {
    lines.push('What the last readings show:');
    for (const d of abnormal) {
      lines.push(
        `- ${d.label}: ${d.value} ${d.unit}${d.target ? ` against ${d.target.low}–${d.target.high}` : ''} — ${d.severity.toLowerCase()}.`,
      );
    }
    lines.push('');
  }

  if (view.conclusion) {
    lines.push(`Diagnosis: ${view.conclusion.label}`);
    lines.push(view.conclusion.statement);
    lines.push('');
    lines.push('Evidence:');
    for (const e of view.conclusion.evidence.slice(0, 5)) lines.push(`- ${e.label}${e.detail ? `: ${e.detail}` : ''}`);
    lines.push('');
    lines.push(`Repair: ${view.conclusion.repair.summary}`);
    if (view.conclusion.repair.rootCauseWarning) lines.push(view.conclusion.repair.rootCauseWarning);
    for (const c of view.conclusion.caveats) lines.push(c);
    return lines.join('\n');
  }

  if (view.nextTest) {
    const t = view.nextTest.test;
    const hazards = getHazards(t.hazardIds);
    if (hazards.length) {
      lines.push(`Before you start — ${hazards[0]!.title}: ${hazards[0]!.warning}`);
      lines.push('');
    }
    lines.push(`Next: ${t.label}`);
    lines.push(t.instruction);
    lines.push('');
    lines.push(`What normal looks like: ${t.expected}`);
    lines.push(`Why this one: ${view.nextTest.rationale}`);
    return lines.join('\n');
  }

  lines.push(view.stopReason);
  return lines.join('\n');
}
