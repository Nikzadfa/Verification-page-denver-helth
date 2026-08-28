/**
 * LLM provider.
 *
 * The model is used for exactly three jobs in this product:
 *
 *   1. UNDERSTANDING  — turn what a technician typed or said into structured
 *                       measurements and findings.
 *   2. NARRATION      — put the engine's chosen step into readable prose.
 *   3. VISION         — read what is legible in a photo.
 *
 * It is never used to decide what to test next, to rank causes, or to reach a
 * diagnosis. Those come from src/lib/engine, deterministically. Keeping that
 * boundary is what makes the product auditable and what makes the AI Testing
 * Center meaningful — you can change the prompt without changing the
 * diagnostic behaviour, and change the engine and see it in every replay.
 *
 * All calls funnel through `callModel` so usage, cost and latency are recorded
 * on every request, including failures.
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';

export type ModelTier = 'reasoning' | 'fast' | 'vision';

export type AiOperation =
  | 'extract'
  | 'narrate'
  | 'vision'
  | 'rag'
  | 'intake'
  | 'answer'
  | 'eval'
  | 'decode';

/**
 * Per-million-token pricing used for the admin cost dashboard. These are
 * operator-editable in AppSetting; the values here are only the fallback when
 * nothing has been configured, and the dashboard labels the figure as an
 * estimate rather than a bill.
 */
const FALLBACK_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  default: { inputPerMTok: 3, outputPerMTok: 15 },
};

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiUnavailableError(
      'ANTHROPIC_API_KEY is not configured. The diagnostic engine still runs without it — ranking, next-test selection and conclusions are deterministic — but free-text understanding, narration and photo analysis are unavailable.',
    );
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function modelFor(tier: ModelTier): string {
  switch (tier) {
    case 'fast':
      return process.env.THERMORIVET_MODEL_FAST || 'claude-haiku-4-5-20251001';
    case 'vision':
      return process.env.THERMORIVET_MODEL_VISION || 'claude-fable-5';
    default:
      return process.env.THERMORIVET_MODEL_REASONING || 'claude-fable-5';
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: { type: 'base64'; media_type: string; data: string };
}

export interface CallModelParams {
  tier: ModelTier;
  operation: AiOperation;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string | ContentBlock[] }>;
  maxTokens?: number;
  temperature?: number;
  /** When supplied, the model must respond by calling this tool. */
  tool?: {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  };
  userId?: string | null;
  sessionId?: string | null;
}

export interface CallModelResult<T = unknown> {
  text: string;
  /** Populated when `tool` was supplied. */
  structured: T | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  stopReason: string | null;
}

export async function callModel<T = unknown>(params: CallModelParams): Promise<CallModelResult<T>> {
  const model = modelFor(params.tier);
  const started = Date.now();

  try {
    const anthropic = getClient();

    const response = await anthropic.messages.create({
      model,
      max_tokens: params.maxTokens ?? 2048,
      temperature: params.temperature ?? 0.2,
      system: params.system,
      messages: params.messages as Anthropic.MessageParam[],
      ...(params.tool
        ? {
            tools: [params.tool as Anthropic.Tool],
            tool_choice: { type: 'tool' as const, name: params.tool.name },
          }
        : {}),
    });

    const latencyMs = Date.now() - started;

    let text = '';
    let structured: T | null = null;
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
      if (block.type === 'tool_use' && block.name === params.tool?.name) {
        structured = block.input as T;
      }
    }

    await recordUsage({
      operation: params.operation,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs,
      ok: true,
      userId: params.userId ?? null,
      sessionId: params.sessionId ?? null,
    });

    return {
      text,
      structured,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs,
      stopReason: response.stop_reason ?? null,
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    await recordUsage({
      operation: params.operation,
      model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      userId: params.userId ?? null,
      sessionId: params.sessionId ?? null,
    });
    throw error;
  }
}

async function recordUsage(params: {
  operation: AiOperation;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  ok: boolean;
  error?: string;
  userId: string | null;
  sessionId: string | null;
}): Promise<void> {
  const pricing = FALLBACK_PRICING[params.model] ?? FALLBACK_PRICING.default!;
  const costCents =
    (params.inputTokens / 1_000_000) * pricing.inputPerMTok * 100 +
    (params.outputTokens / 1_000_000) * pricing.outputPerMTok * 100;

  // Usage accounting must never break a technician's diagnosis.
  await prisma.aiUsageEvent
    .create({
      data: {
        operation: params.operation,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costCents: Math.round(costCents * 10000) / 10000,
        latencyMs: params.latencyMs,
        ok: params.ok,
        error: params.error?.slice(0, 500) ?? null,
        userId: params.userId,
        sessionId: params.sessionId,
      },
    })
    .catch(() => undefined);
}
