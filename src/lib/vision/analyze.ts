/**
 * Photo analysis.
 *
 * The contract every field obeys: if it could not be read, it is null and
 * `legible` is false. There is no "best guess" path. A model number returned
 * with one character wrong is worse than no model number, because the
 * technician will act on it without questioning where it came from.
 *
 * Ambiguous character pairs (8/B, 0/O, 5/S, 1/I, 2/Z) are reported by position
 * rather than resolved, so the technician can glance at the label and settle it
 * in two seconds instead of ordering the wrong part.
 */

import { VISION_SYSTEM } from '@/lib/ai/prompts';
import { callModel, isAiConfigured } from '@/lib/ai/provider';
import type { PhotoKind } from '@prisma/client';

export interface VisionField<T = string> {
  value: T | null;
  legible: boolean;
  confidence: number;
  uncertainCharacters?: Array<{ position: number; couldBe: string[] }>;
  note?: string;
}

export interface VisionResult {
  photoKind: PhotoKind;
  manufacturer: VisionField;
  modelNumber: VisionField;
  serialNumber: VisionField;
  equipmentType: VisionField;
  refrigerant: VisionField;
  nameplateData: Array<{ label: string; value: string; legible: boolean }>;
  controlBoard: VisionField;
  /** Exactly what the display or LED shows, uninterpreted. */
  faultDisplay: VisionField;
  components: string[];
  wiringObservations: string[];
  /** True when the photo cannot support a reliable reading. */
  imageQualityProblem: boolean;
  qualityIssues: string[];
  /** Precise instructions for a better photo. */
  retakeGuidance: string[];
  summary: string;
}

const VISION_TOOL = {
  name: 'report_photo_reading',
  description:
    'Report only what is actually legible in the photograph. Any field that cannot be read character by character must be returned with value null and legible false.',
  input_schema: {
    type: 'object',
    properties: {
      photoKind: {
        type: 'string',
        enum: ['NAMEPLATE', 'CONTROL_BOARD', 'FAULT_DISPLAY', 'WIRING', 'COMPONENT', 'GAUGES', 'COIL', 'GENERAL'],
      },
      manufacturer: { $ref: '#/$defs/field' },
      modelNumber: { $ref: '#/$defs/field' },
      serialNumber: { $ref: '#/$defs/field' },
      equipmentType: { $ref: '#/$defs/field' },
      refrigerant: { $ref: '#/$defs/field' },
      controlBoard: { $ref: '#/$defs/field' },
      faultDisplay: { $ref: '#/$defs/field' },
      nameplateData: {
        type: 'array',
        description: 'Other labelled values visible on the plate — RLA, LRA, MCA, MOCP, charge weight, voltage.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            value: { type: 'string' },
            legible: { type: 'boolean' },
          },
          required: ['label', 'value', 'legible'],
        },
      },
      components: { type: 'array', items: { type: 'string' }, description: 'Components identifiable in the frame.' },
      wiringObservations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Observable wiring facts only — a disconnected lead, a burnt terminal. Not inferences about causation.',
      },
      imageQualityProblem: { type: 'boolean' },
      qualityIssues: { type: 'array', items: { type: 'string' } },
      retakeGuidance: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exactly what photo to take instead. Name the label, the angle, the lighting.',
      },
      summary: { type: 'string', description: 'One or two sentences on what this photo shows.' },
    },
    required: ['photoKind', 'imageQualityProblem', 'qualityIssues', 'retakeGuidance', 'summary'],
    $defs: {
      field: {
        type: 'object',
        properties: {
          value: { type: ['string', 'null'] },
          legible: { type: 'boolean' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          uncertainCharacters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                position: { type: 'integer' },
                couldBe: { type: 'array', items: { type: 'string' } },
              },
              required: ['position', 'couldBe'],
            },
          },
          note: { type: 'string' },
        },
        required: ['value', 'legible', 'confidence'],
      },
    },
  },
};

const EMPTY_FIELD: VisionField = { value: null, legible: false, confidence: 0 };

export interface AnalyzePhotoParams {
  base64: string;
  mediaType: string;
  /** What the technician was trying to capture, if they said. */
  intent?: PhotoKind | null;
  /** Context that helps disambiguate — known brand, equipment type. */
  context?: { manufacturer?: string | null; equipmentType?: string | null };
  userId?: string | null;
  sessionId?: string | null;
}

export async function analyzePhoto(params: AnalyzePhotoParams): Promise<VisionResult> {
  if (!isAiConfigured()) {
    return unavailableResult(
      'Photo analysis needs a configured vision model and none is set. Enter the model and serial number by hand from the rating plate.',
    );
  }

  const contextLines: string[] = [];
  if (params.intent) contextLines.push(`The technician says this is a photo of: ${params.intent}`);
  if (params.context?.manufacturer) contextLines.push(`Known manufacturer: ${params.context.manufacturer}`);
  if (params.context?.equipmentType) contextLines.push(`Known equipment type: ${params.context.equipmentType}`);
  contextLines.push(
    'Read only what is legible. Any field you cannot read character by character must come back null with legible false. List ambiguous characters by position rather than choosing between them.',
  );

  try {
    const result = await callModel<Partial<VisionResult>>({
      tier: 'vision',
      operation: 'vision',
      system: VISION_SYSTEM,
      maxTokens: 2000,
      temperature: 0,
      tool: VISION_TOOL,
      userId: params.userId,
      sessionId: params.sessionId,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: params.mediaType, data: params.base64 } },
            { type: 'text', text: contextLines.join('\n') },
          ],
        },
      ],
    });

    const s = result.structured ?? {};
    return normalize(s, params.intent ?? null);
  } catch (error) {
    return unavailableResult(
      `Photo analysis failed: ${error instanceof Error ? error.message : 'unknown error'}. Enter the model and serial number by hand.`,
    );
  }
}

/**
 * Defensive normalization. A field that claims a value while reporting
 * `legible: false` is contradictory, and the safe reading of a contradiction
 * is that the value is not trustworthy — so it is dropped.
 */
function normalize(s: Partial<VisionResult>, intent: PhotoKind | null): VisionResult {
  const field = (f: VisionField | undefined): VisionField => {
    if (!f) return { ...EMPTY_FIELD };
    if (!f.legible || f.value === null || f.value === undefined) {
      return { value: null, legible: false, confidence: 0, note: f.note, uncertainCharacters: f.uncertainCharacters };
    }
    const trimmed = String(f.value).trim();
    if (!trimmed || /^(unknown|n\/?a|illegible|not visible|unreadable)$/i.test(trimmed)) {
      return { value: null, legible: false, confidence: 0, note: f.note };
    }
    return {
      value: trimmed,
      legible: true,
      confidence: clamp(f.confidence ?? 0.5),
      uncertainCharacters: f.uncertainCharacters,
      note: f.note,
    };
  };

  const normalized: VisionResult = {
    photoKind: (s.photoKind as PhotoKind) ?? intent ?? 'GENERAL',
    manufacturer: field(s.manufacturer),
    modelNumber: field(s.modelNumber),
    serialNumber: field(s.serialNumber),
    equipmentType: field(s.equipmentType),
    refrigerant: field(s.refrigerant),
    controlBoard: field(s.controlBoard),
    faultDisplay: field(s.faultDisplay),
    nameplateData: (s.nameplateData ?? []).filter((n) => n.legible && n.value?.trim()),
    components: s.components ?? [],
    wiringObservations: s.wiringObservations ?? [],
    imageQualityProblem: Boolean(s.imageQualityProblem),
    qualityIssues: s.qualityIssues ?? [],
    retakeGuidance: s.retakeGuidance ?? [],
    summary: s.summary ?? 'No summary produced.',
  };

  // If nothing legible came back and the model did not flag a quality problem,
  // flag it ourselves and produce guidance — an empty result with no
  // explanation is the worst outcome for the technician.
  const anythingRead =
    normalized.modelNumber.legible ||
    normalized.serialNumber.legible ||
    normalized.manufacturer.legible ||
    normalized.faultDisplay.legible ||
    normalized.nameplateData.length > 0;

  if (!anythingRead && !normalized.imageQualityProblem) {
    normalized.imageQualityProblem = true;
    normalized.qualityIssues.push('Nothing on the label could be read with confidence.');
  }
  if (normalized.imageQualityProblem && normalized.retakeGuidance.length === 0) {
    normalized.retakeGuidance.push(
      'Fill the frame with the rating plate alone, holding the phone square to the label rather than at an angle.',
      'Wipe the label first — condenser plates are usually coated in dust and oil film.',
      'Light it from the side rather than with the flash. A direct flash on a foil label washes out the characters you need.',
      'If the plate is faded past reading, check for a duplicate label inside the control compartment door or on the compressor itself.',
    );
  }

  return normalized;
}

function unavailableResult(message: string): VisionResult {
  return {
    photoKind: 'GENERAL',
    manufacturer: { ...EMPTY_FIELD },
    modelNumber: { ...EMPTY_FIELD },
    serialNumber: { ...EMPTY_FIELD },
    equipmentType: { ...EMPTY_FIELD },
    refrigerant: { ...EMPTY_FIELD },
    controlBoard: { ...EMPTY_FIELD },
    faultDisplay: { ...EMPTY_FIELD },
    nameplateData: [],
    components: [],
    wiringObservations: [],
    imageQualityProblem: true,
    qualityIssues: [message],
    retakeGuidance: [],
    summary: message,
  };
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * A legible reading with uncertain characters is still useful, but it must be
 * rendered so the ambiguity is impossible to miss.
 */
export function renderWithUncertainty(field: VisionField): string {
  if (!field.legible || !field.value) return 'not legible';
  if (!field.uncertainCharacters?.length) return field.value;
  const chars = field.value.split('');
  for (const u of field.uncertainCharacters) {
    if (u.position >= 0 && u.position < chars.length) {
      chars[u.position] = `[${u.couldBe.join('/')}]`;
    }
  }
  return chars.join('');
}
