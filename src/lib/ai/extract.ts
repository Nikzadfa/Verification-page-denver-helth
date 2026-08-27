/**
 * Free-text and voice extraction.
 *
 * Two passes, in this order:
 *
 *   1. A deterministic parser that handles the phrasing technicians actually
 *      use ("410a, suction 118, liquid 325, supply 68, return 78"). This is
 *      the common case and it costs nothing, works offline, and never
 *      hallucinates a reading.
 *
 *   2. The model, for anything the parser did not catch.
 *
 * The deterministic pass runs first on purpose. A voice note that is just a
 * list of readings — which is most of them — should never depend on a network
 * call succeeding while someone is standing on a roof.
 */

import { MEASUREMENTS, checkRange } from '@/lib/engine/measurements';
import { normalizeRefrigerantId } from '@/lib/hvac/refrigerants';
import { EXTRACTOR_SYSTEM } from './prompts';
import { callModel, isAiConfigured } from './provider';

export interface ExtractedMeasurement {
  key: string;
  value: number | null;
  text: string | null;
  unit: string | null;
  /** Which phrase in the input produced this, so the tech can check it. */
  evidence: string;
  confidence: number;
}

export interface ExtractionResult {
  measurements: ExtractedMeasurement[];
  /** Things stated as observations, mapped to engine finding keys. */
  findings: Array<{ key: string; present: boolean; detail: string; confidence: number }>;
  /** Opinions, kept out of the evidence set on purpose. */
  technicianOpinion: string[];
  /** Numbers we could not confidently attach to a reading. */
  ambiguous: Array<{ text: string; why: string }>;
  warnings: string[];
  usedModel: boolean;
}

/** Build the alias index once — it is static. */
const ALIAS_INDEX: Array<{ key: string; alias: string; unit: string | null }> = MEASUREMENTS.flatMap(
  (m) => [
    ...m.aliases.map((alias) => ({ key: m.key, alias: alias.toLowerCase(), unit: m.unit })),
    { key: m.key, alias: m.label.toLowerCase(), unit: m.unit },
  ],
).sort((a, b) => b.alias.length - a.alias.length); // longest alias wins

const NUMBER = String.raw`(-?\d+(?:\.\d+)?)`;

/**
 * Deterministic pass. Looks for `<alias> <number>` and `<number> <alias>`
 * with optional filler words and units between them.
 */
export function extractDeterministic(input: string): ExtractionResult {
  const text = ' ' + input.toLowerCase().replace(/[,;]/g, ' , ').replace(/\s+/g, ' ') + ' ';
  const measurements: ExtractedMeasurement[] = [];
  const warnings: string[] = [];
  const claimed = new Set<string>();

  // Refrigerant is a special case: it is named, not numbered.
  const refrigerantMatch = input.match(/\b(r[\s-]?(?:22|32|134a?|404a?|407c?|410a?|448a?|449a?|454b?))\b/i);
  if (refrigerantMatch) {
    const id = normalizeRefrigerantId(refrigerantMatch[1]!);
    if (id) {
      measurements.push({
        key: 'refrigerant',
        value: null,
        text: id,
        unit: null,
        evidence: refrigerantMatch[0],
        confidence: 0.95,
      });
      claimed.add('refrigerant');
    }
  }

  const meteringMatch = input.match(/\b(txv|eev|fixed orifice|piston|cap(?:illary)? tube)\b/i);
  if (meteringMatch) {
    const raw = meteringMatch[1]!.toLowerCase();
    const value = raw === 'txv' ? 'TXV' : raw === 'eev' ? 'EEV' : raw.startsWith('cap') ? 'CAPILLARY' : 'FIXED_ORIFICE';
    measurements.push({
      key: 'metering_device',
      value: null,
      text: value,
      unit: null,
      evidence: meteringMatch[0],
      confidence: 0.9,
    });
    claimed.add('metering_device');
  }

  for (const entry of ALIAS_INDEX) {
    if (claimed.has(entry.key)) continue;

    // "<alias> [is|of|at|=|:] <number> [unit]"
    const forward = new RegExp(
      String.raw`\b${escape(entry.alias)}\b[\s:=]*(?:is|of|at|reads?|was|were)?[\s:=]*${NUMBER}`,
      'i',
    );
    // "<number> [unit] <alias>"
    const backward = new RegExp(
      String.raw`${NUMBER}\s*(?:psig?|psi|degrees?|deg|°f?|volts?|v|amps?|a|microfarads?|uf|µf|ua|microamps?|inches? w\.?c\.?|iwc|"wc)?\s*(?:on the |of )?\b${escape(entry.alias)}\b`,
      'i',
    );

    const match = text.match(forward) ?? text.match(backward);
    if (!match) continue;

    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;

    const issue = checkRange(entry.key, value);
    if (issue) warnings.push(issue.message);

    measurements.push({
      key: entry.key,
      value,
      text: null,
      unit: entry.unit,
      evidence: match[0].trim(),
      confidence: 0.85,
    });
    claimed.add(entry.key);
  }

  return {
    measurements,
    findings: [],
    technicianOpinion: [],
    ambiguous: [],
    warnings,
    usedModel: false,
  };
}

const EXTRACT_TOOL = {
  name: 'record_readings',
  description:
    'Record only the readings and observations the technician actually stated. Omit anything not stated rather than supplying a typical value.',
  input_schema: {
    type: 'object',
    properties: {
      measurements: {
        type: 'array',
        description: 'Numeric or categorical readings explicitly stated.',
        items: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Measurement key. Must be one of the keys listed in the user message.',
            },
            value: { type: ['number', 'null'], description: 'Numeric value, or null for a categorical reading.' },
            text: { type: ['string', 'null'], description: 'Categorical value such as R-410A or TXV.' },
            unit: { type: ['string', 'null'] },
            evidence: { type: 'string', description: 'The exact phrase from the input this came from.' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['key', 'evidence', 'confidence'],
        },
      },
      findings: {
        type: 'array',
        description:
          'Observations stated as fact — "the filter was completely blocked", "the outdoor fan is not running". Only use finding keys listed in the user message.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            present: { type: 'boolean' },
            detail: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['key', 'present', 'detail', 'confidence'],
        },
      },
      technicianOpinion: {
        type: 'array',
        description:
          'Anything the technician offered as a guess, suspicion or conclusion rather than an observation. Kept separate so it never enters the evidence set.',
        items: { type: 'string' },
      },
      ambiguous: {
        type: 'array',
        description: 'Numbers or statements you could not confidently attach to a specific reading.',
        items: {
          type: 'object',
          properties: { text: { type: 'string' }, why: { type: 'string' } },
          required: ['text', 'why'],
        },
      },
    },
    required: ['measurements', 'findings', 'technicianOpinion', 'ambiguous'],
  },
};

export interface ExtractOptions {
  userId?: string | null;
  sessionId?: string | null;
  /** Finding keys the model is allowed to emit. */
  allowedFindingKeys: string[];
}

export async function extractStructured(
  input: string,
  options: ExtractOptions,
): Promise<ExtractionResult> {
  const deterministic = extractDeterministic(input);

  // If the input is nothing but readings the parser already caught, skip the
  // model entirely.
  const wordsOutsideReadings = input
    .replace(/[\d.,]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3).length;
  if (deterministic.measurements.length > 0 && wordsOutsideReadings <= deterministic.measurements.length + 2) {
    return deterministic;
  }

  if (!isAiConfigured()) {
    return {
      ...deterministic,
      warnings: [
        ...deterministic.warnings,
        ...(deterministic.measurements.length === 0
          ? ['Free-text understanding is unavailable (no model configured). Enter readings using the measurement forms.']
          : []),
      ],
    };
  }

  const keyList = MEASUREMENTS.map((m) => `${m.key} (${m.label}${m.unit ? `, ${m.unit}` : ''})`).join('\n');

  try {
    const result = await callModel<{
      measurements: ExtractedMeasurement[];
      findings: ExtractionResult['findings'];
      technicianOpinion: string[];
      ambiguous: ExtractionResult['ambiguous'];
    }>({
      tier: 'fast',
      operation: 'extract',
      system: EXTRACTOR_SYSTEM,
      maxTokens: 1500,
      temperature: 0,
      tool: EXTRACT_TOOL,
      userId: options.userId,
      sessionId: options.sessionId,
      messages: [
        {
          role: 'user',
          content: `MEASUREMENT KEYS YOU MAY USE:\n${keyList}\n\nFINDING KEYS YOU MAY USE:\n${options.allowedFindingKeys.join(', ')}\n\nALREADY EXTRACTED by the deterministic parser (do not repeat these):\n${
            deterministic.measurements.map((m) => `${m.key} = ${m.value ?? m.text}`).join('\n') || '(none)'
          }\n\nTECHNICIAN SAID:\n${input}`,
        },
      ],
    });

    const modelMeasurements = (result.structured?.measurements ?? []).filter(
      (m) => !deterministic.measurements.some((d) => d.key === m.key),
    );

    // Validate every key the model returned. A hallucinated key is dropped.
    const validKeys = new Set(MEASUREMENTS.map((m) => m.key));
    const validFindings = new Set(options.allowedFindingKeys);
    const warnings = [...deterministic.warnings];

    const accepted = modelMeasurements.filter((m) => {
      if (!validKeys.has(m.key)) return false;
      if (typeof m.value === 'number') {
        const issue = checkRange(m.key, m.value);
        if (issue) warnings.push(issue.message);
      }
      return true;
    });

    return {
      measurements: [...deterministic.measurements, ...accepted],
      findings: (result.structured?.findings ?? []).filter((f) => validFindings.has(f.key)),
      technicianOpinion: result.structured?.technicianOpinion ?? [],
      ambiguous: result.structured?.ambiguous ?? [],
      warnings,
      usedModel: true,
    };
  } catch {
    return {
      ...deterministic,
      warnings: [
        ...deterministic.warnings,
        'Free-text understanding failed, so only the readings the built-in parser recognized were captured. Check the measurement list and add anything missing.',
      ],
    };
  }
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
